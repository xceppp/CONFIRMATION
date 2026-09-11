import type { StudentRow } from "./columns";
import { CONFIRMATIONS_HEADERS } from "./columns";

export type ExportColumn = {
  key: string;
  label: string;
};

/** Colonnes sélectionnables pour l'export Excel */
export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "Code", label: "CNE / Code Massar" },
  { key: "NomComplet", label: "Nom complet (Prénom + Nom)" },
  { key: "PrenomFr", label: "Prénom" },
  { key: "NomFr", label: "Nom" },
  { key: "FiliereCode", label: "Code filière" },
  { key: "Filiere", label: "Nom filière" },
  { key: "Score", label: "Score" },
  { key: "Cin", label: "CIN" },
  { key: "Telephone", label: "Téléphone" },
  { key: "Email", label: "Email" },
  { key: "Agent", label: "Agent" },
  { key: "DateConfirmation", label: "Date confirmation" },
  { key: "NomAr", label: "Nom (AR)" },
  { key: "PrenomAr", label: "Prénom (AR)" },
  { key: "Genre", label: "Genre" },
  { key: "serieBac", label: "Série Bac" },
  { key: "TypeBac", label: "Type Bac" },
  { key: "Annee", label: "Année" },
  { key: "region", label: "Région" },
  { key: "province", label: "Province" },
  { key: "commune", label: "Commune" },
  { key: "MoyenneNationale", label: "Moyenne nationale" },
  { key: "MoyenneRegionale", label: "Moyenne régionale" },
];

export const DEFAULT_EXPORT_KEYS = [
  "Code",
  "NomComplet",
  "Filiere",
  "Score",
];

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
    return `${row.PrenomFr || ""} ${row.NomFr || ""}`.trim();
  }
  if ((CONFIRMATIONS_HEADERS as readonly string[]).includes(key) || key in row) {
    return String(row[key] ?? "");
  }
  return String(row[key] ?? "");
}
