import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseStudentCsv } from "@/lib/csv";
import { detectFiliereFromFilename } from "@/lib/filieres";
import { appendEtudiants } from "@/lib/sheets";
import type { StudentRow } from "@/lib/columns";

export const runtime = "nodejs";
export const maxDuration = 300;

type FileResult = {
  file: string;
  ok: boolean;
  filiereCode?: string;
  imported?: number;
  error?: string;
};

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Aucun fichier CSV fourni." },
        { status: 400 },
      );
    }

    const results: FileResult[] = [];
    const byFiliere = new Map<string, StudentRow[]>();

    for (const file of files) {
      const filiere = detectFiliereFromFilename(file.name);
      if (!filiere) {
        results.push({
          file: file.name,
          ok: false,
          error:
            "Code filière introuvable dans le nom du fichier (ex: ... FBA.csv).",
        });
        continue;
      }

      const text = await file.text();
      const { rows, error } = parseStudentCsv(text, filiere);
      if (error) {
        results.push({
          file: file.name,
          ok: false,
          filiereCode: filiere.code,
          error,
        });
        continue;
      }

      const existing = byFiliere.get(filiere.code) || [];
      existing.push(...rows);
      byFiliere.set(filiere.code, existing);

      results.push({
        file: file.name,
        ok: true,
        filiereCode: filiere.code,
        imported: rows.length,
      });
    }

    const okFiles = results.filter((r) => r.ok);
    if (okFiles.length === 0) {
      return NextResponse.json(
        {
          error: "Aucun fichier n'a pu être importé.",
          results,
        },
        { status: 400 },
      );
    }

    let imported = 0;
    for (const [code, rows] of byFiliere) {
      imported += await appendEtudiants(code, rows);
    }

    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      ok: true,
      imported,
      filesOk: okFiles.length,
      filesFailed: failed,
      results,
      message:
        failed > 0
          ? `${imported} étudiants importés (${okFiles.length} fichier(s) OK, ${failed} échec(s)).`
          : `${imported} étudiants importés depuis ${okFiles.length} fichier(s).`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
