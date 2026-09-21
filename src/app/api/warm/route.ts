import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getCache, refreshConfirmations, refreshStudents } from "@/lib/sheets";

/** Prefetch Sheets into RAM so searches stay instant. Soft — no force re-read. */
export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    await getCache();
    await refreshStudents({ force: false });
    await refreshConfirmations({ force: false });
    const c = await getCache();
    return NextResponse.json({
      ok: true,
      etudiants: c.etudiantCount,
      confirmations: c.confirmationCount,
      agents: c.agentsList.length,
      filiereSheets: c.filiereSheets,
      codesIndexes: c.etudiantsByCode.size,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
