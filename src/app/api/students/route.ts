import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  getEtudiantsByCode,
  isAlreadyConfirmed,
  suggestEtudiantsByCodePrefix,
} from "@/lib/sheets";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const prefix = (searchParams.get("prefix") || "").trim();
  const code = (searchParams.get("code") || "").trim();

  // Live suggestions while typing Massar (no confirmations GET — spare quota).
  if (prefix) {
    try {
      const suggestions = await suggestEtudiantsByCodePrefix(prefix, 8);
      return NextResponse.json({ suggestions });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur serveur";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!code) {
    return NextResponse.json(
      { error: "Code Massar requis." },
      { status: 400 },
    );
  }

  try {
    let rows = await getEtudiantsByCode(code);

    // If Confirmations sheet is quota-blocked, still show the student so
    // the agent can force confirmation (append path has its own retries).
    let confirmed = null;
    try {
      confirmed = await isAlreadyConfirmed(code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/quota|saturé|rate limit/i.test(msg)) throw e;
    }

    // Already in Confirmations but missing from filière cache (stale RAM /
    // quota / cold instance) — show "déjà confirmé", not "introuvable".
    if (rows.length === 0 && confirmed) {
      const name = String(confirmed.NomComplet || "").trim();
      const parts = name.split(/\s+/).filter(Boolean);
      const prenom = String(confirmed.PrenomFr || parts[0] || "");
      const nom =
        String(confirmed.NomFr || "") ||
        (parts.length > 1 ? parts.slice(1).join(" ") : "");
      return NextResponse.json({
        found: true,
        alreadyConfirmed: true,
        confirmation: confirmed,
        student: {
          Code: String(confirmed.CNE || confirmed.Code || code).toUpperCase(),
          NomFr: nom,
          PrenomFr: prenom,
          Cin: "",
          Telephone: "",
          Email: "",
          Score: String(confirmed.Score || ""),
        },
        filieres: [],
      });
    }

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
          // Score is filière-specific — only per-option scores are authoritative.
          Score: "",
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
