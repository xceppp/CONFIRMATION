import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listConfirmations } from "@/lib/sheets";
import {
  groupConfirmationsByFiliere,
  sortConfirmationsByFiliereThenScore,
} from "@/lib/confirmations-export";

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filiere = (searchParams.get("filiere") || "").trim();
    let rows = await listConfirmations();

    if (filiere && filiere !== "all") {
      const needle = filiere.toLowerCase();
      rows = rows.filter((r) => {
        const label = String(r.Filiere || r.FiliereCode || "").toLowerCase();
        const code = String(r.FiliereCode || "").toLowerCase();
        return label === needle || code === needle || label.includes(needle);
      });
    }

    const sorted = sortConfirmationsByFiliereThenScore(rows);
    const groups = groupConfirmationsByFiliere(rows);

    return NextResponse.json({
      total: sorted.length,
      rows: sorted,
      groups: groups.map((g) => ({
        filiere: g.filiere,
        count: g.rows.length,
        rows: g.rows,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
