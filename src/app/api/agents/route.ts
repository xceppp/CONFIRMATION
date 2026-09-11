import { NextResponse } from "next/server";
import { listAgentNames } from "@/lib/sheets";

/** Public — noms uniquement (pas les mots de passe). */
export async function GET() {
  try {
    const agents = await listAgentNames();
    return NextResponse.json({ agents });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
