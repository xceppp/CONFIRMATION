import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { FILIERES, resolveFiliereFromLabel } from "@/lib/filieres";
import { isHorsDelai } from "@/lib/confirmations-export";
import { listConfirmations } from "@/lib/sheets";
import type { StudentRow } from "@/lib/columns";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const HEADERS = ["CNE", "Nom complet", "Téléphone", "Score", "Filière"];

function scoreOf(row: StudentRow): number {
  const n = Number.parseFloat(String(row.Score || "").replace(",", "."));
  return Number.isFinite(n) ? n : -Infinity;
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
  head.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0A6E8A" },
  };
  head.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(sheet.rowCount, 1), column: HEADERS.length },
  };
  sheet.columns = [
    { width: 16 },
    { width: 32 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
  ];
}

function addStudentRows(sheet: ExcelJS.Worksheet, rows: StudentRow[]) {
  sheet.addRow(HEADERS);
  for (const row of rows) {
    const filiere =
      resolveFiliereFromLabel(String(row.Filiere || row.FiliereCode || ""))
        ?.code || String(row.Filiere || "");
    sheet.addRow([
      row.CNE || row.Code || "",
      row.NomComplet || "",
      row.Telephone || "",
      row.Score || "",
      filiere,
    ]);
  }
  styleHeader(sheet);
}

/** Hors délai only — one sheet per filière, score descending, with phone. */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const rows = (await listConfirmations(undefined, { force: true })).filter((row) => isHorsDelai(row));
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Aucun étudiant hors délai." },
        { status: 400 },
      );
    }

    const byCode = new Map<string, StudentRow[]>();
    for (const row of rows) {
      const code =
        resolveFiliereFromLabel(String(row.Filiere || row.FiliereCode || ""))
          ?.code || "AUTRE";
      const list = byCode.get(code);
      if (list) list.push(row);
      else byCode.set(code, [row]);
    }
    for (const list of byCode.values()) {
      list.sort((a, b) => scoreOf(b) - scoreOf(a));
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Confirmation";

    const ordered = [
      ...FILIERES.filter((f) => byCode.has(f.code)),
      ...(byCode.has("AUTRE")
        ? [{ code: "AUTRE", name: "Autres" }]
        : []),
    ];

    const tous = workbook.addWorksheet("Tous");
    const allRows = ordered.flatMap((f) => byCode.get(f.code) || []);
    addStudentRows(tous, allRows);

    for (const f of ordered) {
      const sheet = workbook.addWorksheet(f.code.slice(0, 31));
      addStudentRows(sheet, byCode.get(f.code) || []);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="hors_delai_${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
