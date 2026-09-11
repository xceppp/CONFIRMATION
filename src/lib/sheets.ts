import { google } from "googleapis";
import {
  CONFIRMATIONS_HEADERS,
  ETUDIANTS_HEADERS,
  type StudentRow,
} from "./columns";

const SHEET_ETUDIANTS = "Etudiants";
const SHEET_CONFIRMATIONS = "Confirmations";

function getAuth() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !key || !sheetId) {
    throw new Error(
      "Configuration Google manquante (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID).",
    );
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return { auth, sheetId };
}

function getSheets() {
  const { auth, sheetId } = getAuth();
  return { sheets: google.sheets({ version: "v4", auth }), sheetId };
}

async function ensureSheetExists(
  sheets: ReturnType<typeof google.sheets>,
  sheetId: string,
  title: string,
  headers: readonly string[],
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === title);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [Array.from(headers)] },
    });
    return;
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${title}!1:1`,
  });
  const current = headerRes.data.values?.[0];
  if (!current || current.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [Array.from(headers)] },
    });
  }
}

export async function ensureWorkbookReady() {
  const { sheets, sheetId } = getSheets();
  await ensureSheetExists(sheets, sheetId, SHEET_ETUDIANTS, ETUDIANTS_HEADERS);
  await ensureSheetExists(
    sheets,
    sheetId,
    SHEET_CONFIRMATIONS,
    CONFIRMATIONS_HEADERS,
  );
}

function rowsToObjects(
  headers: string[],
  rows: string[][],
): StudentRow[] {
  return rows.map((row) => {
    const obj: StudentRow = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}

export async function getEtudiantsByCode(code: string): Promise<StudentRow[]> {
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_ETUDIANTS}!A:Z`,
  });
  const values = res.data.values || [];
  if (values.length < 2) return [];

  const headers = values[0].map(String);
  const codeIdx = headers.indexOf("Code");
  if (codeIdx < 0) return [];

  const needle = code.trim().toUpperCase();
  const matched = values
    .slice(1)
    .filter((row) => String(row[codeIdx] || "").trim().toUpperCase() === needle);

  return rowsToObjects(headers, matched.map((r) => r.map(String)));
}

export async function isAlreadyConfirmed(code: string): Promise<StudentRow | null> {
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_CONFIRMATIONS}!A:Z`,
  });
  const values = res.data.values || [];
  if (values.length < 2) return null;

  const headers = values[0].map(String);
  const codeIdx = headers.indexOf("Code");
  if (codeIdx < 0) return null;

  const needle = code.trim().toUpperCase();
  const row = values
    .slice(1)
    .find((r) => String(r[codeIdx] || "").trim().toUpperCase() === needle);

  if (!row) return null;
  return rowsToObjects(headers, [row.map(String)])[0];
}

export async function appendConfirmation(student: StudentRow): Promise<void> {
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const date = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" });
  const line = CONFIRMATIONS_HEADERS.map((h) =>
    h === "DateConfirmation" ? date : student[h] ?? "",
  );

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SHEET_CONFIRMATIONS}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [line] },
  });
}

export async function appendEtudiants(rows: StudentRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const values = rows.map((row) =>
    ETUDIANTS_HEADERS.map((h) => row[h] ?? ""),
  );

  const chunkSize = 500;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${SHEET_ETUDIANTS}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: chunk },
    });
  }

  return rows.length;
}

export async function getStats(): Promise<{
  etudiants: number;
  confirmations: number;
  parFiliere: Record<string, number>;
}> {
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();

  const [etudRes, confRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_ETUDIANTS}!A:B`,
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_CONFIRMATIONS}!A:B`,
    }),
  ]);

  const etudRows = (etudRes.data.values || []).slice(1);
  const confRows = (confRes.data.values || []).slice(1);
  const parFiliere: Record<string, number> = {};

  for (const row of etudRows) {
    const code = String(row[0] || "—");
    parFiliere[code] = (parFiliere[code] || 0) + 1;
  }

  return {
    etudiants: etudRows.length,
    confirmations: confRows.length,
    parFiliere,
  };
}

export async function listConfirmations(limit = 100): Promise<StudentRow[]> {
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_CONFIRMATIONS}!A:Z`,
  });
  const values = res.data.values || [];
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  const body = values.slice(1).map((r) => r.map(String)).reverse().slice(0, limit);
  return rowsToObjects(headers, body);
}
