import type { StudentRow } from "./columns";
import { CONFIRMATIONS_HEADERS } from "./columns";

export type ExportColumn = {
  key: string;
  label: string;
};

/** Colonnes sélectionnables pour l'export Excel */
export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "CNE", label: "CNE / Code Massar" },
  { key: "Code", label: "Code (alias CNE)" },
  { key: "NomComplet", label: "Nom complet" },
  { key: "Filiere", label: "Filière confirmée" },
  { key: "Score", label: "Score" },
];

export const DEFAULT_EXPORT_KEYS = ["CNE", "NomComplet", "Filiere", "Score"];

function parseScore(row: StudentRow): number {
  const raw = String(row.Score || "")
    .trim()
    .replace(",", ".");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : -Infinity;
}

function filiereLabel(row: StudentRow): string {
  return String(row.Filiere || row.FiliereCode || "—").trim() || "—";
}

/** Group by filière, each group sorted by Score desc (highest first). */
export function groupConfirmationsByFiliere(
  rows: StudentRow[],
): { filiere: string; rows: StudentRow[] }[] {
  const map = new Map<string, StudentRow[]>();
  for (const row of rows) {
    const key = filiereLabel(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }

  const groups = [...map.entries()].map(([filiere, list]) => ({
    filiere,
    rows: [...list].sort((a, b) => parseScore(b) - parseScore(a)),
  }));

  groups.sort((a, b) => a.filiere.localeCompare(b.filiere, "fr"));
  return groups;
}

/** Flat list: filière groups concatenated, each sorted by score desc. */
export function sortConfirmationsByFiliereThenScore(
  rows: StudentRow[],
): StudentRow[] {
  return groupConfirmationsByFiliere(rows).flatMap((g) => g.rows);
}

export function cellValue(row: StudentRow, key: string): string {
  if (key === "NomComplet") {
    return (
      String(row.NomComplet || "").trim() ||
      `${row.PrenomFr || ""} ${row.NomFr || ""}`.trim()
    );
  }
  if (key === "CNE" || key === "Code") {
    return String(row.CNE || row.Code || "");
  }
  if (
    (CONFIRMATIONS_HEADERS as readonly string[]).includes(key) ||
    key in row
  ) {
    return String(row[key] ?? "");
  }
  return String(row[key] ?? "");
}
