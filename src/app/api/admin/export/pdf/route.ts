import { requireAdmin } from "@/lib/auth";
import { listConfirmations } from "@/lib/sheets";
import { buildConfirmationsPdf } from "@/lib/confirmations-pdf";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** PDF for website publishing — header EST, filière titles, page numbers. */
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const rows = await listConfirmations();
    const buffer = await buildConfirmationsPdf(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `listes_confirmations_${stamp}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
