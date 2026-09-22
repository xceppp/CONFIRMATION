import ExcelJS from "exceljs";
import { resolveFiliereFromLabel } from "./filieres";

export type DejaInscritInfo = {
  /** Full parcours label from the inscrits file */
  parcours: string;
  /** Resolved code e.g. PMD, or "?" */
  code: string;
};

function cell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "text" in v) {
    return String((v as { text: unknown }).text ?? "").trim();
  }
  if (typeof v === "object" && v !== null && "result" in v) {
    return String((v as { result: unknown }).result ?? "").trim();
  }
  return String(v).trim();
}

/**
 * Parse "nouveaux inscrits" workbook → CNE → filière d'inscription.
 * Expects sheet with Code + Parcours columns (EST export).
 */
export async function parseNouveauxInscritsBuffer(
  buffer: Buffer,
): Promise<Map<string, DejaInscritInfo>> {
  const wb = new ExcelJS.Workbook();
  // exceljs Buffer typing conflicts with Node 22 Buffer generics
  await wb.xlsx.load(buffer as never);

  const ws =
    wb.worksheets.find((s) => /inscrit/i.test(s.name)) || wb.worksheets[0];
  if (!ws) return new Map();

  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
    headers[i] = cell(c.value);
  });

  let codeCol = 0;
  let parcoursCol = 0;
  headers.forEach((h, i) => {
    const k = h.toLowerCase();
    if (!codeCol && /^(code|cne|code massar)/i.test(h.trim())) codeCol = i;
    if (!parcoursCol && /parcours|filiere|filière/i.test(k)) parcoursCol = i;
  });
  if (!codeCol) codeCol = 1;
  if (!parcoursCol) parcoursCol = 23;

  const map = new Map<string, DejaInscritInfo>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = cell(row.getCell(codeCol).value).toUpperCase();
    if (!code || code.length < 6) continue;
    const parcours = cell(row.getCell(parcoursCol).value);
    const resolved = resolveFiliereFromLabel(parcours);
    map.set(code, {
      parcours,
      code: resolved?.code || "?",
    });
  }
  return map;
}
