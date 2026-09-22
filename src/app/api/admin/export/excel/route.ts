import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { listConfirmations } from "@/lib/sheets";
import {
  DEFAULT_EXPORT_KEYS,
  EXPORT_COLUMNS,
  cellValue,
} from "@/lib/confirmations-export";
import { groupRowsForPublish } from "@/lib/confirmations-pdf";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Excel sheet title: max 31 chars, no \ / ? * [ ] */
function sheetTitle(code: string, name: string, used: Set<string>): string {
  let base = `${code}`
    .replace(/[\\/?*[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  if (!base) base = "Filiere";
  let title = base;
  let n = 2;
  while (used.has(title.toLowerCase())) {
    const suffix = `_${n}`;
    title = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(title.toLowerCase());
  return title;
}

/** Excel local use — one sheet per filière, sorted by score. */
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const rows = await listConfirmations();
    const groups = groupRowsForPublish(rows);
    const columns = DEFAULT_EXPORT_KEYS;
    const labels = columns.map(
      (key) => EXPORT_COLUMNS.find((c) => c.key === key)?.label || key,
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Confirmation";
    const usedTitles = new Set<string>();

    const resume = workbook.addWorksheet("Resume", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    resume.addRow(["Code", "Filière", "Confirmés"]);
    resume.getRow(1).font = { bold: true };

    if (groups.length === 0) {
      const empty = workbook.addWorksheet("Confirmations", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      empty.addRow(labels);
      empty.getRow(1).font = { bold: true };
      resume.addRow(["—", "Aucune confirmation", 0]);
    } else {
      for (const g of groups) {
        resume.addRow([g.code, g.name, g.rows.length]);
        const sheet = workbook.addWorksheet(sheetTitle(g.code, g.name, usedTitles), {
          views: [{ state: "frozen", ySplit: 1 }],
        });
        sheet.addRow(labels);
        sheet.getRow(1).font = { bold: true };
        for (const row of g.rows) {
          sheet.addRow(columns.map((key) => cellValue(row, key)));
        }
        sheet.columns.forEach((col) => {
          let max = 12;
          col.eachCell?.({ includeEmpty: true }, (cell) => {
            const len = String(cell.value ?? "").length;
            if (len > max) max = Math.min(len + 2, 40);
          });
          col.width = max;
        });
      }
    }

    resume.columns.forEach((col) => {
      col.width = 28;
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `confirmations_par_filiere_${stamp}.xlsx`;

    return new NextResponse(buffer, {
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
