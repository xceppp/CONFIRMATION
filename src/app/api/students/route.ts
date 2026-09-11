import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getEtudiantsByCode, isAlreadyConfirmed } from "@/lib/sheets";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") || "").trim();

  if (!code) {
    return NextResponse.json(
      { error: "Code Massar requis." },
      { status: 400 },
    );
  }

  try {
    const [rows, confirmed] = await Promise.all([
      getEtudiantsByCode(code),
      isAlreadyConfirmed(code),
    ]);

    if (rows.length === 0) {
      return NextResponse.json({
        found: false,
        message: "Aucun étudiant trouvé pour ce code.",
      });
    }

    const first = rows[0];
    return NextResponse.json({
      found: true,
      alreadyConfirmed: Boolean(confirmed),
      confirmation: confirmed,
      student: {
        Code: first.Code,
        NomFr: first.NomFr,
        PrenomFr: first.PrenomFr,
        Cin: first.Cin,
        Telephone: first.Telephone,
        Email: first.Email,
        Score: first.Score,
      },
      filieres: rows.map((r) => ({
        FiliereCode: r.FiliereCode,
        Filiere: r.Filiere,
        Score: r.Score,
        row: r,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
