import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { FILIERES } from "@/lib/filieres";
import { listConfirmations } from "@/lib/sheets";
import {
  buildFinalPoolForFiliere,
  cellValue,
  selectFinalRound,
} from "@/lib/confirmations-export";
import { buildFinalSelectionPdf } from "@/lib/confirmations-pdf";
import type { StudentRow } from "@/lib/columns";
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

function readCountMap(body: unknown, key: string): Record<string, unknown> {
  if (!body || typeof body !== "object" || !(key in body)) return {};
  const raw = (body as Record<string, unknown>)[key];
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
}

function parseRoundSpecs(body: unknown): {
  code: string;
  name: string;
  list1: number;
  list2: number;
  list3: number;
}[] {
  const placesRaw = readCountMap(body, "places");
  const extraRaw = readCountMap(body, "extra");
  const thirdRaw = readCountMap(body, "third");
  return FILIERES.map((f) => {
    const raw1 = placesRaw[f.code] ?? placesRaw[f.code.toLowerCase()] ?? "";
    const raw2 = extraRaw[f.code] ?? extraRaw[f.code.toLowerCase()] ?? "";
    const raw3 = thirdRaw[f.code] ?? thirdRaw[f.code.toLowerCase()] ?? "";
    const list1 = Number.parseInt(String(raw1).trim(), 10);
    const list2 = Number.parseInt(String(raw2).trim(), 10);
    const list3 = Number.parseInt(String(raw3).trim(), 10);
    return {
      code: f.code,
      name: f.name,
      list1: Number.isFinite(list1) && list1 > 0 ? list1 : 0,
      list2: Number.isFinite(list2) && list2 > 0 ? list2 : 0,
      list3: Number.isFinite(list3) && list3 > 0 ? list3 : 0,
    };
  });
}

function parseRound(body: unknown): 1 | 2 | 3 {
  const n = Number((body as { round?: unknown } | null)?.round);
  if (n === 3) return 3;
  if (n === 2) return 2;
  return 1;
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
    list1: number;
    list2: number;
    seuil: string;
    seuilList2: string;
  }[],
  round: 1 | 2 | 3,
  toContact: {
    code: string;
    name: string;
    rows: StudentRow[];
    seuil?: string;
  }[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Confirmation";

  const resume = workbook.addWorksheet("Resume", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  resume.addRow(
    round === 3
      ? [
          "Code",
          "Filière",
          "Liste 1",
          "Seuil liste 1",
          "Liste 2",
          "Seuil liste 2",
          "Liste 3 demandée",
          "Confirmés",
          "Sélectionnés",
          "Manque",
        ]
      : round === 2
        ? [
            "Code",
            "Filière",
            "Liste 1",
            "Seuil liste 1",
            "Liste 2 demandée",
            "Confirmés",
            "Sélectionnés",
            "Manque",
          ]
        : [
            "Code",
            "Filière",
            "Places demandées",
            "Confirmés",
            "Admis",
            "Manque",
          ],
  );
  resume.getRow(1).font = { bold: true };
  for (const s of summary) {
    resume.addRow(
      round === 3
        ? [
            s.code,
            s.name,
            s.list1,
            s.seuil,
            s.list2,
            s.seuilList2,
            s.places,
            s.confirmed,
            s.selected,
            s.shortfall,
          ]
        : round === 2
          ? [
              s.code,
              s.name,
              s.list1,
              s.seuil,
              s.places,
              s.confirmed,
              s.selected,
              s.shortfall,
            ]
          : [s.code, s.name, s.places, s.confirmed, s.selected, s.shortfall],
    );
  }
  if (round >= 2) {
    const nContact = toContact.reduce((acc, g) => acc + g.rows.length, 0);
    resume.addRow([]);
    resume.addRow([
      "TO CONTACT hors délai",
      `${nContact} étudiant(s) — feuille « TO CONTACT hors delai »`,
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

  const contactRows = toContact.flatMap((g) => g.rows);
  // Liste 2 / 3 Excel: always include TO CONTACT hors délai sheet.
  if (round >= 2 || contactRows.length > 0) {
    const contact = workbook.addWorksheet("TO CONTACT hors delai", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    contact.addRow([
      "CNE / Code Massar",
      "Nom complet",
      "Filière",
      "Score",
      "Seuil liste 1",
      "Téléphone",
      "Agent",
      "Date confirmation",
    ]);
    contact.getRow(1).font = { bold: true };
    if (contactRows.length === 0) {
      contact.addRow([
        "—",
        "Aucun hors délai au-dessus du seuil",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    } else {
      for (const group of toContact) {
        const seuil =
          summary.find((s) => s.code === group.code)?.seuil ||
          group.seuil ||
          "";
        for (const row of group.rows) {
          contact.addRow([
            cellValue(row, "CNE"),
            cellValue(row, "NomComplet"),
            cellValue(row, "Filiere") || group.name,
            cellValue(row, "Score"),
            seuil,
            cellValue(row, "Telephone"),
            cellValue(row, "Agent"),
            cellValue(row, "DateConfirmation"),
          ]);
        }
      }
    }
    contact.columns.forEach((col) => {
      col.width = 18;
    });
    contact.getColumn(2).width = 32;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Final: top-N admitted for inscription — Excel (local) or PDF (publish). */
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const format =
      String(body?.format || "excel").toLowerCase() === "pdf" ? "pdf" : "excel";
    const round = parseRound(body);
    const specs = parseRoundSpecs(body);
    const active = specs.filter((s) =>
      round === 1 ? s.list1 > 0 : round === 2 ? s.list2 > 0 : s.list3 > 0,
    );

    if (active.length === 0) {
      return NextResponse.json(
        {
          error:
            round === 3
              ? "Indiquez au moins un nombre pour la liste 3 (> 0)."
              : round === 2
                ? "Indiquez au moins un nombre pour la liste 2 (> 0)."
                : "Indiquez au moins un nombre de places (> 0) pour une filière.",
        },
        { status: 400 },
      );
    }

    if (round === 2) {
      const missingList1 = active.filter((s) => s.list1 <= 0);
      if (missingList1.length > 0) {
        return NextResponse.json(
          {
            error: `Liste 2 : indiquez d'abord le nombre de la liste 1 pour ${missingList1
              .map((s) => s.code)
              .join(", ")}.`,
          },
          { status: 400 },
        );
      }
    }

    if (round === 3) {
      const missing = active.filter((s) => s.list1 <= 0 || s.list2 <= 0);
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Liste 3 : indiquez d'abord liste 1 et liste 2 pour ${missing
              .map((s) => s.code)
              .join(", ")}.`,
          },
          { status: 400 },
        );
      }
    }

    const rows = await listConfirmations(undefined, { force: true });
    const { selected, summary, toContact } = selectFinalRound(
      rows,
      active,
      round,
    );

    // Liste 2/3 Excel: collect ALL hors-délai TO CONTACT for every filière
    // with a liste-1 count (not only filières that have list2/list3 places).
    let contactForExcel = toContact.map((g) => ({
      ...g,
      seuil: summary.find((s) => s.code === g.code)?.seuil || "",
    }));
    if (round >= 2) {
      const byCode = new Map<
        string,
        { code: string; name: string; rows: StudentRow[]; seuil: string }
      >();
      for (const f of specs) {
        if (f.list1 <= 0) continue;
        const built = buildFinalPoolForFiliere(rows, f.code, f.name, f.list1);
        if (built.toContact.length === 0) continue;
        byCode.set(f.code, {
          code: f.code,
          name: f.name,
          rows: built.toContact,
          seuil: built.seuil,
        });
      }
      contactForExcel = [...byCode.values()];
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const fileBase =
      round === 3
        ? "admis_liste3"
        : round === 2
          ? "admis_liste2"
          : "admis_inscription";

    if (format === "pdf") {
      const buffer = await buildFinalSelectionPdf(
        selected.map((g) => ({
          code: g.code,
          name: g.name,
          rows: g.rows,
        })),
        null,
        round === 3
          ? {
              docTitle: "Troisième liste des admis — EST Meknès",
              listSubtitle:
                "Troisième liste — étudiants admis à procéder à l'inscription",
              totalLabel: (n) => `Liste 3 : ${n} étudiant(s)`,
            }
          : round === 2
            ? {
                docTitle: "Deuxième liste des admis — EST Meknès",
                listSubtitle:
                  "Deuxième liste — étudiants admis à procéder à l'inscription",
                totalLabel: (n) => `Liste 2 : ${n} étudiant(s)`,
              }
            : undefined,
      );
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileBase}_${stamp}.pdf"`,
        },
      });
    }

    const buffer = await buildExcel(
      selected,
      summary,
      round,
      contactForExcel,
    );
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}_${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
