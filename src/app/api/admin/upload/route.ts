import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseStudentCsv } from "@/lib/csv";
import { getFiliereByCode } from "@/lib/filieres";
import { appendEtudiants } from "@/lib/sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
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
    const { rows, error } = parseStudentCsv(text, filiere);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const count = await appendEtudiants(filiere.code, rows);
    return NextResponse.json({
      ok: true,
      imported: count,
      filiere: filiere.name,
      sheet: filiere.code,
      message: `${count} étudiants importés dans la feuille « ${filiere.code} ».`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
