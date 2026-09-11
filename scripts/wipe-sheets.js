/**
 * One-shot: wipe all test data from the Google workbook.
 * Keeps tabs + header rows only (Confirmations, Agents, filière sheets, legacy Etudiants).
 */
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v.replace(/\\n/g, "\n");
  }
}

const FILIERES = [
  "DWM",
  "FBA",
  "GC",
  "GETE",
  "GI",
  "GTE",
  "IATE",
  "PMD",
  "TCC",
  "TM",
];

const HEADERS = {
  Confirmations: [
    "CNE",
    "NomComplet",
    "Filiere",
    "Score",
    "Agent",
    "DateConfirmation",
  ],
  Agents: ["Nom", "MotDePasse"],
  Etudiants: [
    "FiliereCode",
    "Filiere",
    "Code",
    "NomFr",
    "NomAr",
    "PrenomFr",
    "PrenomAr",
    "Cin",
    "Genre",
    "DateNaissance",
    "LieuNaissance",
    "serieBac",
    "Annee",
    "region",
    "province",
    "commune",
    "Telephone",
    "Email",
    "TypeBac",
    "Score",
    "MoyenneNationale",
    "MoyenneRegionale",
  ],
};

async function main() {
  loadEnv();
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!email || !key || !sheetId) {
    throw new Error("Missing Google env in .env.local");
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const titles = (meta.data.sheets || [])
    .map((s) => s.properties?.title)
    .filter(Boolean);

  console.log("Tabs found:", titles.join(", "));

  const toReset = new Set([
    "Confirmations",
    "Agents",
    "Etudiants",
    ...FILIERES,
  ]);

  for (const title of titles) {
    if (!toReset.has(title) && !String(title).includes("_conflict")) {
      console.log("Skip:", title);
      continue;
    }

    let headers = HEADERS[title];
    if (!headers && FILIERES.includes(title)) {
      headers = HEADERS.Etudiants;
    }
    if (!headers) headers = [];

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${title}!A:ZZ`,
    });

    if (headers.length && !String(title).includes("_conflict")) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${title}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    }

    console.log("Cleared:", title);
  }

  // Delete Google conflict copies entirely
  const conflictSheets = (meta.data.sheets || []).filter((s) =>
    String(s.properties?.title || "").includes("_conflict"),
  );
  if (conflictSheets.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: conflictSheets.map((s) => ({
          deleteSheet: { sheetId: s.properties.sheetId },
        })),
      },
    });
    console.log(
      "Deleted conflict tabs:",
      conflictSheets.map((s) => s.properties.title).join(", "),
    );
  }

  console.log("DONE — workbook wiped (headers kept).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
