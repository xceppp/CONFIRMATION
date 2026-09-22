import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { listConfirmations } from "@/lib/sheets";
import {
  DEFAULT_EXPORT_KEYS,
  EXPORT_COLUMNS,
  cellValue,
  styleConfirmationsSheet,
} from "@/lib/confirmations-export";
import { groupRowsForPublish } from "@/lib/confirmations-pdf";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Excel sheet title: max 31 chars, no \ / ? * [ ] */
function sheetTitle(code: string, _name: string, used: Set<string>): string {
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

    if (groups.length === 0) {
      const empty = workbook.addWorksheet("Confirmations", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      empty.addRow(labels);
      styleConfirmationsSheet(empty, columns, { addTotal: true });
      resume.addRow(["—", "Aucune confirmation", 0]);
    } else {
      let grand = 0;
      for (const g of groups) {
        resume.addRow([g.code, g.name, g.rows.length]);
        grand += g.rows.length;
        const sheet = workbook.addWorksheet(
          sheetTitle(g.code, g.name, usedTitles),
          {
            views: [{ state: "frozen", ySplit: 1 }],
          },
        );
        sheet.addRow(labels);
        for (const row of g.rows) {
          sheet.addRow(columns.map((key) => cellValue(row, key)));
        }
        styleConfirmationsSheet(sheet, columns, {
          addTotal: true,
          totalLabel: `Total confirmés — ${g.code}`,
        });
      }
      resume.addRow(["", "TOTAL", grand]);
    }

    // Resume: simple branded table (not the student column layout)
    const resumeHeader = resume.getRow(1);
    resumeHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
    resumeHeader.alignment = { vertical: "middle", horizontal: "center" };
    resumeHeader.height = 22;
    resumeHeader.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0A6E8A" },
      };
    });
    resume.getColumn(1).width = 10;
    resume.getColumn(2).width = 48;
    resume.getColumn(3).width = 14;
    resume.getColumn(3).alignment = { horizontal: "center" };
    for (let r = 2; r <= resume.rowCount; r++) {
      const row = resume.getRow(r);
      row.height = 18;
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFC5D4D0" } },
          left: { style: "thin", color: { argb: "FFC5D4D0" } },
          bottom: { style: "thin", color: { argb: "FFC5D4D0" } },
          right: { style: "thin", color: { argb: "FFC5D4D0" } },
        };
      });
    }
    if (resume.rowCount > 1) {
      resume.getRow(resume.rowCount).font = { bold: true };
    }

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
