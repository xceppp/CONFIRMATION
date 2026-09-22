import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { FILIERES } from "@/lib/filieres";
import { listConfirmations } from "@/lib/sheets";
import {
  cellValue,
  selectTopConfirmationsByPlaces,
} from "@/lib/confirmations-export";
import { buildFinalSelectionPdf } from "@/lib/confirmations-pdf";
import { parseNouveauxInscritsBuffer } from "@/lib/inscrits-parse";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const COLUMNS = [
  { key: "Rang", label: "Rang" },
  { key: "CNE", label: "CNE / Code Massar" },
  { key: "NomComplet", label: "Nom complet" },
  { key: "Filiere", label: "Filière" },
  { key: "Score", label: "Score" },
  { key: "Agent", label: "Agent" },
  { key: "DateConfirmation", label: "Date confirmation" },
] as const;

function parsePlacesFromObject(placesRaw: Record<string, unknown>): {
  code: string;
  name: string;
  places: number;
}[] {
  return FILIERES.map((f) => {
    const raw = placesRaw[f.code] ?? placesRaw[f.code.toLowerCase()] ?? "";
    const n = Number.parseInt(String(raw).trim(), 10);
    return {
      code: f.code,
      name: f.name,
      places: Number.isFinite(n) && n > 0 ? n : 0,
    };
  }).filter((f) => f.places > 0);
}

async function readRequest(request: Request): Promise<{
  format: "excel" | "pdf";
  placesByCode: { code: string; name: string; places: number }[];
  inscritsBuffer: Buffer | null;
}> {
  const ctype = request.headers.get("content-type") || "";
  if (ctype.includes("multipart/form-data")) {
    const form = await request.formData();
    const format =
      String(form.get("format") || "excel").toLowerCase() === "pdf"
        ? "pdf"
        : "excel";
    let placesRaw: Record<string, unknown> = {};
    const placesJson = form.get("places");
    if (typeof placesJson === "string") {
      try {
        placesRaw = JSON.parse(placesJson) as Record<string, unknown>;
      } catch {
        placesRaw = {};
      }
    }
    let inscritsBuffer: Buffer | null = null;
    const file = form.get("inscrits");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const ab = await (file as File).arrayBuffer();
      inscritsBuffer = Buffer.from(ab);
    }
    return {
      format,
      placesByCode: parsePlacesFromObject(placesRaw),
      inscritsBuffer,
    };
  }

  const body = await request.json().catch(() => null);
  const format =
    String(body?.format || "excel").toLowerCase() === "pdf" ? "pdf" : "excel";
  const placesRaw =
    body?.places && typeof body.places === "object"
      ? (body.places as Record<string, unknown>)
      : {};
  return {
    format,
    placesByCode: parsePlacesFromObject(placesRaw),
    inscritsBuffer: null,
  };
}

async function buildExcel(
  selected: {
    code: string;
    name: string;
    places: number;
    rows: import("@/lib/columns").StudentRow[];
  }[],
  summary: {
    code: string;
    name: string;
    places: number;
    confirmed: number;
    selected: number;
    shortfall: number;
  }[],
): Promise<Buffer> {
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
    "Admis",
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

  const sheet = workbook.addWorksheet("Admis_inscription", {
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

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Final: top-N admitted — Excel or PDF (split déjà inscrits on PDF). */
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const { format, placesByCode, inscritsBuffer } = await readRequest(request);

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

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "pdf") {
      const deja = inscritsBuffer
        ? await parseNouveauxInscritsBuffer(inscritsBuffer)
        : null;
      const buffer = await buildFinalSelectionPdf(
        selected.map((g) => ({
          code: g.code,
          name: g.name,
          rows: g.rows,
        })),
        deja,
      );
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="admis_inscription_${stamp}.pdf"`,
        },
      });
    }

    const buffer = await buildExcel(selected, summary);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="admis_inscription_${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
