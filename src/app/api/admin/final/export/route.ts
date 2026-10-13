import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { FILIERES } from "@/lib/filieres";
import {
  getListe2ToContactLockedCnes,
  listConfirmations,
  lockListe2ToContact,
} from "@/lib/sheets";
import {
  buildFinalPoolForFiliere,
  cellValue,
  selectFinalRound,
} from "@/lib/confirmations-export";
import { buildFinalSelectionPdf } from "@/lib/confirmations-pdf";
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

function parseCount(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseRoundSpecs(body: unknown): {
  code: string;
  name: string;
  list1: number;
  list2: number;
  list3: number;
  list4: number;
  list5: number;
}[] {
  const placesRaw = readCountMap(body, "places");
  const extraRaw = readCountMap(body, "extra");
  const thirdRaw = readCountMap(body, "third");
  const fourthRaw = readCountMap(body, "fourth");
  const fifthRaw = readCountMap(body, "fifth");
  return FILIERES.map((f) => {
    const pick = (map: Record<string, unknown>) =>
      map[f.code] ?? map[f.code.toLowerCase()] ?? "";
    return {
      code: f.code,
      name: f.name,
      list1: parseCount(pick(placesRaw)),
      list2: parseCount(pick(extraRaw)),
      list3: parseCount(pick(thirdRaw)),
      list4: parseCount(pick(fourthRaw)),
      list5: parseCount(pick(fifthRaw)),
    };
  });
}

function parseRound(body: unknown): 1 | 2 | 3 | 4 | 5 {
  const n = Number((body as { round?: unknown } | null)?.round);
  if (n === 5) return 5;
  if (n === 4) return 4;
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
    list3?: number;
    list4?: number;
    list5?: number;
    seuilList3?: string;
    seuilList4?: string;
    seuilList5?: string;
  }[],
  round: 1 | 2 | 3 | 4 | 5,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Confirmation";

  const resume = workbook.addWorksheet("Resume", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  resume.addRow(
    round === 5
      ? [
          "Code",
          "Filière",
          "Liste 1",
          "Seuil liste 1",
          "Liste 2",
          "Seuil liste 2",
          "Liste 3",
          "Seuil liste 3",
          "Liste 4",
          "Seuil liste 4",
          "Liste 5 demandée",
          "Seuil liste 5",
          "Confirmés",
          "Sélectionnés",
          "Manque",
        ]
      : round === 4
        ? [
            "Code",
            "Filière",
            "Liste 1",
            "Seuil liste 1",
            "Liste 2",
            "Seuil liste 2",
            "Liste 3",
            "Seuil liste 3",
            "Liste 4 demandée",
            "Seuil liste 4",
            "Confirmés",
            "Sélectionnés",
            "Manque",
          ]
        : round === 3
      ? [
          "Code",
          "Filière",
          "Liste 1",
          "Seuil liste 1",
          "Liste 2",
          "Seuil liste 2",
          "Liste 3 demandée",
          "Seuil liste 3",
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
      round === 5
        ? [
            s.code,
            s.name,
            s.list1,
            s.seuil,
            s.list2,
            s.seuilList2,
            s.list3 || "",
            s.seuilList3 || "",
            s.list4 || "",
            s.seuilList4 || "",
            s.places,
            s.seuilList5 || "",
            s.confirmed,
            s.selected,
            s.shortfall,
          ]
        : round === 4
          ? [
              s.code,
              s.name,
              s.list1,
              s.seuil,
              s.list2,
              s.seuilList2,
              s.list3 || "",
              s.seuilList3 || "",
              s.places,
              s.seuilList4 || "",
              s.confirmed,
              s.selected,
              s.shortfall,
            ]
          : round === 3
        ? [
            s.code,
            s.name,
            s.list1,
            s.seuil,
            s.list2,
            s.seuilList2,
            s.places,
            s.seuilList3 || "",
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
      round === 1
        ? s.list1 > 0
        : round === 2
          ? s.list2 > 0
          : round === 3
            ? s.list3 > 0
            : round === 4
              ? s.list4 > 0
              : s.list5 > 0,
    );

    if (active.length === 0) {
      return NextResponse.json(
        {
          error:
            round >= 3
              ? `Indiquez au moins un nombre pour la liste ${round} (> 0).`
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

    if (round === 4 || round === 5) {
      const missing = active.filter(
        (s) => s.list1 <= 0 || s.list2 <= 0 || s.list3 <= 0,
      );
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Liste ${round} : indiquez d'abord liste 1, 2 et 3 pour ${missing
              .map((s) => s.code)
              .join(", ")}.`,
          },
          { status: 400 },
        );
      }
    }
    if (round === 5) {
      const missing4 = active.filter((s) => s.list4 <= 0);
      if (missing4.length > 0) {
        return NextResponse.json(
          {
            error: `Liste 5 : indiquez d'abord la liste 4 pour ${missing4
              .map((s) => s.code)
              .join(", ")}.`,
          },
          { status: 400 },
        );
      }
    }

    const rows = await listConfirmations(undefined, { force: true });

    const list2ContactLock =
      round === 3
        ? await getListe2ToContactLockedCnes()
        : { cnes: new Set<string>(), lockedCount: 0, lockedAt: "" };

    const { selected, summary } = selectFinalRound(
      rows,
      active,
      round,
      round === 3
        ? { list2ToContactCnes: list2ContactLock.cnes }
        : undefined,
    );

    // Keep the Liste 2 contact lock (used to exclude already-called students
    // from later lists). Those names are not written into the Excel file.
    if (round === 2 && format === "excel") {
      const lockedRows = specs.flatMap((f) => {
        if (f.list1 <= 0) return [];
        return buildFinalPoolForFiliere(rows, f.code, f.name, f.list1)
          .toContact;
      });
      if (lockedRows.length > 0) await lockListe2ToContact(lockedRows);
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const fileBase =
      round === 5
        ? "admis_liste5"
        : round === 4
          ? "admis_liste4"
          : round === 3
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
        round === 5
          ? {
              docTitle: "Cinquième liste des admis — EST Meknès",
              listSubtitle:
                "Cinquième liste — étudiants admis à procéder à l'inscription",
              totalLabel: (n: number) => `Liste 5 : ${n} étudiant(s)`,
            }
          : round === 4
            ? {
                docTitle: "Quatrième liste des admis — EST Meknès",
                listSubtitle:
                  "Quatrième liste — étudiants admis à procéder à l'inscription",
                totalLabel: (n: number) => `Liste 4 : ${n} étudiant(s)`,
              }
            : round === 3
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

    const buffer = await buildExcel(selected, summary, round);
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
