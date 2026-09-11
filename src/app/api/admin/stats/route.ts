import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getStats, listConfirmations } from "@/lib/sheets";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const [stats, recent] = await Promise.all([
      getStats(),
      listConfirmations(50),
    ]);
    return NextResponse.json({ stats, recent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
