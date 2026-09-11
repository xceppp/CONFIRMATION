import { NextResponse } from "next/server";
import Papa from "papaparse";
import { isAuthenticated } from "@/lib/auth";
import { STUDENT_COLUMNS, type StudentRow } from "@/lib/columns";
import { getFiliereByCode } from "@/lib/filieres";
import { appendEtudiants } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const filiereCode = String(form.get("filiereCode") || "").trim();

    const filiere = getFiliereByCode(filiereCode);
    if (!filiere) {
      return NextResponse.json(
        { error: "Filière invalide." },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Fichier CSV requis." },
        { status: 400 },
      );
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return NextResponse.json(
        { error: "Impossible de lire le CSV." },
        { status: 400 },
      );
    }

    const rows: StudentRow[] = [];
    for (const raw of parsed.data) {
      const code = String(raw.Code || "").trim();
      if (!code) continue;

      const row: StudentRow = {
        FiliereCode: filiere.code,
        Filiere: filiere.name,
      };

      for (const col of STUDENT_COLUMNS) {
        row[col] = String(raw[col] ?? "").trim();
      }
      rows.push(row);
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Aucune ligne valide dans le fichier." },
        { status: 400 },
      );
    }

    const count = await appendEtudiants(rows);
    return NextResponse.json({
      ok: true,
      imported: count,
      filiere: filiere.name,
      message: `${count} étudiants importés pour ${filiere.code}.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
