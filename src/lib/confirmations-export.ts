import type ExcelJS from "exceljs";
import type { StudentRow } from "./columns";
import { CONFIRMATIONS_HEADERS } from "./columns";
import { resolveFiliereFromLabel } from "./filieres";

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

const BRAND_ARGB = "FF0A6E8A";
const HEADER_BG_ARGB = "FFE8F4F0";
const LINE_ARGB = "FFC5D4D0";
const ZEBRA_ARGB = "FFF7FAF9";

const COL_WIDTHS: Record<string, number> = {
  CNE: 18,
  Code: 16,
  NomComplet: 36,
  Filiere: 42,
  Score: 12,
  Agent: 16,
  DateConfirmation: 22,
};

/** Style a filled sheet as a clean table (header, borders, filter, widths). */
export function styleConfirmationsSheet(
  sheet: ExcelJS.Worksheet,
  columnKeys: string[],
  options?: { addTotal?: boolean; totalLabel?: string },
): void {
  const colCount = columnKeys.length;
  if (colCount === 0) return;

  const header = sheet.getRow(1);
  header.height = 22;
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > colCount) return;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND_ARGB },
    };
    cell.border = {
      top: { style: "thin", color: { argb: LINE_ARGB } },
      left: { style: "thin", color: { argb: LINE_ARGB } },
      bottom: { style: "thin", color: { argb: LINE_ARGB } },
      right: { style: "thin", color: { argb: LINE_ARGB } },
    };
  });

  const lastDataRow = sheet.rowCount;
  for (let r = 2; r <= lastDataRow; r++) {
    const row = sheet.getRow(r);
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > colCount) return;
      const key = columnKeys[colNumber - 1];
      cell.border = {
        top: { style: "thin", color: { argb: LINE_ARGB } },
        left: { style: "thin", color: { argb: LINE_ARGB } },
        bottom: { style: "thin", color: { argb: LINE_ARGB } },
        right: { style: "thin", color: { argb: LINE_ARGB } },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal:
          key === "Score" || key === "CNE" || key === "Code"
            ? "center"
            : "left",
      };
      if (r % 2 === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ZEBRA_ARGB },
        };
      }
      if (key === "Score") {
        const n = Number.parseFloat(
          String(cell.value ?? "").replace(",", "."),
        );
        if (Number.isFinite(n)) {
          cell.value = n;
          cell.numFmt = "0.0000";
        }
      }
      if (key === "NomComplet" && typeof cell.value === "string") {
        cell.value = cell.value.toUpperCase();
      }
    });
  }

  columnKeys.forEach((key, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = COL_WIDTHS[key] ?? 16;
  });

  if (lastDataRow >= 1) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, lastDataRow), column: colCount },
    };
  }

  if (options?.addTotal && lastDataRow >= 1) {
    const dataCount = Math.max(0, lastDataRow - 1);
    const totalRow = sheet.addRow(
      columnKeys.map((_, i) =>
        i === 0
          ? options.totalLabel || `Total : ${dataCount}`
          : i === columnKeys.length - 1
            ? dataCount
            : "",
      ),
    );
    totalRow.font = { bold: true, color: { argb: BRAND_ARGB } };
    totalRow.height = 20;
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > colCount) return;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: HEADER_BG_ARGB },
      };
      cell.border = {
        top: { style: "medium", color: { argb: BRAND_ARGB } },
        left: { style: "thin", color: { argb: LINE_ARGB } },
        bottom: { style: "thin", color: { argb: LINE_ARGB } },
        right: { style: "thin", color: { argb: LINE_ARGB } },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === 1 ? "left" : "center",
      };
    });
  }
}

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
  _name: string,
): boolean {
  const c = code.trim().toUpperCase();
  const rowCode = String(row.FiliereCode || "").trim().toUpperCase();
  if (rowCode && rowCode === c) return true;

  const label = String(row.Filiere || row.FiliereCode || "").trim();
  const resolved = resolveFiliereFromLabel(label);
  return Boolean(resolved && resolved.code === c);
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
      .filter((r) => !isHorsDelai(r))
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

export type FinalRoundSpec = {
  code: string;
  name: string;
  /** How many students were published on list 1 (also the skip point). */
  list1: number;
  /** How many additional students to take for list 2. */
  list2: number;
  /** How many additional students to take for list 3 (after list 2). */
  list3: number;
};

/**
 * Published liste-1 floor (LIST TO PUBLISH). Anyone at or above this score
 * stays on the liste-1 side. Liste 2 only takes scores strictly below.
 */
export const PUBLISHED_LIST1_SEUIL: Record<string, number> = {
  DWM: 14.3683,
  FBA: 14.2643,
  GC: 14.838,
  GETE: 15.9525,
  GI: 16.7928,
  GTE: 14.4983,
  IATE: 16.05,
  PMD: 12.662,
  TCC: 13.325,
  TM: 14.9628,
};

/** Late manual confirmation flag. */
export function isHorsDelai(row: { HorsDelai?: string }): boolean {
  const v = String(row.HorsDelai || "")
    .trim()
    .toLowerCase();
  return (
    v === "1" ||
    v === "oui" ||
    v === "true" ||
    v === "hors delai" ||
    v === "hors délai"
  );
}

/** How many leading rows of a score-desc pool belong on liste 1. */
export function liste1CutoffIndex(
  code: string,
  list1: number,
  scoresDesc: number[],
): number {
  const n = Math.min(Math.max(0, Math.floor(list1)), scoresDesc.length);
  if (n <= 0) return 0;

  // Keep every student tied with the Nth score (no cutoff anomaly).
  const nthScore = scoresDesc[n - 1];
  let end = n;
  if (Number.isFinite(nthScore) && nthScore !== -Infinity) {
    while (
      end < scoresDesc.length &&
      scoresDesc[end] + 1e-6 >= nthScore
    ) {
      end += 1;
    }
  }

  const floor = PUBLISHED_LIST1_SEUIL[code];
  if (floor != null && Number.isFinite(floor)) {
    let atOrAbove = 0;
    for (const score of scoresDesc) {
      if (!(score + 1e-6 >= floor)) break;
      atOrAbove += 1;
    }
    // Expand to cover the published floor (GI-style), but never
    // pull anyone strictly below that floor onto liste 1.
    end = Math.max(end, atOrAbove);
    while (end > 0 && scoresDesc[end - 1] + 1e-6 < floor) {
      end -= 1;
    }
  }
  return end;
}

/**
 * Seuil from on-time confirmations only (top N / published floor / ties).
 * Hors délai above contact seuil → to contact.
 * Hors délai at or under → join the normal pool like on-time students.
 *
 * Contact seuil:
 * - list2 places given → last student of Liste 2 (seuil 2, lower bar)
 * - otherwise → Liste 1 seuil
 */
export function buildFinalPoolForFiliere(
  rows: StudentRow[],
  code: string,
  name: string,
  list1: number,
  list2 = 0,
): {
  pool: StudentRow[];
  seuil: string;
  seuilNum: number;
  seuilList2: string;
  seuil2Num: number;
  toContact: StudentRow[];
  contactSeuil: string;
  contactSeuilNum: number;
} {
  const onTime = rows
    .filter((r) => rowMatchesFiliere(r, code, name))
    .filter((r) => !isHorsDelai(r))
    .sort(
      (a, b) =>
        parseScore(b) - parseScore(a) || rowCne(a).localeCompare(rowCne(b)),
    );

  const end = liste1CutoffIndex(
    code,
    list1,
    onTime.map((row) => parseScore(row)),
  );
  const lastOnTime = onTime[Math.max(0, end - 1)];
  const published = PUBLISHED_LIST1_SEUIL[code];
  let seuilNum =
    lastOnTime != null ? parseScore(lastOnTime) : Number.NEGATIVE_INFINITY;
  if (Number.isFinite(published)) {
    seuilNum = Math.max(seuilNum, published);
  }
  const seuil =
    lastOnTime != null
      ? cellValue(lastOnTime, "Score")
      : Number.isFinite(published)
        ? String(published)
        : "";

  const late = rows
    .filter((r) => rowMatchesFiliere(r, code, name))
    .filter((r) => isHorsDelai(r));
  // Pool always admits late ≤ seuil 1 (so Liste 2 ranking stays stable).
  const lateOkForPool = late.filter(
    (r) => !(parseScore(r) > seuilNum + 1e-6),
  );

  const pool = [...onTime, ...lateOkForPool].sort(
    (a, b) =>
      parseScore(b) - parseScore(a) || rowCne(a).localeCompare(rowCne(b)),
  );

  // Liste 2 cutoff = last of the next `list2` seats under seuil 1.
  let seuilList2 = "";
  let seuil2Num = Number.NEGATIVE_INFINITY;
  const want2 = Math.max(0, Math.floor(list2));
  if (want2 > 0 && Number.isFinite(seuilNum)) {
    const afterL1 = pool.filter((row) => parseScore(row) < seuilNum - 1e-6);
    let take = Math.min(want2, afterL1.length);
    if (take > 0) {
      const cut = parseScore(afterL1[take - 1]);
      while (
        take < afterL1.length &&
        parseScore(afterL1[take]) + 1e-6 >= cut
      ) {
        take += 1;
      }
      const lastSecond = afterL1[take - 1];
      if (lastSecond) {
        seuil2Num = parseScore(lastSecond);
        seuilList2 = cellValue(lastSecond, "Score");
      }
    }
  }

  // After Liste 2 exists, TO CONTACT bar = seuil 2 (last of list 2).
  const useSeuil2 = want2 > 0 && Number.isFinite(seuil2Num) && seuil2Num > -Infinity;
  const contactSeuilNum = useSeuil2 ? seuil2Num : seuilNum;
  const contactSeuil = useSeuil2 ? seuilList2 : seuil;

  const toContact = late
    .filter((r) => parseScore(r) > contactSeuilNum + 1e-6)
    .sort(
      (a, b) =>
        parseScore(b) - parseScore(a) || rowCne(a).localeCompare(rowCne(b)),
    );

  return {
    pool,
    seuil,
    seuilNum,
    seuilList2,
    seuil2Num,
    toContact,
    contactSeuil,
    contactSeuilNum,
  };
}

function rowCne(row: StudentRow): string {
  return String(row.CNE || row.Code || "")
    .trim()
    .toUpperCase();
}

/**
 * List 1 = top `list1` by score (ties at the cutoff kept on list 1).
 * List 2 = next students strictly below the liste-1 seuil, never anyone from list 1.
 * List 3 = next students strictly below the liste-2 cutoff, never L1/L2 CNEs.
 *   If places remain empty, fill from Liste-2 TO CONTACT (hors délai > seuil 1).
 * TO CONTACT: L2 Excel uses seuil 1; L3 Excel uses seuil 2 (last of list 2),
 *   excluding anyone already locked as L2 à contacter.
 * Ties at each cutoff stay together (nobody cut mid-ex-aequo).
 * Hors délai above the contact seuil → `toContact` only (Excel), never PDF unless L3 fill.
 */
export function selectFinalRound(
  rows: StudentRow[],
  specs: FinalRoundSpec[],
  round: 1 | 2 | 3,
  options?: { list2ToContactCnes?: Set<string> },
): {
  selected: { code: string; name: string; places: number; rows: StudentRow[] }[];
  summary: {
    code: string;
    name: string;
    places: number;
    confirmed: number;
    selected: number;
    shortfall: number;
    list1: number;
    list2: number;
    seuil: string;
    seuilList2: string;
  }[];
  toContact: { code: string; name: string; rows: StudentRow[] }[];
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
    list1: number;
    list2: number;
    seuil: string;
    seuilList2: string;
  }[] = [];
  const toContact: { code: string; name: string; rows: StudentRow[] }[] = [];
  const list2ToContactCnes = options?.list2ToContactCnes;

  function takeWithTies(candidates: StudentRow[], n: number): StudentRow[] {
    let take = Math.min(Math.max(0, n), candidates.length);
    if (take > 0) {
      const cut = parseScore(candidates[take - 1]);
      while (
        take < candidates.length &&
        parseScore(candidates[take]) + 1e-6 >= cut
      ) {
        take += 1;
      }
    }
    return candidates.slice(0, take);
  }

  for (const f of specs) {
    const list1 = Math.max(0, Math.floor(f.list1));
    const list2 = Math.max(0, Math.floor(f.list2 ?? 0));
    const list3 = Math.max(0, Math.floor(f.list3 ?? 0));
    const want = round === 1 ? list1 : round === 2 ? list2 : list3;
    if (want <= 0) continue;
    if (round === 2 && list1 <= 0) continue;
    if (round === 3 && (list1 <= 0 || list2 <= 0)) continue;

    // L1/L2 contact bar = seuil 1. After list 2 exists (round 3) → seuil 2.
    const built = buildFinalPoolForFiliere(
      rows,
      f.code,
      f.name,
      list1,
      round >= 3 ? list2 : 0,
    );
    // Classic > seuil 1 contacts (for L2 lock / L3 seat fill).
    const l1Contact = buildFinalPoolForFiliere(rows, f.code, f.name, list1);
    const toContactCnes = new Set(
      built.toContact.map(rowCne).filter(Boolean),
    );
    const l1ContactCnes = new Set(
      l1Contact.toContact.map(rowCne).filter(Boolean),
    );
    const end = liste1CutoffIndex(
      f.code,
      list1,
      built.pool.map((row) => parseScore(row)),
    );
    const first = built.pool.slice(0, end);
    const firstCnes = new Set(first.map(rowCne).filter(Boolean));
    const lastFirst = first[first.length - 1];
    const published = PUBLISHED_LIST1_SEUIL[f.code];
    let seuilNum =
      lastFirst != null ? parseScore(lastFirst) : built.seuilNum;
    if (published != null && Number.isFinite(published)) {
      seuilNum = Math.max(seuilNum, published);
    }
    const seuil =
      Number.isFinite(published) &&
      published >= (lastFirst != null ? parseScore(lastFirst) : -Infinity)
        ? String(published)
        : lastFirst != null
          ? cellValue(lastFirst, "Score")
          : built.seuil;

    const afterL1 = built.pool.filter((row) => {
      const cne = rowCne(row);
      if (cne && firstCnes.has(cne)) return false;
      if (cne && toContactCnes.has(cne)) return false;
      return parseScore(row) < seuilNum - 1e-6;
    });
    const second = takeWithTies(afterL1, list2);
    const secondCnes = new Set(second.map(rowCne).filter(Boolean));
    const lastSecond = second[second.length - 1];
    const seuil2Num =
      lastSecond != null ? parseScore(lastSecond) : Number.NEGATIVE_INFINITY;
    const seuilList2 =
      lastSecond != null ? cellValue(lastSecond, "Score") : "";

    let picked: StudentRow[];
    if (round === 1) {
      picked = first;
    } else if (round === 2) {
      // Never admit TO CONTACT (hors délai > seuil 1) on liste 2.
      picked = second.filter((row) => {
        const cne = rowCne(row);
        return !(cne && l1ContactCnes.has(cne));
      });
    } else {
      // 1) Normal L3: respecting seuil 2 / after L2 cutoff — PDF + list.
      const afterL2 = afterL1.filter((row) => {
        const cne = rowCne(row);
        if (cne && secondCnes.has(cne)) return false;
        if (cne && toContactCnes.has(cne)) return false;
        if (lastSecond == null) return true;
        return parseScore(row) < seuil2Num - 1e-6;
      });
      picked = takeWithTies(afterL2, list3);

      // 2) Exception: empty L3 places → fill from Liste-2 TO CONTACT (seuil 1) only.
      const need = Math.max(0, list3 - picked.length);
      if (need > 0 && l1Contact.toContact.length > 0) {
        const pickedCnes = new Set(picked.map(rowCne).filter(Boolean));
        const fillers = l1Contact.toContact
          .filter((row) => {
            const cne = rowCne(row);
            if (!cne || pickedCnes.has(cne)) return false;
            if (list2ToContactCnes && list2ToContactCnes.size > 0) {
              return list2ToContactCnes.has(cne);
            }
            return true;
          })
          .sort(
            (a, b) =>
              parseScore(b) - parseScore(a) ||
              rowCne(a).localeCompare(rowCne(b)),
          );
        picked = [...picked, ...takeWithTies(fillers, need)];
      }
    }

    selected.push({
      code: f.code,
      name: f.name,
      places: want,
      rows: picked,
    });
    summary.push({
      code: f.code,
      name: f.name,
      places: want,
      confirmed: built.pool.length,
      selected: picked.length,
      shortfall: Math.max(0, want - picked.length),
      list1,
      list2,
      seuil,
      seuilList2,
    });
    if (built.toContact.length > 0) {
      toContact.push({
        code: f.code,
        name: f.name,
        rows: built.toContact,
      });
    }
  }

  return { selected, summary, toContact };
}
