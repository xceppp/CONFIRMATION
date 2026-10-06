import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { FILIERES } from "@/lib/filieres";
import {
  buildFinalPoolForFiliere,
  cellValue,
  isHorsDelai,
} from "@/lib/confirmations-export";
import {
  clearHorsDelaiLock,
  getHorsDelaiLockedCnes,
  getListe2ToContactLockedCnes,
  listConfirmations,
  lockHorsDelaiSelection,
} from "@/lib/sheets";
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
  "Seuil contact",
];

function scoreOf(row: StudentRow): number {
  const n = Number.parseFloat(String(row.Score || "").replace(",", "."));
  return Number.isFinite(n) ? n : -Infinity;
}

function rowCne(row: StudentRow): string {
  return String(row.CNE || row.Code || "")
    .trim()
    .toUpperCase();
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

function readPlaces(body: unknown, key = "places"): Record<string, number> {
  if (!body || typeof body !== "object") return {};
  const raw = (body as Record<string, unknown>)[key];
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const f of FILIERES) {
    const v = (raw as Record<string, unknown>)[f.code];
    const n = Number.parseInt(String(v ?? "").trim(), 10);
    if (Number.isFinite(n) && n > 0) out[f.code] = n;
  }
  return out;
}

/** Lock status for the Final admin UI. */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }
  try {
    const lock = await getHorsDelaiLockedCnes();
    return NextResponse.json({
      lockedCount: lock.lockedCount,
      lockedAt: lock.lockedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Hors délai Excel:
 * - action "lock" → freeze current hors-délai wave as 1ère sélection
 * - action "clearLock" → wipe the freeze
 * - default export (with lock) → SEPARATED sheets:
 *     Resume | 1ère sélection Liste normale | 1ère sélection TO CONTACT
 *     | Nouveaux Liste normale | Nouveaux TO CONTACT
 * - onlyNew=true → Nouveaux sheets only
 * - no lock → classic Liste normale + TO CONTACT (everyone)
 */
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const action = String(body?.action || "export").toLowerCase();
    const onlyNew = body?.onlyNew === true;

    const all = await listConfirmations(undefined, { force: true });
    const late = all.filter((row) => isHorsDelai(row));

    if (action === "lock") {
      if (late.length === 0) {
        return NextResponse.json(
          { error: "Aucun étudiant hors délai à verrouiller." },
          { status: 400 },
        );
      }
      const result = await lockHorsDelaiSelection(late);
      return NextResponse.json({
        ok: true,
        message: `1ère sélection hors délai verrouillée (${result.lockedCount} étudiant(s)).`,
        lockedCount: result.lockedCount,
        lockedAt: result.lockedAt,
      });
    }

    if (action === "clearlock" || action === "clear") {
      await clearHorsDelaiLock();
      return NextResponse.json({
        ok: true,
        message: "Verrouillage hors délai effacé.",
        lockedCount: 0,
        lockedAt: "",
      });
    }

    const places = readPlaces(body, "places");
    const extra = readPlaces(body, "extra");
    const third = readPlaces(body, "third");
    if (Object.keys(places).length === 0) {
      return NextResponse.json(
        { error: "Indiquez les places liste 1 pour calculer le seuil." },
        { status: 400 },
      );
    }

    if (late.length === 0) {
      return NextResponse.json(
        { error: "Aucun étudiant hors délai." },
        { status: 400 },
      );
    }

    const lock = await getHorsDelaiLockedCnes();
    const hasLock = lock.lockedCount > 0;
    const list2ContactLock = await getListe2ToContactLockedCnes();

    if (onlyNew && !hasLock) {
      return NextResponse.json(
        {
          error:
            "Aucune 1ère sélection verrouillée. Cliquez d'abord sur « Verrouiller 1ère sélection ».",
        },
        { status: 400 },
      );
    }

    type Bucket = { row: StudentRow; seuil: string; code: string };
    const lockedNormal: Bucket[] = [];
    const lockedContact: Bucket[] = [];
    const newNormal: Bucket[] = [];
    const newContact: Bucket[] = [];

    for (const f of FILIERES) {
      const list1 = places[f.code];
      if (!list1) continue;
      const list2 = extra[f.code] || 0;
      const list3 = third[f.code] || 0;
      // Contact bar: L3 → seuil 3; else L2 → seuil 2; else seuil 1.
      const built = buildFinalPoolForFiliere(
        all,
        f.code,
        f.name,
        list1,
        list2,
        list3,
      );
      // Classic L2 à-contacter band (hors délai > seuil 1) — already contacted.
      const l1Band = buildFinalPoolForFiliere(all, f.code, f.name, list1);
      const alreadyContactedL2 = new Set(
        l1Band.toContact.map(rowCne).filter(Boolean),
      );
      for (const cne of list2ContactLock.cnes) alreadyContactedL2.add(cne);

      const contactSeuil = built.contactSeuil || built.seuil;
      const contactCnes = new Set(
        built.toContact.map(rowCne).filter(Boolean),
      );
      for (const row of built.pool.filter((r) => isHorsDelai(r))) {
        const cne = rowCne(row);
        // Above contact seuil → TO CONTACT only (not Liste normale).
        if (cne && contactCnes.has(cne)) continue;
        const inLock = hasLock && lock.cnes.has(cne);
        const bucket = { row, seuil: contactSeuil, code: f.code };
        if (inLock) lockedNormal.push(bucket);
        else newNormal.push(bucket);
      }
      for (const row of built.toContact) {
        const cne = rowCne(row);
        // Never re-export people already contacted on Liste 2.
        if (cne && alreadyContactedL2.has(cne)) continue;
        const inLock = hasLock && lock.cnes.has(cne);
        const bucket = { row, seuil: contactSeuil, code: f.code };
        if (inLock) lockedContact.push(bucket);
        else newContact.push(bucket);
      }
    }

    const byFiliereThenScore = (a: Bucket, b: Bucket) => {
      const c = a.code.localeCompare(b.code);
      return c !== 0 ? c : scoreOf(b.row) - scoreOf(a.row);
    };
    lockedNormal.sort(byFiliereThenScore);
    lockedContact.sort(byFiliereThenScore);
    newNormal.sort(byFiliereThenScore);
    newContact.sort(byFiliereThenScore);

    if (
      onlyNew &&
      newNormal.length === 0 &&
      newContact.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Aucun nouveau hors délai depuis le verrouillage de la 1ère sélection.",
        },
        { status: 400 },
      );
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Confirmation";

    // Resume: counts for both waves
    const resume = workbook.addWorksheet("Resume", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    resume.addRow(["Groupe", "Liste normale", "TO CONTACT", "Total"]);
    resume.getRow(1).font = { bold: true };
    if (hasLock && !onlyNew) {
      resume.addRow([
        "1ère sélection (verrouillée)",
        lockedNormal.length,
        lockedContact.length,
        lockedNormal.length + lockedContact.length,
      ]);
    }
    resume.addRow([
      hasLock ? "Nouveaux (après verrou)" : "Tous hors délai",
      newNormal.length,
      newContact.length,
      newNormal.length + newContact.length,
    ]);
    if (hasLock) {
      resume.addRow(["Verrouillé le", lock.lockedAt || "—", "", ""]);
      resume.addRow(["CNEs verrouillés", lock.lockedCount, "", ""]);
    }
    resume.columns.forEach((col) => {
      col.width = 28;
    });

    if (hasLock && !onlyNew) {
      addRows(
        workbook.addWorksheet("1ere selection Liste normale"),
        lockedNormal,
      );
      addRows(
        workbook.addWorksheet("1ere selection TO CONTACT"),
        lockedContact,
      );
    }

    // No lock → new* = everyone. With lock → new* = inserts after freeze.
    addRows(
      workbook.addWorksheet(
        hasLock ? "Nouveaux Liste normale" : "Liste normale",
      ),
      newNormal,
    );
    addRows(
      workbook.addWorksheet(hasLock ? "Nouveaux TO CONTACT" : "TO CONTACT"),
      newContact,
    );

    const stamp = new Date().toISOString().slice(0, 10);
    const fileBase = onlyNew
      ? "hors_delai_nouveaux"
      : hasLock
        ? "hors_delai_separe"
        : "hors_delai";
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
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
