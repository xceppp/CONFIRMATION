import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getStats, listConfirmations } from "@/lib/sheets";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
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
