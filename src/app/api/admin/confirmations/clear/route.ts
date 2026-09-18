import { requireAdmin } from "@/lib/auth";
import { CLEAR_JOURNAL_PASSWORD } from "@/lib/admins";
import { clearConfirmationsLog } from "@/lib/sheets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Efface le journal Confirmations uniquement — Agents + DB filières inchangés. */
export async function DELETE(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const password = String(body?.password || "");
    if (password !== CLEAR_JOURNAL_PASSWORD) {
      return NextResponse.json(
        { error: "Mot de passe de confirmation incorrect. Journal non effacé." },
        { status: 401 },
      );
    }

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
