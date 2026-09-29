import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { FILIERES } from "@/lib/filieres";
import {
  buildFinalPoolForFiliere,
  cellValue,
  isHorsDelai,
} from "@/lib/confirmations-export";
import { listConfirmations } from "@/lib/sheets";
import type { StudentRow } from "@/lib/columns";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const HEADERS = [
  "CNE",
  "Nom complet",
  "Téléphone",
  "Score",
  "Filière",
  "Seuil",
];

function scoreOf(row: StudentRow): number {
  const n = Number.parseFloat(String(row.Score || "").replace(",", "."));
  return Number.isFinite(n) ? n : -Infinity;
}

function styleHeader(sheet: ExcelJS.Worksheet, colCount: number) {
  const head = sheet.getRow(1);
  head.font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    name: "Calibri",
    size: 11,
  };
  head.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0A6E8A" },
  };
  head.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(sheet.rowCount, 1), column: colCount },
  };
  sheet.columns = [
    { width: 16 },
    { width: 32 },
    { width: 16 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
  ];
}

function addRows(
  sheet: ExcelJS.Worksheet,
  rows: { row: StudentRow; seuil: string; code: string }[],
) {
  sheet.addRow(HEADERS);
  for (const { row, seuil, code } of rows) {
    sheet.addRow([
      cellValue(row, "CNE"),
      cellValue(row, "NomComplet"),
      cellValue(row, "Telephone"),
      cellValue(row, "Score"),
      code,
      seuil,
    ]);
  }
  styleHeader(sheet, HEADERS.length);
}

function readPlaces(body: unknown): Record<string, number> {
  if (!body || typeof body !== "object") return {};
  const raw = (body as { places?: unknown }).places;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const f of FILIERES) {
    const v = (raw as Record<string, unknown>)[f.code];
    const n = Number.parseInt(String(v ?? "").trim(), 10);
    if (Number.isFinite(n) && n > 0) out[f.code] = n;
  }
  return out;
}

/**
 * Hors délai Excel only:
 * - "Liste normale" = hors délai with score ≤ seuil (join normal ranking)
 * - "TO CONTACT" = hors délai with score > seuil
 * Never used for the publish PDF.
 */
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const places = readPlaces(body);
    if (Object.keys(places).length === 0) {
      return NextResponse.json(
        { error: "Indiquez les places liste 1 pour calculer le seuil." },
        { status: 400 },
      );
    }

    const all = await listConfirmations(undefined, { force: true });
    const late = all.filter((row) => isHorsDelai(row));
    if (late.length === 0) {
      return NextResponse.json(
        { error: "Aucun étudiant hors délai." },
        { status: 400 },
      );
    }

    const normal: { row: StudentRow; seuil: string; code: string }[] = [];
    const contact: { row: StudentRow; seuil: string; code: string }[] = [];

    for (const f of FILIERES) {
      const list1 = places[f.code];
      if (!list1) continue;
      const built = buildFinalPoolForFiliere(all, f.code, f.name, list1);
      for (const row of built.pool.filter((r) => isHorsDelai(r))) {
        normal.push({ row, seuil: built.seuil, code: f.code });
      }
      for (const row of built.toContact) {
        contact.push({ row, seuil: built.seuil, code: f.code });
      }
    }

    normal.sort((a, b) => {
      const c = a.code.localeCompare(b.code);
      return c !== 0 ? c : scoreOf(b.row) - scoreOf(a.row);
    });
    contact.sort((a, b) => {
      const c = a.code.localeCompare(b.code);
      return c !== 0 ? c : scoreOf(b.row) - scoreOf(a.row);
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Confirmation";

    const normale = workbook.addWorksheet("Liste normale");
    addRows(normale, normal);

    const toContact = workbook.addWorksheet("TO CONTACT");
    addRows(toContact, contact);

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
