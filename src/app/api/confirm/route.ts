import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { appendConfirmation, getEtudiantsByCode } from "@/lib/sheets";
import type { StudentRow } from "@/lib/columns";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const agentName =
    session.role === "agent" ? session.name : session.name || "Admin";

  const body = await request.json().catch(() => null);
  const code = String(body?.code || "").trim();
  const filiereCode = String(body?.filiereCode || "").trim();

  if (!code || !filiereCode) {
    return NextResponse.json(
      { error: "Code et filière requis." },
      { status: 400 },
    );
  }

  try {
    // One student read — skip extra Confirmations GET (append checks + retries).
    const rows = await getEtudiantsByCode(code);

    const match = rows.find(
      (r) =>
        String(r.FiliereCode || "").toUpperCase() === filiereCode.toUpperCase(),
    );

    if (!match) {
      return NextResponse.json(
        { error: "Filière non associée à ce code Massar." },
        { status: 400 },
      );
    }

    const payload: StudentRow = { ...match };
    await appendConfirmation(payload, agentName);

    return NextResponse.json({
      ok: true,
      message: "Confirmation enregistrée.",
      filiere: match.Filiere,
      filiereCode: match.FiliereCode,
      agent: agentName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    const already = message.includes("déjà confirmé");
    if (already) {
      return NextResponse.json(
        {
          error: message,
          alreadyConfirmed: true,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
