import { google } from "googleapis";
import {
  AGENTS_HEADERS,
  CONFIRMATIONS_HEADERS,
  ETUDIANTS_HEADERS,
  type AgentRow,
  type StudentRow,
} from "./columns";
import { getFiliereByCode } from "./filieres";
import { sortConfirmationsByFiliereThenScore } from "./confirmations-export";

const SHEET_CONFIRMATIONS = "Confirmations";
/** Append-only mirror — never cleared by journal wipe. Used to repair lost rows. */
const SHEET_CONFIRMATIONS_AUDIT = "ConfirmationsAudit";
const SHEET_AGENTS = "Agents";
const LEGACY_ETUDIANTS = "Etudiants";
/** Tab name = filière code (DWM, FBA, …) */
export function filiereSheetTitle(code: string): string {
  return code.trim().toUpperCase();
}

/** In-memory index — search/confirm stay O(1) after first warm. */
type SheetCache = {
  etudiantsByCode: Map<string, StudentRow[]>;
  confirmationsByCode: Map<string, StudentRow>;
  agentsByName: Map<string, AgentRow>;
  agentsList: AgentRow[];
  etudiantCount: number;
  confirmationCount: number;
  parFiliere: Record<string, number>;
  confirmationList: StudentRow[];
  filiereSheets: string[];
};

let workbookReady = false;
let confirmationsHeadersSynced = false;
let sheetsClient: ReturnType<typeof google.sheets> | null = null;
let sheetIdCached: string | null = null;
let cache: SheetCache | null = null;
let warmPromise: Promise<SheetCache> | null = null;
let confReloadPromise: Promise<void> | null = null;
let studentsReloadPromise: Promise<void> | null = null;
let studentsFetchedAt = 0;
let confirmationsFetchedAt = 0;
const confirmingCodes = new Set<string>();
const STUDENTS_TTL_MS = 30_000;
/** Soft TTL — avoid hammering Sheets on every Massar lookup under load. */
const CONFIRMATIONS_TTL_MS = 5_000;

function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const status =
    e && typeof e === "object" && "code" in e
      ? Number((e as { code?: number }).code)
      : NaN;
  return (
    status === 429 ||
    /quota|rate limit|rateLimitExceeded|userRateLimitExceeded|Backend Error/i.test(
      msg,
    )
  );
}

async function withSheetsRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 6,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isQuotaError(e) || i === attempts - 1) {
        if (isQuotaError(e)) {
          throw new Error(
            "Google Sheets saturé (quota). Réessayez dans quelques secondes — la confirmation sera enregistrée.",
          );
        }
        throw e;
      }
      const wait = Math.min(8000, 400 * 2 ** i) + Math.floor(Math.random() * 250);
      console.warn(`[sheets] ${label} quota/retry ${i + 1}/${attempts} wait ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

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
  if (sheetsClient && sheetIdCached) {
    return { sheets: sheetsClient, sheetId: sheetIdCached };
  }
  const { auth, sheetId } = getAuth();
  sheetsClient = google.sheets({ version: "v4", auth });
  sheetIdCached = sheetId;
  return { sheets: sheetsClient, sheetId };
}

function normCode(code: string) {
  return code.trim().toUpperCase();
}

function rowsToObjects(headers: string[], rows: string[][]): StudentRow[] {
  return rows.map((row) => {
    const obj: StudentRow = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}

function emptyCache(): SheetCache {
  return {
    etudiantsByCode: new Map(),
    confirmationsByCode: new Map(),
    agentsByName: new Map(),
    agentsList: [],
    etudiantCount: 0,
    confirmationCount: 0,
    parFiliere: {},
    confirmationList: [],
    filiereSheets: [],
  };
}

function normName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function nameKey(name: string) {
  return normName(name).toLowerCase();
}

function buildAgentsIndex(values: string[][]): Pick<
  SheetCache,
  "agentsByName" | "agentsList"
> {
  const agentsByName = new Map<string, AgentRow>();
  const agentsList: AgentRow[] = [];
  if (values.length < 2) return { agentsByName, agentsList };

  const headers = values[0].map(String);
  const nomIdx = headers.indexOf("Nom");
  const passIdx = headers.indexOf("MotDePasse");
  if (nomIdx < 0) return { agentsByName, agentsList };

  for (const raw of values.slice(1)) {
    const nom = normName(String(raw[nomIdx] || ""));
    if (!nom) continue;
    const agent: AgentRow = {
      Nom: nom,
      MotDePasse: String(raw[passIdx >= 0 ? passIdx : -1] || ""),
    };
    agentsByName.set(nameKey(nom), agent);
    agentsList.push(agent);
  }

  agentsList.sort((a, b) => a.Nom.localeCompare(b.Nom, "fr"));
  return { agentsByName, agentsList };
}

function buildEtudiantsIndex(
  values: string[][],
  forcedFiliere?: { code: string; name: string },
): Pick<SheetCache, "etudiantsByCode" | "etudiantCount" | "parFiliere"> {
  const etudiantsByCode = new Map<string, StudentRow[]>();
  const parFiliere: Record<string, number> = {};
  if (values.length < 2) {
    return { etudiantsByCode, etudiantCount: 0, parFiliere };
  }

  const headers = values[0].map(String);
  const codeIdx = headers.indexOf("Code");
  const filiereIdx = headers.indexOf("FiliereCode");
  const body = values.slice(1);

  for (const raw of body) {
    const row = rowsToObjects(headers, [raw.map(String)])[0];
    if (forcedFiliere) {
      row.FiliereCode = forcedFiliere.code;
      row.Filiere = forcedFiliere.name;
    }
    const code = codeIdx >= 0 ? normCode(String(raw[codeIdx] || "")) : "";
    if (!code) continue;

    const list = etudiantsByCode.get(code);
    if (list) list.push(row);
    else etudiantsByCode.set(code, [row]);

    const fc =
      forcedFiliere?.code ||
      (filiereIdx >= 0 ? String(raw[filiereIdx] || "—") : row.FiliereCode || "—");
    parFiliere[fc] = (parFiliere[fc] || 0) + 1;
  }

  return { etudiantsByCode, etudiantCount: body.length, parFiliere };
}

function mergeEtudiantParts(
  parts: Pick<SheetCache, "etudiantsByCode" | "etudiantCount" | "parFiliere">[],
): Pick<SheetCache, "etudiantsByCode" | "etudiantCount" | "parFiliere"> {
  const etudiantsByCode = new Map<string, StudentRow[]>();
  const parFiliere: Record<string, number> = {};
  let etudiantCount = 0;

  for (const part of parts) {
    etudiantCount += part.etudiantCount;
    for (const [k, v] of Object.entries(part.parFiliere)) {
      parFiliere[k] = (parFiliere[k] || 0) + v;
    }
    for (const [code, rows] of part.etudiantsByCode) {
      const existing = etudiantsByCode.get(code);
      if (existing) existing.push(...rows);
      else etudiantsByCode.set(code, [...rows]);
    }
  }

  return { etudiantsByCode, etudiantCount, parFiliere };
}

function buildConfirmationsIndex(values: string[][]): Pick<
  SheetCache,
  "confirmationsByCode" | "confirmationCount" | "confirmationList"
> {
  const confirmationsByCode = new Map<string, StudentRow>();
  if (values.length < 2) {
    return {
      confirmationsByCode,
      confirmationCount: 0,
      confirmationList: [],
    };
  }

  const headers = values[0].map(String);
  const body = values.slice(1);
  const objects = rowsToObjects(
    headers,
    body.map((r) => r.map(String)),
  ).map(normalizeConfirmationRow);

  const uniqueList: StudentRow[] = [];
  for (const row of objects) {
    const code = normCode(row.CNE || row.Code || "");
    if (!code || confirmationsByCode.has(code)) continue;
    // First row for a CNE wins (blocks double confirm across agents).
    confirmationsByCode.set(code, row);
    uniqueList.push(row);
  }

  return {
    confirmationsByCode,
    confirmationCount: uniqueList.length,
    confirmationList: uniqueList,
  };
}

function dedupeConfirmationsByCne(rows: StudentRow[]): StudentRow[] {
  const seen = new Set<string>();
  const out: StudentRow[] = [];
  for (const row of rows.map(normalizeConfirmationRow)) {
    const code = normCode(row.CNE || row.Code || "");
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(row);
  }
  return out;
}

/** Normalize legacy wide rows + new slim CNE sheet into one shape. */
function normalizeConfirmationRow(row: StudentRow): StudentRow {
  const cne = normCode(row.CNE || row.Code || "");
  const nomComplet =
    String(row.NomComplet || "").trim() ||
    `${row.PrenomFr || ""} ${row.NomFr || ""}`.trim();
  const filiere = String(row.Filiere || row.FiliereCode || "").trim();
  return {
    CNE: cne,
    Code: cne,
    NomComplet: nomComplet,
    PrenomFr: row.PrenomFr || "",
    NomFr: row.NomFr || "",
    Filiere: filiere,
    FiliereCode: row.FiliereCode || "",
    Score: String(row.Score || "").trim(),
    Agent: row.Agent || "",
    DateConfirmation: row.DateConfirmation || "",
  };
}

function confirmationToSheetLine(row: StudentRow): string[] {
  const n = normalizeConfirmationRow(row);
  return [
    n.CNE,
    n.NomComplet,
    n.Filiere,
    n.Score,
    n.Agent || "",
    n.DateConfirmation || "",
  ];
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

  // Never touch header row if the sheet already has data rows —
  // header-only writes used to participate in wipe races under load.
  const probe = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${title}!A1:A3`,
  });
  const probeRows = probe.data.values || [];
  if (probeRows.length > 1) return;

  const current = (probeRows[0] || []).map(String);
  const expected = Array.from(headers);
  const same =
    current.length === expected.length &&
    expected.every((h, i) => current[i] === h);
  if (current.length === 0 || !same) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [expected] },
    });
  }
}

export async function ensureWorkbookReady() {
  if (workbookReady) return;
  const { sheets, sheetId } = getSheets();
  await Promise.all([
    ensureSheetExists(
      sheets,
      sheetId,
      SHEET_CONFIRMATIONS,
      CONFIRMATIONS_HEADERS,
    ),
    ensureSheetExists(
      sheets,
      sheetId,
      SHEET_CONFIRMATIONS_AUDIT,
      CONFIRMATIONS_HEADERS,
    ),
    ensureSheetExists(sheets, sheetId, SHEET_AGENTS, AGENTS_HEADERS),
  ]);
  workbookReady = true;
  confirmationsHeadersSynced = true;
}

/** Append one row; throws if Google did not actually write cells. */
async function appendSheetRow(
  title: string,
  line: string[],
  label: string,
  attempts = 8,
): Promise<void> {
  const { sheets, sheetId } = getSheets();
  const res = await withSheetsRetry(
    label,
    () =>
      sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${title}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [line] },
      }),
    attempts,
  );
  const updatedRows = Number(res.data.updates?.updatedRows || 0);
  const updatedCells = Number(res.data.updates?.updatedCells || 0);
  if (updatedRows < 1 && updatedCells < 1) {
    throw new Error(
      "Confirmation non écrite dans Google Sheets. Réessayez immédiatement.",
    );
  }
}

async function listSheetTitles(): Promise<string[]> {
  const { sheets, sheetId } = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  return (meta.data.sheets || [])
    .map((s) => s.properties?.title || "")
    .filter(Boolean);
}

function isFiliereSheetTitle(title: string): boolean {
  return Boolean(getFiliereByCode(title));
}

async function loadCacheFromSheets(): Promise<SheetCache> {
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const titles = await listSheetTitles();

  const filiereTitles = titles.filter(isFiliereSheetTitle);
  const hasLegacy = titles.includes(LEGACY_ETUDIANTS);

  const ranges = [
    ...filiereTitles.map((t) => `${t}!A:Z`),
    ...(hasLegacy ? [`${LEGACY_ETUDIANTS}!A:Z`] : []),
    `${SHEET_CONFIRMATIONS}!A:Z`,
    `${SHEET_AGENTS}!A:Z`,
  ];

  const batch = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges,
  });

  const valueRanges = batch.data.valueRanges || [];
  const etudParts: Pick<
    SheetCache,
    "etudiantsByCode" | "etudiantCount" | "parFiliere"
  >[] = [];

  let idx = 0;
  for (const title of filiereTitles) {
    const values = (valueRanges[idx++]?.values || []).map((r) =>
      r.map(String),
    );
    const filiere = getFiliereByCode(title)!;
    etudParts.push(
      buildEtudiantsIndex(values, { code: filiere.code, name: filiere.name }),
    );
  }
  if (hasLegacy) {
    const values = (valueRanges[idx++]?.values || []).map((r) =>
      r.map(String),
    );
    etudParts.push(buildEtudiantsIndex(values));
  }

  const confValues = (valueRanges[idx++]?.values || []).map((r) =>
    r.map(String),
  );
  const agentsValues = (valueRanges[idx++]?.values || []).map((r) =>
    r.map(String),
  );

  const etud = mergeEtudiantParts(etudParts);
  const conf = buildConfirmationsIndex(confValues);
  const agents = buildAgentsIndex(agentsValues);

  return {
    ...emptyCache(),
    ...etud,
    ...conf,
    ...agents,
    filiereSheets: filiereTitles.sort(),
  };
}

/** Load sheets once into RAM. Concurrent callers share the same promise. */
export async function getCache(): Promise<SheetCache> {
  if (cache) return cache;
  if (!warmPromise) {
    warmPromise = loadCacheFromSheets()
      .then((c) => {
        cache = c;
        return c;
      })
      .finally(() => {
        warmPromise = null;
      });
  }
  return warmPromise;
}

/** Force reload from Google (after external sheet edits). */
export async function invalidateCache(): Promise<void> {
  cache = null;
  warmPromise = null;
  confReloadPromise = null;
  studentsReloadPromise = null;
  studentsFetchedAt = 0;
  confirmationsFetchedAt = 0;
}

async function loadEtudiantsPartsFromSheets(): Promise<{
  etud: Pick<SheetCache, "etudiantsByCode" | "etudiantCount" | "parFiliere">;
  filiereSheets: string[];
  agents: Pick<SheetCache, "agentsByName" | "agentsList">;
}> {
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const titles = await listSheetTitles();
  const filiereTitles = titles.filter(isFiliereSheetTitle);
  const hasLegacy = titles.includes(LEGACY_ETUDIANTS);

  const ranges = [
    ...filiereTitles.map((t) => `${t}!A:Z`),
    ...(hasLegacy ? [`${LEGACY_ETUDIANTS}!A:Z`] : []),
    `${SHEET_AGENTS}!A:Z`,
  ];

  if (ranges.length === 1) {
    // Only Agents — no filière tabs yet
    const agentsRes = await withSheetsRetry("agents.get", () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${SHEET_AGENTS}!A:Z`,
      }),
    );
    return {
      etud: {
        etudiantsByCode: new Map(),
        etudiantCount: 0,
        parFiliere: {},
      },
      filiereSheets: [],
      agents: buildAgentsIndex(
        (agentsRes.data.values || []).map((r) => r.map(String)),
      ),
    };
  }

  const batch = await withSheetsRetry("students.batchGet", () =>
    sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges,
    }),
  );
  const valueRanges = batch.data.valueRanges || [];
  const etudParts: Pick<
    SheetCache,
    "etudiantsByCode" | "etudiantCount" | "parFiliere"
  >[] = [];

  let idx = 0;
  for (const title of filiereTitles) {
    const values = (valueRanges[idx++]?.values || []).map((r) =>
      r.map(String),
    );
    const filiere = getFiliereByCode(title)!;
    etudParts.push(
      buildEtudiantsIndex(values, { code: filiere.code, name: filiere.name }),
    );
  }
  if (hasLegacy) {
    const values = (valueRanges[idx++]?.values || []).map((r) =>
      r.map(String),
    );
    etudParts.push(buildEtudiantsIndex(values));
  }
  const agentsValues = (valueRanges[idx++]?.values || []).map((r) =>
    r.map(String),
  );

  return {
    etud: mergeEtudiantParts(etudParts),
    filiereSheets: filiereTitles.sort(),
    agents: buildAgentsIndex(agentsValues),
  };
}

/**
 * Reload filière student tabs (+ agents) from Google into RAM.
 * Fixes admin showing 0 after import on another Vercel instance.
 */
export async function refreshStudents(options?: {
  force?: boolean;
}): Promise<void> {
  const force = Boolean(options?.force);
  if (
    !force &&
    cache &&
    cache.etudiantCount > 0 &&
    Date.now() - studentsFetchedAt < STUDENTS_TTL_MS
  ) {
    return;
  }

  if (!studentsReloadPromise) {
    studentsReloadPromise = (async () => {
      const loaded = await loadEtudiantsPartsFromSheets();
      const c = await getCache();
      c.etudiantsByCode = loaded.etud.etudiantsByCode;
      c.etudiantCount = loaded.etud.etudiantCount;
      c.parFiliere = loaded.etud.parFiliere;
      c.filiereSheets = loaded.filiereSheets;
      c.agentsByName = loaded.agents.agentsByName;
      c.agentsList = loaded.agents.agentsList;
      studentsFetchedAt = Date.now();
    })().finally(() => {
      studentsReloadPromise = null;
    });
  }
  await studentsReloadPromise;
}

async function fetchConfirmationsIndex(): Promise<
  Pick<
    SheetCache,
    "confirmationsByCode" | "confirmationCount" | "confirmationList"
  >
> {
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_CONFIRMATIONS}!A:Z`,
  });
  return buildConfirmationsIndex(
    (res.data.values || []).map((r) => r.map(String)),
  );
}

/**
 * Reload Confirmations from Google Sheets into RAM.
 * Critical on Vercel: each serverless instance has its own memory —
 * Sheet is the shared source of truth across agents/admin.
 */
export async function refreshConfirmations(options?: {
  force?: boolean;
}): Promise<void> {
  const force = Boolean(options?.force);
  if (
    !force &&
    cache &&
    confirmationsFetchedAt > 0 &&
    Date.now() - confirmationsFetchedAt < CONFIRMATIONS_TTL_MS
  ) {
    return;
  }

  if (!confReloadPromise) {
    confReloadPromise = (async () => {
      await ensureWorkbookReady();
      const { sheets, sheetId } = getSheets();
      const res = await withSheetsRetry("confirmations.get", () =>
        sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `${SHEET_CONFIRMATIONS}!A:Z`,
        }),
      );
      const raw = (res.data.values || []).map((r) => r.map(String));
      const conf = buildConfirmationsIndex(raw);
      const c = await getCache();
      c.confirmationsByCode = conf.confirmationsByCode;
      c.confirmationCount = conf.confirmationCount;
      c.confirmationList = sortConfirmationsByFiliereThenScore(
        conf.confirmationList,
      );
      confirmationsFetchedAt = Date.now();
      // Never write to Confirmations from a refresh — append-only confirms only.
    })().finally(() => {
      confReloadPromise = null;
    });
  }
  await confReloadPromise;
}

function alreadyConfirmedMessage(row: StudentRow): string {
  const n = normalizeConfirmationRow(row);
  const filiere = n.Filiere || "?";
  const agent = n.Agent ? ` par l'agent « ${n.Agent} »` : "";
  const when = n.DateConfirmation ? ` (${n.DateConfirmation})` : "";
  return `Cet étudiant a déjà confirmé la filière « ${filiere} »${agent}${when}. Une seule confirmation est autorisée.`;
}

export async function getEtudiantsByCode(code: string): Promise<StudentRow[]> {
  const c = await getCache();
  // Empty cache after wipe/import on another instance → pull from Sheets.
  if (c.etudiantCount === 0) {
    await refreshStudents({ force: true });
  } else {
    await refreshStudents();
  }
  const latest = await getCache();
  return latest.etudiantsByCode.get(normCode(code)) ?? [];
}

/** Check Confirmations — soft TTL to spare quota; force on confirm write path. */
export async function isAlreadyConfirmed(
  code: string,
  options?: { force?: boolean },
): Promise<StudentRow | null> {
  await refreshConfirmations({ force: options?.force });
  const c = await getCache();
  return c.confirmationsByCode.get(normCode(code)) ?? null;
}

export async function appendConfirmation(
  student: StudentRow,
  agentName: string,
): Promise<void> {
  const needle = normCode(student.Code || "");
  if (!needle) throw new Error("Code Massar manquant.");
  const agent = String(agentName || "").trim();
  if (!agent) throw new Error("Nom de l'agent manquant.");

  if (confirmingCodes.has(needle)) {
    throw new Error("Confirmation déjà en cours pour cet étudiant.");
  }
  confirmingCodes.add(needle);

  try {
    // Soft check — if Sheets quota blocks the GET, still force the append.
    try {
      await refreshConfirmations({ force: false });
    } catch (e) {
      if (!isQuotaError(e)) throw e;
      console.warn("[sheets] confirm check skipped (quota) — forcing append");
    }
    let c = await getCache();
    const existing = c.confirmationsByCode.get(needle);
    if (existing) {
      throw new Error(alreadyConfirmedMessage(existing));
    }

    const saved = normalizeConfirmationRow({
      CNE: needle,
      Code: needle,
      NomComplet: `${student.PrenomFr || ""} ${student.NomFr || ""}`.trim(),
      PrenomFr: student.PrenomFr || "",
      NomFr: student.NomFr || "",
      Filiere: student.Filiere || student.FiliereCode || "",
      FiliereCode: student.FiliereCode || "",
      Score: student.Score || "",
      Agent: agent,
      DateConfirmation: new Date().toLocaleString("fr-FR", {
        timeZone: "Africa/Casablanca",
      }),
    });

    // Append only to Confirmations + Audit mirror. Never clear/rewrite.
    await ensureWorkbookReady();
    const line = confirmationToSheetLine(saved);
    await appendSheetRow(SHEET_CONFIRMATIONS, line, "confirmations.append", 8);
    // Best-effort second copy — never blocks success if audit lags under quota.
    try {
      await appendSheetRow(
        SHEET_CONFIRMATIONS_AUDIT,
        line,
        "confirmations.audit",
        4,
      );
    } catch (e) {
      console.warn(
        "[sheets] audit append failed (main Confirmations row is saved):",
        e instanceof Error ? e.message : e,
      );
    }

    // Optimistic RAM update — skip second full Sheet GET (quota).
    c = await getCache();
    if (!c.confirmationsByCode.has(needle)) {
      c.confirmationsByCode.set(needle, saved);
      c.confirmationList = sortConfirmationsByFiliereThenScore([
        ...c.confirmationList,
        saved,
      ]);
      c.confirmationCount = c.confirmationList.length;
    }
  } finally {
    confirmingCodes.delete(needle);
  }
}

export async function appendEtudiants(
  filiereCode: string,
  rows: StudentRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const filiere = getFiliereByCode(filiereCode);
  if (!filiere) throw new Error("Filière invalide.");

  const title = filiereSheetTitle(filiere.code);
  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  await ensureSheetExists(sheets, sheetId, title, ETUDIANTS_HEADERS);

  const values = rows.map((row) =>
    ETUDIANTS_HEADERS.map((h) => row[h] ?? ""),
  );

  // Larger chunks = fewer Google API round-trips (important on Vercel timeouts).
  const chunkSize = 2000;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: chunk },
    });
  }

  // Keep RAM index in sync — no full reload needed.
  const c = await getCache();
  if (!c.filiereSheets.includes(title)) {
    c.filiereSheets.push(title);
    c.filiereSheets.sort();
  }
  for (const row of rows) {
    const code = normCode(row.Code || "");
    if (!code) continue;
    const list = c.etudiantsByCode.get(code);
    if (list) list.push(row);
    else c.etudiantsByCode.set(code, [row]);

    const fc = row.FiliereCode || filiere.code;
    c.parFiliere[fc] = (c.parFiliere[fc] || 0) + 1;
    c.etudiantCount += 1;
  }
  studentsFetchedAt = Date.now();

  // Force other code paths / next stats read to re-sync from Sheets.
  // (Same instance already updated above.)
  return rows.length;
}

export async function getStats(): Promise<{
  etudiants: number;
  confirmations: number;
  parFiliere: Record<string, number>;
  filiereSheets: string[];
}> {
  await refreshStudents({ force: false });
  await refreshConfirmations({ force: false });
  const latest = await getCache();
  return {
    etudiants: latest.etudiantCount,
    confirmations: latest.confirmationCount,
    parFiliere: { ...latest.parFiliere },
    filiereSheets: [...latest.filiereSheets],
  };
}

export async function listConfirmations(limit?: number): Promise<StudentRow[]> {
  await refreshConfirmations();
  const c = await getCache();
  if (limit == null || limit <= 0) return [...c.confirmationList];
  return c.confirmationList.slice(0, limit);
}

/**
 * Wipe Confirmations log only.
 * DISABLED during confirmation day — refuse so nobody can wipe live data.
 * ConfirmationsAudit is never cleared by this function.
 */
export async function clearConfirmationsLog(): Promise<number> {
  throw new Error(
    "Effacement du journal désactivé pendant les confirmations. Aucune donnée n'a été touchée.",
  );
}

/** Noms seuls — pour l'écran de connexion agents */
export async function listAgentNames(): Promise<string[]> {
  const c = await getCache();
  return c.agentsList.map((a) => a.Nom);
}

export async function listAgentsForAdmin(): Promise<
  { Nom: string; MotDePasse: string; hasPassword: boolean }[]
> {
  const c = await getCache();
  return c.agentsList.map((a) => ({
    Nom: a.Nom,
    MotDePasse: a.MotDePasse,
    hasPassword: Boolean(a.MotDePasse),
  }));
}

export async function verifyAgentCredentials(
  name: string,
  password: string,
): Promise<AgentRow | null> {
  const c = await getCache();
  const agent = c.agentsByName.get(nameKey(name));
  if (!agent) return null;
  if (!agent.MotDePasse || agent.MotDePasse !== password) return null;
  return agent;
}

export async function addAgent(
  name: string,
  password: string,
): Promise<AgentRow> {
  const nom = normName(name);
  const pass = String(password || "").trim();
  if (!nom) throw new Error("Nom agent requis.");
  if (!pass) throw new Error("Mot de passe agent requis.");

  const c = await getCache();
  if (c.agentsByName.has(nameKey(nom))) {
    throw new Error("Cet agent existe déjà.");
  }

  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const agent: AgentRow = { Nom: nom, MotDePasse: pass };

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SHEET_AGENTS}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[agent.Nom, agent.MotDePasse]] },
  });

  c.agentsByName.set(nameKey(nom), agent);
  c.agentsList.push(agent);
  c.agentsList.sort((a, b) => a.Nom.localeCompare(b.Nom, "fr"));
  return agent;
}

async function findAgentRowIndex(name: string): Promise<number> {
  const { sheets, sheetId } = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_AGENTS}!A:B`,
  });
  const values = res.data.values || [];
  const key = nameKey(name);
  for (let i = 1; i < values.length; i++) {
    if (nameKey(String(values[i][0] || "")) === key) {
      return i + 1; // 1-based sheet row
    }
  }
  return -1;
}

async function getAgentsSheetId(): Promise<number> {
  const { sheets, sheetId } = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tab = meta.data.sheets?.find(
    (s) => s.properties?.title === SHEET_AGENTS,
  );
  const id = tab?.properties?.sheetId;
  if (id == null) throw new Error("Feuille Agents introuvable.");
  return id;
}

/** Modifier nom et/ou mot de passe. `oldName` = nom actuel. */
export async function updateAgent(
  oldName: string,
  newName: string,
  password: string,
): Promise<AgentRow> {
  const previous = normName(oldName);
  const nom = normName(newName);
  const pass = String(password || "").trim();
  if (!previous) throw new Error("Agent introuvable.");
  if (!nom) throw new Error("Nom agent requis.");
  if (!pass) throw new Error("Mot de passe agent requis.");

  const c = await getCache();
  const existing = c.agentsByName.get(nameKey(previous));
  if (!existing) throw new Error("Agent introuvable.");

  if (
    nameKey(nom) !== nameKey(previous) &&
    c.agentsByName.has(nameKey(nom))
  ) {
    throw new Error("Ce nom d'agent est déjà utilisé.");
  }

  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const rowIndex = await findAgentRowIndex(previous);
  if (rowIndex < 0) throw new Error("Agent introuvable dans la feuille.");

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${SHEET_AGENTS}!A${rowIndex}:B${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [[nom, pass]] },
  });

  c.agentsByName.delete(nameKey(previous));
  const updated: AgentRow = { Nom: nom, MotDePasse: pass };
  c.agentsByName.set(nameKey(nom), updated);
  const idx = c.agentsList.findIndex(
    (a) => nameKey(a.Nom) === nameKey(previous),
  );
  if (idx >= 0) c.agentsList[idx] = updated;
  else c.agentsList.push(updated);
  c.agentsList.sort((a, b) => a.Nom.localeCompare(b.Nom, "fr"));
  return updated;
}

export async function deleteAgent(name: string): Promise<void> {
  const nom = normName(name);
  if (!nom) throw new Error("Nom agent requis.");

  const c = await getCache();
  if (!c.agentsByName.has(nameKey(nom))) {
    throw new Error("Agent introuvable.");
  }

  await ensureWorkbookReady();
  const { sheets, sheetId } = getSheets();
  const rowIndex = await findAgentRowIndex(nom);
  if (rowIndex < 0) throw new Error("Agent introuvable dans la feuille.");

  const tabId = await getAgentsSheetId();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: tabId,
              dimension: "ROWS",
              startIndex: rowIndex - 1,
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });

  c.agentsByName.delete(nameKey(nom));
  c.agentsList = c.agentsList.filter((a) => nameKey(a.Nom) !== nameKey(nom));
}

/** @deprecated use updateAgent */
export async function updateAgentPassword(
  name: string,
  password: string,
): Promise<void> {
  await updateAgent(name, name, password);
}

