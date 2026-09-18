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
  { key: "Agent", label: "Agent" },
  { key: "DateConfirmation", label: "Date confirmation" },
];

export const DEFAULT_EXPORT_KEYS = [
  "CNE",
  "NomComplet",
  "Filiere",
  "Score",
  "Agent",
  "DateConfirmation",
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

export function rowMatchesFiliere(
  row: StudentRow,
  code: string,
  name: string,
): boolean {
  const label = String(row.Filiere || "").trim();
  const rowCode = String(row.FiliereCode || "").trim().toUpperCase();
  const c = code.trim().toUpperCase();
  const n = name.trim();
  if (rowCode && rowCode === c) return true;
  if (label.toUpperCase() === c) return true;
  if (n && label.toLowerCase() === n.toLowerCase()) return true;
  if (n && label.toLowerCase().includes(n.toLowerCase())) return true;
  return false;
}

/**
 * For each filière with places > 0: take top N confirmations by score desc.
 * Filières with places 0 / empty are skipped.
 */
export function selectTopConfirmationsByPlaces(
  rows: StudentRow[],
  placesByCode: { code: string; name: string; places: number }[],
): {
  selected: { code: string; name: string; places: number; rows: StudentRow[] }[];
  summary: {
    code: string;
    name: string;
    places: number;
    confirmed: number;
    selected: number;
    shortfall: number;
  }[];
} {
  const selected: {
    code: string;
    name: string;
    places: number;
    rows: StudentRow[];
  }[] = [];
  const summary: {
    code: string;
    name: string;
    places: number;
    confirmed: number;
    selected: number;
    shortfall: number;
  }[] = [];

  for (const f of placesByCode) {
    const places = Math.max(0, Math.floor(f.places));
    if (places <= 0) continue;

    const pool = rows
      .filter((r) => rowMatchesFiliere(r, f.code, f.name))
      .sort((a, b) => parseScore(b) - parseScore(a));

    const top = pool.slice(0, places);
    selected.push({
      code: f.code,
      name: f.name,
      places,
      rows: top,
    });
    summary.push({
      code: f.code,
      name: f.name,
      places,
      confirmed: pool.length,
      selected: top.length,
      shortfall: Math.max(0, places - top.length),
    });
  }

  return { selected, summary };
}
