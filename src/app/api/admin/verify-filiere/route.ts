import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import type { StudentRow } from "@/lib/columns";
import { resolveFiliereFromLabel } from "@/lib/filieres";
import {
  getEtudiantsByCode,
  listConfirmations,
  refreshStudents,
} from "@/lib/sheets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type Mismatch = {
  cne: string;
  nom: string;
  confirmedFiliere: string;
  confirmedCode: string;
  score: string;
  agent: string;
  date: string;
  horsDelai: string;
  availableCodes: string;
  availableNames: string;
  reason: string;
};

function codesOnStudent(rows: StudentRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const fromCode = String(row.FiliereCode || "")
      .trim()
      .toUpperCase();
    if (fromCode) set.add(fromCode);
    const resolved = resolveFiliereFromLabel(
      String(row.Filiere || row.FiliereCode || ""),
    );
    if (resolved) set.add(resolved.code);
  }
  return [...set].sort();
}

/** Every confirmation filière must exist on that student's waiting-list rows. */
export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format =
    String(searchParams.get("format") || "json").toLowerCase() === "excel"
      ? "excel"
      : "json";

  try {
    await refreshStudents({ force: true });
    const confirmations = await listConfirmations(undefined, { force: true });

    const mismatches: Mismatch[] = [];
    let checked = 0;

    for (const conf of confirmations) {
      checked += 1;
      const cne = String(conf.CNE || conf.Code || "")
        .trim()
        .toUpperCase();
      const confirmedLabel = String(conf.Filiere || conf.FiliereCode || "");
      const confirmed = resolveFiliereFromLabel(confirmedLabel);
      const confirmedCode = confirmed?.code || "";
      const rows = cne ? await getEtudiantsByCode(cne) : [];
      const available = codesOnStudent(rows);
      const availableNames = rows
        .map((r) => String(r.Filiere || r.FiliereCode || "").trim())
        .filter(Boolean)
        .join(" | ");

      let reason = "";
      if (!cne) reason = "CNE manquant";
      else if (!confirmedCode) reason = "Filière confirmée non reconnue";
      else if (rows.length === 0) reason = "Absent de toute liste d'attente";
      else if (!available.includes(confirmedCode)) {
        reason = `Confirmé ${confirmedCode} mais absent de cette filière`;
      }

      if (!reason) continue;

      mismatches.push({
        cne,
        nom: String(conf.NomComplet || "").trim(),
        confirmedFiliere: confirmedLabel,
        confirmedCode: confirmedCode || "?",
        score: String(conf.Score || ""),
        agent: String(conf.Agent || ""),
        date: String(conf.DateConfirmation || ""),
        horsDelai: String(conf.HorsDelai || "") === "1" ? "oui" : "",
        availableCodes: available.join(", ") || "—",
        availableNames: availableNames || "—",
        reason,
      });
    }

    if (format === "excel") {
      if (mismatches.length === 0) {
        return NextResponse.json({
          ok: true,
          checked,
          mismatches: 0,
          message: "Aucune anomalie. Toutes les confirmations existent dans la filière indiquée.",
        });
      }

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Anomalies", {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      ws.addRow([
        "CNE",
        "Nom",
        "Filière confirmée",
        "Code",
        "Score",
        "Agent",
        "Date",
        "Hors délai",
        "Filières réelles (codes)",
        "Filières réelles (noms)",
        "Anomalie",
      ]);
      const head = ws.getRow(1);
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
      for (const m of mismatches) {
        ws.addRow([
          m.cne,
          m.nom,
          m.confirmedFiliere,
          m.confirmedCode,
          m.score,
          m.agent,
          m.date,
          m.horsDelai,
          m.availableCodes,
          m.availableNames,
          m.reason,
        ]);
      }
      ws.columns = [
        { width: 14 },
        { width: 28 },
        { width: 36 },
        { width: 10 },
        { width: 12 },
        { width: 14 },
        { width: 20 },
        { width: 12 },
        { width: 22 },
        { width: 40 },
        { width: 40 },
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="anomalies_filiere_confirmation_${stamp}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      ok: mismatches.length === 0,
      checked,
      mismatches: mismatches.length,
      rows: mismatches,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
