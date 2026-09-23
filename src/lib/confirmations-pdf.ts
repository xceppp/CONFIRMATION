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
  { key: "CNE", label: "CNE", w: 120, align: "left" as const },
  { key: "NomComplet", label: "Nom complet", w: 290, align: "left" as const },
  { key: "Score", label: "Score", w: 60, align: "center" as const },
  { key: "FiliereCode", label: "Filière", w: 53, align: "center" as const },
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
          .text(col.label, x + 3, y + 5, {
            width: col.w - 6,
            align: col.align,
          });
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

    function drawDataRow(
      row: StudentRow,
      rang: number,
      zebra: boolean,
      filiereCode: string,
    ) {
      const rowH = 15;
      ensureSpace(rowH);
      if (zebra) {
        doc.save();
        doc.rect(MARGIN_X, y, CONTENT_W, rowH).fill("#f7faf9");
        doc.restore();
      }
      doc.strokeColor(LINE).lineWidth(0.4);
      doc.rect(MARGIN_X, y, CONTENT_W, rowH).stroke();

      const values: Record<string, string> = {
        CNE: cellValue(row, "CNE"),
        NomComplet: cellValue(row, "NomComplet").toUpperCase(),
        Score: cellValue(row, "Score"),
        FiliereCode: filiereCode,
      };

      let x = MARGIN_X;
      for (const col of COLS) {
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor(INK)
          .text(values[col.key] || "", x + 3, y + 3.5, {
            width: col.w - 6,
            align: col.align,
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
          drawDataRow(row, rang, rang % 2 === 0, g.code);
          rang += 1;
        }
        ensureSpace(24);
        y += 6;
        const totalText = options.totalLabel
          ? options.totalLabel(g.rows.length)
          : `Nombre d'étudiants confirmés : ${g.rows.length}`;
        doc.save();
        doc.rect(MARGIN_X, y, CONTENT_W, 18).fill(HEADER_BG);
        doc.restore();
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(BRAND)
          .text(totalText, MARGIN_X + 6, y + 5, {
            width: CONTENT_W - 12,
            align: "right",
          });
        y += 20;
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

export type DejaInscritMap = Map<
  string,
  { parcours: string; code: string }
>;

const COLS_CHANGE = [
  { key: "Rang", label: "N°", w: 28, align: "center" as const },
  { key: "CNE", label: "CNE", w: 95, align: "left" as const },
  { key: "NomComplet", label: "Nom complet", w: 210, align: "left" as const },
  { key: "Score", label: "Score", w: 50, align: "center" as const },
  { key: "Ancienne", label: "Anc.", w: 48, align: "center" as const },
  { key: "FiliereCode", label: "Admis", w: 52, align: "center" as const },
] as const;

/**
 * Final PDF: per filière, two clearly separated blocks —
 * 1) Admis à l'inscription (not already enrolled)
 * 2) Étudiants déjà inscrits — changement de filière
 */
export async function buildFinalSelectionPdf(
  groups: PdfFiliereGroup[],
  dejaInscrits?: DejaInscritMap | null,
  pdfOptions?: {
    docTitle?: string;
    listSubtitle?: string;
    totalLabel?: (n: number) => string;
  },
): Promise<Buffer> {
  if (!dejaInscrits || dejaInscrits.size === 0) {
    return buildGroupedListsPdf(groups, {
      docTitle:
        pdfOptions?.docTitle ||
        "Listes des admis à l'inscription — EST Meknès",
      listSubtitle:
        pdfOptions?.listSubtitle ||
        "Liste des étudiants admis à procéder à l'inscription",
      emptyMessage: "Aucune sélection finale à publier.",
      totalLabel:
        pdfOptions?.totalLabel || ((n) => `Admis : ${n} étudiant(s)`),
    });
  }

  const logo = logoPath();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      autoFirstPage: false,
      info: {
        Title: "Listes des admis à l'inscription — EST Meknès",
        Author: "EST Meknès",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let currentFiliereTitle = "";
    let currentSectionSubtitle = "";
    let y = 0;
    let useChangeCols = false;

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
        y += 18;
      }
      if (currentSectionSubtitle) {
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(BRAND)
          .text(currentSectionSubtitle, MARGIN_X, y, {
            width: CONTENT_W,
            align: "center",
          });
        y += 16;
      }
    }

    function activeCols() {
      return useChangeCols ? COLS_CHANGE : COLS;
    }

    function drawTableHeader() {
      const cols = activeCols();
      const rowH = 18;
      doc.save();
      doc
        .rect(MARGIN_X, y, CONTENT_W, rowH)
        .fill(useChangeCols ? "#fff4e5" : HEADER_BG);
      doc.restore();
      doc.strokeColor(LINE).lineWidth(0.6);
      doc.rect(MARGIN_X, y, CONTENT_W, rowH).stroke();
      let x = MARGIN_X;
      for (const col of cols) {
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor(INK)
          .text(col.label, x + 3, y + 5, {
            width: col.w - 6,
            align: col.align,
          });
        x += col.w;
      }
      y += rowH;
    }

    function ensureSpace(need: number) {
      if (y + need <= PAGE_H - 36) return;
      doc.addPage();
      drawPageChrome();
      drawTableHeader();
    }

    function drawBanner(title: string, subtitle: string, warn: boolean) {
      ensureSpace(46);
      const h = 40;
      doc.save();
      doc.rect(MARGIN_X, y, CONTENT_W, h).fill(warn ? "#fff4e5" : "#e8f4f0");
      doc.restore();
      doc
        .strokeColor(warn ? "#c47a00" : BRAND)
        .lineWidth(1.4)
        .rect(MARGIN_X, y, CONTENT_W, h)
        .stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(warn ? "#8a4b00" : BRAND)
        .text(title, MARGIN_X + 8, y + 8, { width: CONTENT_W - 16, align: "center" });
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(INK)
        .text(subtitle, MARGIN_X + 8, y + 24, {
          width: CONTENT_W - 16,
          align: "center",
        });
      y += h + 8;
    }

    function drawDataRow(
      row: StudentRow,
      rang: number,
      zebra: boolean,
      filiereCode: string,
      ancienneCode?: string,
    ) {
      const cols = activeCols();
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
        NomComplet: cellValue(row, "NomComplet").toUpperCase(),
        Score: cellValue(row, "Score"),
        FiliereCode: filiereCode,
        Ancienne: ancienneCode || "—",
      };

      let x = MARGIN_X;
      for (const col of cols) {
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor(INK)
          .text(values[col.key] || "", x + 3, y + 4, {
            width: col.w - 6,
            align: col.align,
            lineBreak: false,
            ellipsis: true,
          });
        x += col.w;
      }
      y += rowH;
    }

    function startBlock(
      filiereTitle: string,
      sectionTitle: string,
      changeMode: boolean,
    ) {
      currentFiliereTitle = filiereTitle;
      currentSectionSubtitle = sectionTitle;
      useChangeCols = changeMode;
      doc.addPage();
      drawPageChrome();
      drawBanner(
        sectionTitle,
        changeMode
          ? "Déjà inscrits à l'EST — filière d'origine (Anc.) ≠ filière admise"
          : "Nouveaux admis — procéder à l'inscription",
        changeMode,
      );
      drawTableHeader();
    }

    function cneOf(row: StudentRow): string {
      return String(row.CNE || row.Code || "")
        .trim()
        .toUpperCase();
    }

    if (groups.length === 0) {
      currentFiliereTitle = "";
      currentSectionSubtitle = "";
      doc.addPage();
      drawPageChrome();
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(INK)
        .text("Aucune sélection finale à publier.", MARGIN_X, y + 20, {
          width: CONTENT_W,
          align: "center",
        });
    } else {
      for (const g of groups) {
        const title = `${g.code} — ${g.name}`;
        const fresh: StudentRow[] = [];
        const change: { row: StudentRow; ancienne: string }[] = [];

        for (const row of g.rows) {
          const info = dejaInscrits.get(cneOf(row));
          if (info) change.push({ row, ancienne: info.code || "?" });
          else fresh.push(row);
        }

        if (change.length) {
          startBlock(
            title,
            "ÉTUDIANTS DÉJÀ INSCRITS — CHANGEMENT DE FILIÈRE",
            true,
          );
          let rang = 1;
          for (const { row, ancienne } of change) {
            drawDataRow(row, rang, rang % 2 === 0, g.code, ancienne);
            rang += 1;
          }
          ensureSpace(18);
          y += 4;
          doc
            .font("Helvetica-Oblique")
            .fontSize(8)
            .fillColor("#8a4b00")
            .text(
              `Total déjà inscrits (changement) : ${change.length}`,
              MARGIN_X,
              y,
              { width: CONTENT_W, align: "right" },
            );
        }

        if (fresh.length) {
          startBlock(title, "ADMIS À L'INSCRIPTION", false);
          let rang = 1;
          for (const row of fresh) {
            drawDataRow(row, rang, rang % 2 === 0, g.code);
            rang += 1;
          }
          ensureSpace(18);
          y += 4;
          doc
            .font("Helvetica-Oblique")
            .fontSize(8)
            .fillColor(BRAND)
            .text(`Total admis à l'inscription : ${fresh.length}`, MARGIN_X, y, {
              width: CONTENT_W,
              align: "right",
            });
        }
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

