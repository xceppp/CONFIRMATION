import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import type { StudentRow } from "./columns";
import { FILIERES, resolveFiliereFromLabel } from "./filieres";
import { cellValue } from "./confirmations-export";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 36;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const BRAND = "#0a6e8a";
const INK = "#1a1a1a";
const LINE = "#c5d4d0";
const HEADER_BG = "#e8f4f0";

const COLS = [
  { key: "Rang", label: "N°", w: 32 },
  { key: "CNE", label: "CNE", w: 88 },
  { key: "NomComplet", label: "Nom complet", w: 200 },
  { key: "Score", label: "Score", w: 52 },
  { key: "Agent", label: "Agent", w: 70 },
  { key: "DateConfirmation", label: "Date", w: 81 },
] as const;

export type PdfFiliereGroup = {
  code: string;
  name: string;
  rows: StudentRow[];
};

function parseScore(row: StudentRow): number {
  const raw = String(row.Score || "")
    .trim()
    .replace(",", ".");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : -Infinity;
}

function logoPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "estm-header.png"),
    path.join(process.cwd(), "scripts", "estm-header.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Group confirmations by known filière code (score desc). */
export function groupRowsForPublish(rows: StudentRow[]): PdfFiliereGroup[] {
  const buckets = new Map<string, StudentRow[]>();
  const other: StudentRow[] = [];

  for (const row of rows) {
    const label = String(row.Filiere || row.FiliereCode || "");
    const match = resolveFiliereFromLabel(label);
    if (!match) {
      other.push(row);
      continue;
    }
    const list = buckets.get(match.code);
    if (list) list.push(row);
    else buckets.set(match.code, [row]);
  }

  const out: PdfFiliereGroup[] = [];
  for (const f of FILIERES) {
    const list = buckets.get(f.code) || [];
    if (list.length === 0) continue;
    out.push({
      code: f.code,
      name: f.name,
      rows: [...list].sort((a, b) => parseScore(b) - parseScore(a)),
    });
  }
  if (other.length > 0) {
    out.push({
      code: "AUTRE",
      name: "Autres filières",
      rows: [...other].sort((a, b) => parseScore(b) - parseScore(a)),
    });
  }
  return out;
}

type PdfBuildOptions = {
  docTitle: string;
  /** Line under filière name (every page). */
  listSubtitle: string;
  emptyMessage: string;
  totalLabel?: (n: number) => string;
};

/**
 * Shared PDF builder: centered EST logo, filière title, table, page numbers.
 */
export async function buildGroupedListsPdf(
  groups: PdfFiliereGroup[],
  options: PdfBuildOptions,
): Promise<Buffer> {
  const logo = logoPath();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      autoFirstPage: false,
      info: {
        Title: options.docTitle,
        Author: "EST Meknès",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let currentFiliereTitle = "";
    let y = 0;

    function drawCenteredLogo(top: number, maxH: number): number {
      if (!logo) {
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor(BRAND)
          .text(
            "École Supérieure de Technologie — Meknès",
            MARGIN_X,
            top + 12,
            { width: CONTENT_W, align: "center" },
          );
        return maxH;
      }
      try {
        // pdfkit runtime has openImage; typings omit it on some versions
        const openImage = (
          doc as unknown as {
            openImage: (src: string) => { width: number; height: number };
          }
        ).openImage.bind(doc);
        const img = openImage(logo);
        const maxW = CONTENT_W * 0.88;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const x = MARGIN_X + (CONTENT_W - drawW) / 2;
        doc.image(logo, x, top, { width: drawW, height: drawH });
        return drawH;
      } catch {
        return maxH;
      }
    }

    function drawPageChrome() {
      const top = 14;
      const drawnH = drawCenteredLogo(top, 52);
      const ruleY = top + drawnH + 10;
      doc
        .moveTo(MARGIN_X, ruleY)
        .lineTo(MARGIN_X + CONTENT_W, ruleY)
        .strokeColor(BRAND)
        .lineWidth(1.2)
        .stroke();

      y = ruleY + 12;

      if (currentFiliereTitle) {
        doc
          .font("Helvetica-Bold")
          .fontSize(13)
          .fillColor(INK)
          .text(currentFiliereTitle, MARGIN_X, y, {
            width: CONTENT_W,
            align: "center",
          });
        y += 20;
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(BRAND)
          .text(options.listSubtitle, MARGIN_X, y, {
            width: CONTENT_W,
            align: "center",
          });
        y += 16;
      }
    }

    function drawTableHeader() {
      const rowH = 18;
      doc.save();
      doc.rect(MARGIN_X, y, CONTENT_W, rowH).fill(HEADER_BG);
      doc.restore();
      doc.strokeColor(LINE).lineWidth(0.6);
      doc.rect(MARGIN_X, y, CONTENT_W, rowH).stroke();

      let x = MARGIN_X;
      for (const col of COLS) {
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor(INK)
          .text(col.label, x + 3, y + 5, { width: col.w - 6, align: "left" });
        x += col.w;
      }
      y += rowH;
    }

    function ensureSpace(need: number) {
      const bottom = PAGE_H - 36;
      if (y + need <= bottom) return;
      doc.addPage();
      drawPageChrome();
      drawTableHeader();
    }

    function drawDataRow(row: StudentRow, rang: number, zebra: boolean) {
      const rowH = 16;
      ensureSpace(rowH);
      if (zebra) {
        doc.save();
        doc.rect(MARGIN_X, y, CONTENT_W, rowH).fill("#f7faf9");
        doc.restore();
      }
      doc.strokeColor(LINE).lineWidth(0.4);
      doc.rect(MARGIN_X, y, CONTENT_W, rowH).stroke();

      const values: Record<string, string> = {
        Rang: String(rang),
        CNE: cellValue(row, "CNE"),
        NomComplet: cellValue(row, "NomComplet"),
        Score: cellValue(row, "Score"),
        Agent: cellValue(row, "Agent"),
        DateConfirmation: cellValue(row, "DateConfirmation"),
      };

      let x = MARGIN_X;
      for (const col of COLS) {
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor(INK)
          .text(values[col.key] || "", x + 3, y + 4, {
            width: col.w - 6,
            align:
              col.key === "Rang" || col.key === "Score" ? "center" : "left",
            lineBreak: false,
            ellipsis: true,
          });
        x += col.w;
      }
      y += rowH;
    }

    function startFiliere(title: string) {
      currentFiliereTitle = title;
      doc.addPage();
      drawPageChrome();
      drawTableHeader();
    }

    if (groups.length === 0) {
      currentFiliereTitle = "";
      doc.addPage();
      drawPageChrome();
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(INK)
        .text(options.emptyMessage, MARGIN_X, y + 20, {
          width: CONTENT_W,
          align: "center",
        });
    } else {
      for (const g of groups) {
        startFiliere(`${g.code} — ${g.name}`);
        let rang = 1;
        for (const row of g.rows) {
          drawDataRow(row, rang, rang % 2 === 0);
          rang += 1;
        }
        ensureSpace(22);
        y += 6;
        const totalText = options.totalLabel
          ? options.totalLabel(g.rows.length)
          : `Total : ${g.rows.length} étudiant(s)`;
        doc
          .font("Helvetica-Oblique")
          .fontSize(8)
          .fillColor(BRAND)
          .text(totalText, MARGIN_X, y, {
            width: CONTENT_W,
            align: "right",
          });
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#666666")
        .text(`Page ${i + 1} / ${range.count}`, MARGIN_X, PAGE_H - 24, {
          width: CONTENT_W,
          align: "center",
        });
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#888888")
        .text("www.est.umi.ac.ma", MARGIN_X, PAGE_H - 14, {
          width: CONTENT_W,
          align: "center",
        });
    }

    doc.end();
  });
}

/** All confirmations — Export zone (publication). */
export async function buildConfirmationsPdf(
  rows: StudentRow[],
): Promise<Buffer> {
  return buildGroupedListsPdf(groupRowsForPublish(rows), {
    docTitle: "Listes des confirmations — EST Meknès",
    listSubtitle: "Liste des étudiants ayant confirmé leur inscription",
    emptyMessage: "Aucune confirmation à publier.",
  });
}

/**
 * Final selection — admitted students (top N by places) for inscription.
 */
export async function buildFinalSelectionPdf(
  groups: PdfFiliereGroup[],
): Promise<Buffer> {
  return buildGroupedListsPdf(groups, {
    docTitle: "Listes des admis à l'inscription — EST Meknès",
    listSubtitle: "Liste des étudiants admis à procéder à l'inscription",
    emptyMessage: "Aucune sélection finale à publier.",
    totalLabel: (n) => `Admis : ${n} étudiant(s)`,
  });
}
