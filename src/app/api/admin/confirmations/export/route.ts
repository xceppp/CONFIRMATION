import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { listConfirmations } from "@/lib/sheets";
import {
  DEFAULT_EXPORT_KEYS,
  EXPORT_COLUMNS,
  cellValue,
  sortConfirmationsByFiliereThenScore,
} from "@/lib/confirmations-export";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const filiere = String(body?.filiere || "all").trim();
    const requested = Array.isArray(body?.columns)
      ? body.columns.map((c: unknown) => String(c))
      : DEFAULT_EXPORT_KEYS;

    const allowed = new Set(EXPORT_COLUMNS.map((c) => c.key));
    const columns = requested.filter((k: string) => allowed.has(k));
    if (columns.length === 0) {
      return NextResponse.json(
        { error: "Sélectionnez au moins une colonne." },
        { status: 400 },
      );
    }

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
    const labels = columns.map(
      (key: string) =>
        EXPORT_COLUMNS.find((c) => c.key === key)?.label || key,
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Confirmation";
    const sheet = workbook.addWorksheet("Confirmations", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.addRow(labels);
    sheet.getRow(1).font = { bold: true };

    for (const row of sorted) {
      sheet.addRow(columns.map((key: string) => cellValue(row, key)));
    }

    sheet.columns.forEach((col) => {
      let max = 12;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? "").length;
        if (len > max) max = Math.min(len + 2, 40);
      });
      col.width = max;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    const safeFiliere =
      filiere && filiere !== "all"
        ? filiere.replace(/[^\w\-]+/g, "_").slice(0, 40)
        : "toutes";
    const filename = `confirmations_${safeFiliere}_${stamp}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
