import Papa from "papaparse";
import { STUDENT_COLUMNS, type StudentRow } from "@/lib/columns";
import type { Filiere } from "@/lib/filieres";

export function parseStudentCsv(
  text: string,
  filiere: Filiere,
): { rows: StudentRow[]; error?: string } {
  // Massar exports use `;` — also accept `,` if needed.
  let parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: ";",
    skipEmptyLines: true,
  });
  if (
    parsed.data.length === 0 ||
    Object.keys(parsed.data[0] || {}).length < 2
  ) {
    parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter: ",",
      skipEmptyLines: true,
    });
  }

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { rows: [], error: "Impossible de lire le CSV." };
  }

  const rows: StudentRow[] = [];
  for (const raw of parsed.data) {
    const code = String(
      raw.Code || raw.CNE || raw.code || raw.cne || "",
    ).trim();
    if (!code) continue;

    const row: StudentRow = {
      FiliereCode: filiere.code,
      Filiere: filiere.name,
    };

    for (const col of STUDENT_COLUMNS) {
      row[col] = String(raw[col] ?? "").trim();
    }
    row.Code = code;
    rows.push(row);
  }

  if (rows.length === 0) {
    return { rows: [], error: "Aucune ligne valide dans le fichier." };
  }

  return { rows };
}
