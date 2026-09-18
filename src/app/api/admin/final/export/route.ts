import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { FILIERES } from "@/lib/filieres";
import { listConfirmations } from "@/lib/sheets";
import {
  cellValue,
  selectTopConfirmationsByPlaces,
} from "@/lib/confirmations-export";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const COLUMNS = [
  { key: "Rang", label: "Rang" },
  { key: "CNE", label: "CNE / Code Massar" },
  { key: "NomComplet", label: "Nom complet" },
  { key: "Filiere", label: "Filière" },
  { key: "Score", label: "Score" },
  { key: "Agent", label: "Agent" },
  { key: "DateConfirmation", label: "Date confirmation" },
] as const;

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const placesRaw =
      body?.places && typeof body.places === "object" ? body.places : {};

    const placesByCode = FILIERES.map((f) => {
      const raw = placesRaw[f.code] ?? placesRaw[f.code.toLowerCase()] ?? "";
      const n = Number.parseInt(String(raw).trim(), 10);
      return {
        code: f.code,
        name: f.name,
        places: Number.isFinite(n) && n > 0 ? n : 0,
      };
    }).filter((f) => f.places > 0);

    if (placesByCode.length === 0) {
      return NextResponse.json(
        {
          error:
            "Indiquez au moins un nombre de places (> 0) pour une filière.",
        },
        { status: 400 },
      );
    }

    const rows = await listConfirmations();
    const { selected, summary } = selectTopConfirmationsByPlaces(
      rows,
      placesByCode,
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Confirmation";

    const resume = workbook.addWorksheet("Resume", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    resume.addRow([
      "Code",
      "Filière",
      "Places demandées",
      "Confirmés",
      "Sélectionnés",
      "Manque",
    ]);
    resume.getRow(1).font = { bold: true };
    for (const s of summary) {
      resume.addRow([
        s.code,
        s.name,
        s.places,
        s.confirmed,
        s.selected,
        s.shortfall,
      ]);
    }
    resume.columns.forEach((col) => {
      col.width = 18;
    });
    resume.getColumn(2).width = 42;

    const sheet = workbook.addWorksheet("Selection_finale", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.addRow(COLUMNS.map((c) => c.label));
    sheet.getRow(1).font = { bold: true };

    for (const group of selected) {
      group.rows.forEach((row, i) => {
        sheet.addRow([
          i + 1,
          cellValue(row, "CNE"),
          cellValue(row, "NomComplet"),
          cellValue(row, "Filiere") || group.name,
          cellValue(row, "Score"),
          cellValue(row, "Agent"),
          cellValue(row, "DateConfirmation"),
        ]);
      });
    }

    sheet.columns.forEach((col) => {
      let max = 12;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? "").length;
        if (len > max) max = Math.min(len + 2, 40);
      });
      col.width = max;
    });

    // One sheet per filière that has a selection
    for (const group of selected) {
      const title = group.code.slice(0, 31);
      const ws = workbook.addWorksheet(title, {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      ws.addRow(COLUMNS.map((c) => c.label));
      ws.getRow(1).font = { bold: true };
      group.rows.forEach((row, i) => {
        ws.addRow([
          i + 1,
          cellValue(row, "CNE"),
          cellValue(row, "NomComplet"),
          cellValue(row, "Filiere") || group.name,
          cellValue(row, "Score"),
          cellValue(row, "Agent"),
          cellValue(row, "DateConfirmation"),
        ]);
      });
      ws.columns.forEach((col) => {
        let max = 12;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const len = String(cell.value ?? "").length;
          if (len > max) max = Math.min(len + 2, 40);
        });
        col.width = max;
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `selection_finale_${stamp}.xlsx`;

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
