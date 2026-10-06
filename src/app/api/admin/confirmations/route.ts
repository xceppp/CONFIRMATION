import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listConfirmations } from "@/lib/sheets";
import {
  groupConfirmationsByFiliere,
  isHorsDelai,
  sortConfirmationsByFiliereThenScore,
} from "@/lib/confirmations-export";

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filiere = (searchParams.get("filiere") || "").trim();
    const countsOnly = searchParams.get("countsOnly") === "1";
    let rows = await listConfirmations();

    if (filiere && filiere !== "all") {
      const needle = filiere.toLowerCase();
      rows = rows.filter((r) => {
        const label = String(r.Filiere || r.FiliereCode || "").toLowerCase();
        const code = String(r.FiliereCode || "").toLowerCase();
        return label === needle || code === needle || label.includes(needle);
      });
    }

    // Light payload for Final admin: counts only (no row dump).
    if (countsOnly) {
      const onTime = rows.filter((r) => !isHorsDelai(r));
      const horsCount = rows.length - onTime.length;
      const onTimeGroups = groupConfirmationsByFiliere(onTime);
      return NextResponse.json({
        total: onTime.length,
        horsCount,
        rows: [],
        groups: onTimeGroups.map((g) => ({
          filiere: g.filiere,
          count: g.rows.length,
        })),
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
