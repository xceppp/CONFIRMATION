import { requireAdmin } from "@/lib/auth";
import { clearConfirmationsLog } from "@/lib/sheets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Efface le journal Confirmations uniquement — Agents + DB filières inchangés. */
export async function DELETE() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const cleared = await clearConfirmationsLog();
    return NextResponse.json({
      ok: true,
      cleared,
      message: `${cleared} confirmation(s) effacée(s). Agents et listes étudiants conservés.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
