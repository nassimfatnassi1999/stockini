import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { DocumentType } from '@prisma/client';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface PdfSaleItem {
  reference: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  tvaPercent?: number;
  total: number;
}

export interface PdfSaleData {
  invoiceNumber: string;
  createdAt: Date | string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  timbreFiscal?: number;
  customerName: string;
  isCounterClient?: boolean;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerTaxId?: string | null;
  customerNote?: string | null;
  items: PdfSaleItem[];
}

export interface PdfAvoirItem {
  reference: string;
  name: string;
  quantiteRetournee: number;
  prixUnitaireHt: number;
  tva: number;
  totalHt: number;
  totalTtc: number;
  motifLigne?: string | null;
}

export interface PdfAvoirData {
  numero: string;
  dateAvoir: Date | string;
  factureOrigine: string;
  customerName: string;
  isCounterClient?: boolean;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerTaxId?: string | null;
  customerNote?: string | null;
  motif?: string | null;
  items: PdfAvoirItem[];
  subtotal: number;
  tax: number;
  total: number;
  montantRembourse: number;
}

export interface PdfCompanyInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
}

// ── MSP Palette ───────────────────────────────────────────────────────────────
const MSP_RED = '#C0202A';
const MSP_BLACK = '#1A1A1A';
const MSP_DARK_GRAY = '#3D3D3D';
const MSP_GRAY = '#6B6B6B';
const MSP_LIGHT_GRAY = '#F2F2F2';
const MSP_BORDER = '#D0D0D0';
const WHITE = '#FFFFFF';

// ── Layout constants ──────────────────────────────────────────────────────────
const MARGIN = 36;
const ROW_H = 17;
const FOOTER_H = 85;
const DEFAULT_COMPANY = 'Moumna spare part';

const DOC_TITLES: Record<DocumentType, string> = {
  DEVIS: 'DEVIS',
  BON_COMMANDE: 'BON DE COMMANDE',
  BON_LIVRAISON: 'BON DE LIVRAISON',
  FACTURE: 'FACTURE',
  AVOIR: 'AVOIR',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt3(v: number): string {
  return v.toFixed(3);
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function resolveLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'public', 'assets', 'MSP.png'),
    path.join(process.cwd(), 'public', 'assets', 'MSP.png'),
    path.join(__dirname, '..', 'public', 'assets', 'MSP.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Convert a number to French words (for "arrêté à la somme de") */
function numberToFrenchWords(n: number): string {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  if (n === 0) return 'zéro';

  function convertHundreds(num: number): string {
    let result = '';
    if (num >= 100) {
      const h = Math.floor(num / 100);
      result += (h > 1 ? units[h] + ' ' : '') + 'cent';
      num %= 100;
      if (num > 0) result += ' ';
    }
    if (num >= 20) {
      const t = Math.floor(num / 10);
      const u = num % 10;
      if (t === 7 || t === 9) {
        result += tens[t] + '-' + units[10 + u];
      } else {
        result += tens[t] + (u > 0 ? (t === 8 ? '-' : '-') + units[u] : '');
      }
    } else if (num > 0) {
      result += units[num];
    }
    return result;
  }

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 1000);

  let result = '';
  if (intPart >= 1000) {
    const thousands = Math.floor(intPart / 1000);
    result += (thousands === 1 ? 'mille' : convertHundreds(thousands) + ' mille');
    const rem = intPart % 1000;
    if (rem > 0) result += ' ' + convertHundreds(rem);
  } else {
    result = convertHundreds(intPart);
  }

  result += ' dinars';
  if (decPart > 0) {
    result += ' et ' + convertHundreds(decPart) + ' millimes';
  }
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - MARGIN - FOOTER_H;
}

function footerStartY(doc: PDFKit.PDFDocument): number {
  return doc.page.height - MARGIN - FOOTER_H + 4;
}

// ── Page header helpers ───────────────────────────────────────────────────────

/**
 * Draw the full first-page header with logo, company info, and document title band.
 * Returns the Y coordinate after the header block.
 */
function drawFirstPageHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  docNumber: string,
  docDate: Date | string,
  company: PdfCompanyInfo,
  logoPath: string | null,
): number {
  const pageW = doc.page.width;
  const companyName = company.name ?? DEFAULT_COMPANY;

  // ── Red top band ──────────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, 6).fillColor(MSP_RED).fill();

  const headerTop = MARGIN + 4;
  const headerHeight = 58;

  // ── Left: Document type frame ─────────────────────────────────────────────
  const docFrameW = 130;
  const docFrameX = MARGIN;

  doc.rect(docFrameX, headerTop, docFrameW, headerHeight)
    .fillColor(WHITE).strokeColor(MSP_RED).lineWidth(0.8).fillAndStroke();

  // Red title bar inside frame
  doc.rect(docFrameX, headerTop, docFrameW, 18).fillColor(MSP_RED).fill();
  doc.fontSize(11).fillColor(WHITE).font('Helvetica-Bold')
    .text(title, docFrameX, headerTop + 4, { width: docFrameW, align: 'center' });

  // Document number
  doc.fontSize(7.5).fillColor(MSP_BLACK).font('Helvetica-Bold')
    .text(`N° ${docNumber}`, docFrameX + 6, headerTop + 24, { width: docFrameW - 12 });

  // Date
  doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica')
    .text(`Date : ${fmtDate(docDate)}`, docFrameX + 6, headerTop + 36, { width: docFrameW - 12 });

  // ── Right: Logo (bigger) ──────────────────────────────────────────────────
  const logoW = 125;
  const logoX = pageW - MARGIN - logoW;

  if (logoPath) {
    try {
      doc.image(logoPath, logoX, headerTop, {
        width: logoW,
        height: headerHeight,
        fit: [logoW, headerHeight],
      });
    } catch {
      doc.fontSize(10).fillColor(MSP_RED).font('Helvetica-Bold')
        .text('MSP', logoX, headerTop + 20, { width: logoW, align: 'center' });
    }
  } else {
    doc.fontSize(10).fillColor(MSP_RED).font('Helvetica-Bold')
      .text('MSP', logoX, headerTop + 20, { width: logoW, align: 'center' });
  }

  // ── Center: Company name ──────────────────────────────────────────────────
  const centerX = docFrameX + docFrameW + 8;
  const centerW = logoX - centerX - 8;
  const nameY = headerTop + Math.floor((headerHeight - 16) / 2) - 6;

  doc.fontSize(14).fillColor(MSP_BLACK).font('Helvetica-Bold')
    .text(companyName, centerX, nameY, { width: centerW, align: 'center' });

  const subParts: string[] = [];
  if (company.address) subParts.push(company.address);
  if (company.phone) subParts.push(`Tél : ${company.phone}`);
  if (subParts.length > 0) {
    doc.fontSize(6.5).fillColor(MSP_GRAY).font('Helvetica')
      .text(subParts.join('  |  '), centerX, nameY + 18, { width: centerW, align: 'center' });
  }
  if (company.taxNumber) {
    const taxY = nameY + 18 + (subParts.length > 0 ? 10 : 0);
    doc.fontSize(6.5).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
      .text(`MF : ${company.taxNumber}`, centerX, taxY, { width: centerW, align: 'center' });
  }

  // ── Separator line ────────────────────────────────────────────────────────
  const headerBottom = headerTop + headerHeight + 6;
  doc.moveTo(MARGIN, headerBottom).lineTo(pageW - MARGIN, headerBottom)
    .strokeColor(MSP_RED).lineWidth(0.5).stroke();

  return headerBottom + 8;
}

/** Compact header for continuation pages. Returns Y after header. */
function drawCompactHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  docNumber: string,
  company: PdfCompanyInfo,
): number {
  const pageW = doc.page.width;

  doc.rect(0, 0, pageW, 5).fillColor(MSP_RED).fill();

  const y = MARGIN - 4;
  doc.fontSize(8).fillColor(MSP_RED).font('Helvetica-Bold')
    .text(`${title} N° ${docNumber}`, MARGIN, y);

  doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
    .text(company.name ?? DEFAULT_COMPANY, MARGIN, y, {
      align: 'right',
      width: pageW - MARGIN * 2,
    });

  const sepY = y + 13;
  doc.moveTo(MARGIN, sepY).lineTo(pageW - MARGIN, sepY)
    .strokeColor(MSP_BORDER).lineWidth(0.3).stroke();

  return sepY + 8;
}

// ── Client block ──────────────────────────────────────────────────────────────

function drawClientBlock(
  doc: PDFKit.PDFDocument,
  boxX: number,
  boxY: number,
  boxW: number,
  customerName: string,
  isCounterClient: boolean,
  address?: string | null,
  phone?: string | null,
  email?: string | null,
  taxId?: string | null,
  note?: string | null,
): number {
  let lines = 2;
  if (address) lines++;
  if (phone) lines++;
  if (email) lines++;
  if (taxId) lines++;
  if (note) lines++;
  if (isCounterClient) lines++;

  const boxH = Math.max(44, 14 + lines * 11 + 6);

  doc.rect(boxX, boxY, boxW, boxH).fillColor(MSP_LIGHT_GRAY)
    .strokeColor(MSP_BORDER).lineWidth(0.4).fillAndStroke();

  // Red "CLIENT" label bar
  doc.rect(boxX, boxY, boxW, 14).fillColor(MSP_RED).fill();
  doc.fontSize(7).fillColor(WHITE).font('Helvetica-Bold')
    .text('CLIENT', boxX + 6, boxY + 4);

  let cy = boxY + 18;
  doc.fontSize(8.5).fillColor(MSP_BLACK).font('Helvetica-Bold')
    .text(customerName, boxX + 6, cy, { width: boxW - 12 });
  cy += 12;

  doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica');

  if (isCounterClient) {
    doc.fillColor(MSP_RED).font('Helvetica-Oblique')
      .text('Client comptoir', boxX + 6, cy, { width: boxW - 12 });
    doc.font('Helvetica').fillColor(MSP_DARK_GRAY);
    cy += 11;
  }
  if (taxId) {
    doc.text(`MF : ${taxId}`, boxX + 6, cy, { width: boxW - 12 });
    cy += 11;
  }
  if (address) {
    doc.text(address, boxX + 6, cy, { width: boxW - 12 });
    cy += 11;
  }
  if (phone) {
    doc.text(`Tél : ${phone}`, boxX + 6, cy, { width: boxW - 12 });
    cy += 11;
  }
  if (email) {
    doc.text(email, boxX + 6, cy, { width: boxW - 12 });
    cy += 11;
  }
  if (note) {
    doc.fillColor(MSP_GRAY).font('Helvetica-Oblique')
      .text(note, boxX + 6, cy, { width: boxW - 12 });
  }

  return boxY + boxH;
}

// ── Table header ──────────────────────────────────────────────────────────────

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  colWidths: number[],
  headers: string[],
  tableW: number,
  numericStartIdx = 2,
): number {
  // Dark header background
  doc.rect(MARGIN, y, tableW, ROW_H).fillColor(MSP_BLACK).fill();

  // Red left accent stripe
  doc.rect(MARGIN, y, 3, ROW_H).fillColor(MSP_RED).fill();

  let colX = MARGIN;
  headers.forEach((h, i) => {
    doc.fontSize(6.5).fillColor(WHITE).font('Helvetica-Bold')
      .text(h, colX + (i === 0 ? 6 : 3), y + 5, {
        width: colWidths[i] - 9,
        align: i >= numericStartIdx ? 'right' : 'left',
      });
    colX += colWidths[i];
  });
  return y + ROW_H;
}

// ── Footer ────────────────────────────────────────────────────────────────────

function drawPageFooter(
  doc: PDFKit.PDFDocument,
  company: PdfCompanyInfo,
  mainText: string,
  pageNum: number,
  totalPages?: number,
): void {
  const pageW = doc.page.width;
  const fy = footerStartY(doc);
  const companyName = company.name ?? DEFAULT_COMPANY;

  // Red footer line
  doc.rect(MARGIN, fy, pageW - MARGIN * 2, 1.5).fillColor(MSP_RED).fill();

  const textW = (pageW - MARGIN * 2) * 0.60;
  let ty = fy + 7;

  doc.fontSize(7).fillColor(MSP_GRAY).font('Helvetica-Oblique')
    .text(mainText, MARGIN, ty, { width: textW });
  ty += 11;

  doc.fontSize(7.5).fillColor(MSP_BLACK).font('Helvetica-Bold')
    .text(companyName, MARGIN, ty, { width: textW });
  ty += 10;

  const infoLine = [company.address, company.phone, company.email].filter(Boolean).join('  |  ');
  if (infoLine) {
    doc.fontSize(6.5).fillColor(MSP_GRAY).font('Helvetica')
      .text(infoLine, MARGIN, ty, { width: textW });
    ty += 9;
  }
  if (company.taxNumber) {
    doc.fontSize(6.5).fillColor(MSP_GRAY).font('Helvetica')
      .text(`MF : ${company.taxNumber}`, MARGIN, ty, { width: textW });
    ty += 9;
  }

  const pageLabel = totalPages ? `Page ${pageNum} / ${totalPages}` : `Page ${pageNum}`;
  doc.fontSize(6).fillColor('#AAAAAA').font('Helvetica')
    .text(`${pageLabel}  —  Généré le ${fmtDate(new Date())}`, MARGIN, ty, { width: textW });

  // Cachet box (right)
  const cachetW = 140;
  const cachetH = 55;
  const cachetX = pageW - MARGIN - cachetW;
  const cachetY = fy + 5;

  doc.rect(cachetX, cachetY, cachetW, cachetH)
    .strokeColor(MSP_RED).lineWidth(0.5).stroke();

  doc.fontSize(6.5).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
    .text('Cachet et signature', cachetX, cachetY + 5, { width: cachetW, align: 'center' });

  // Small red underline under "Cachet et signature"
  doc.moveTo(cachetX + 20, cachetY + 15).lineTo(cachetX + cachetW - 20, cachetY + 15)
    .strokeColor(MSP_RED).lineWidth(0.3).stroke();
}

// ── Totals block ──────────────────────────────────────────────────────────────

interface SummaryRow {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
  color?: string;
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  y: number,
  summaryRows: SummaryRow[],
  pageW: number,
): number {
  const summaryW = 170;
  const summaryH = summaryRows.length * 16 + 10;
  const summaryX = pageW - MARGIN - summaryW;

  doc.rect(summaryX, y, summaryW, summaryH)
    .fillColor(MSP_LIGHT_GRAY).strokeColor(MSP_BORDER).lineWidth(0.3).fillAndStroke();

  summaryRows.forEach((row, i) => {
    const ry = y + 6 + i * 16;

    if (row.highlight) {
      doc.rect(summaryX, ry - 2, summaryW, 16).fillColor(MSP_RED).fill();
    } else if (row.bold) {
      doc.moveTo(summaryX + 4, ry - 1).lineTo(summaryX + summaryW - 4, ry - 1)
        .strokeColor(MSP_BORDER).lineWidth(0.3).stroke();
    }

    const fColor = row.highlight ? WHITE : (row.color ?? (row.bold ? MSP_BLACK : MSP_DARK_GRAY));
    const fSize = row.highlight ? 9 : (row.bold ? 8.5 : 7.5);
    const fFont = (row.bold || row.highlight) ? 'Helvetica-Bold' : 'Helvetica';

    doc.fontSize(fSize).fillColor(fColor).font(fFont)
      .text(row.label, summaryX + 6, ry);
    doc.fontSize(fSize).fillColor(fColor).font(fFont)
      .text(row.value, summaryX + 6, ry, { width: summaryW - 12, align: 'right' });
  });

  return y + summaryH;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PdfService {
  // ─── Sale documents (DEVIS / BON_COMMANDE / BON_LIVRAISON / FACTURE) ─────────

  generateSaleDocument(
    sale: PdfSaleData,
    documentType: DocumentType,
    company: PdfCompanyInfo = {},
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4', autoFirstPage: true });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const title = DOC_TITLES[documentType];
      const pageW = doc.page.width;
      const tableW = pageW - MARGIN * 2;
      const logoPath = resolveLogoPath();
      let pageNum = 1;

      // ── Page 1 full header ─────────────────────────────────────────────────
      let y = drawFirstPageHeader(doc, title, sale.invoiceNumber, sale.createdAt, company, logoPath);

      // ── Two-column: meta left, client right ────────────────────────────────
      const colMid = pageW / 2 - 8;
      const metaW = colMid - MARGIN;
      const clientX = colMid + 8;
      const clientW = pageW - MARGIN - clientX;
      const sectionY = y;

      // Left: document meta
      doc.fontSize(7).fillColor(MSP_GRAY).font('Helvetica').text('Date :', MARGIN, y);
      doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
        .text(fmtDate(sale.createdAt), MARGIN + 30, y, { width: metaW - 30 });
      y += 12;

      // Right: client box
      const clientBoxBottom = drawClientBlock(
        doc,
        clientX, sectionY, clientW,
        sale.customerName,
        sale.isCounterClient ?? false,
        sale.customerAddress,
        sale.customerPhone,
        sale.customerEmail,
        sale.customerTaxId,
        sale.customerNote,
      );

      y = Math.max(y + 6, clientBoxBottom + 10);

      // ── Items table ────────────────────────────────────────────────────────
      // Cols: Désignation | Qté | PU HT | Remise% | Total HT | TVA% | Total TTC
      const colWidths = [0, 28, 52, 38, 52, 32, 55];
      const fixedW = colWidths.reduce((s, w) => s + w, 0);
      colWidths[0] = tableW - fixedW;

      const headers = ['Désignation', 'Qté', 'PU HT', 'Remise%', 'Total HT', 'TVA%', 'Total TTC'];

      let sectionTopY = y;
      y = drawTableHeader(doc, y, colWidths, headers, tableW, 1);

      sale.items.forEach((item, idx) => {
        if (y + ROW_H > contentBottom(doc)) {
          doc.rect(MARGIN, sectionTopY, tableW, y - sectionTopY)
            .strokeColor(MSP_BORDER).lineWidth(0.3).stroke();

          doc.addPage();
          pageNum++;
          const afterCompact = drawCompactHeader(doc, title, sale.invoiceNumber, company);
          sectionTopY = afterCompact;
          y = drawTableHeader(doc, afterCompact, colWidths, headers, tableW, 1);
        }

        const tvaRate = item.tvaPercent ?? 19;
        const discPct = item.discountPercent ?? 0;
        const totalTtc = item.total * (1 + tvaRate / 100);
        const bg = idx % 2 === 0 ? WHITE : MSP_LIGHT_GRAY;

        doc.rect(MARGIN, y, tableW, ROW_H).fillColor(bg).fill();

        // Red accent stripe on alternating rows
        if (idx % 2 !== 0) {
          doc.rect(MARGIN, y, 3, ROW_H).fillColor(MSP_RED).fill();
        }

        const rowData = [
          item.name,
          String(item.quantity),
          fmt3(item.unitPrice),
          discPct > 0 ? `${discPct}%` : '—',
          fmt3(item.total),
          `${tvaRate}%`,
          fmt3(totalTtc),
        ];

        let colX = MARGIN;
        rowData.forEach((cell, i) => {
          doc.fontSize(7).fillColor(MSP_BLACK).font('Helvetica')
            .text(cell, colX + (i === 0 ? 6 : 3), y + 5, {
              width: colWidths[i] - 9,
              align: i >= 1 ? 'right' : 'left',
              ellipsis: true,
            });
          colX += colWidths[i];
        });
        y += ROW_H;
      });

      doc.rect(MARGIN, sectionTopY, tableW, y - sectionTopY)
        .strokeColor(MSP_BORDER).lineWidth(0.3).stroke();

      y += 8;

      // ── Totals ─────────────────────────────────────────────────────────────
      const summaryRows: SummaryRow[] = [
        { label: 'Total HT', value: `${fmt3(sale.subtotal)} DT` },
      ];
      if (sale.discount > 0) {
        summaryRows.push({ label: 'Remise', value: `- ${fmt3(sale.discount)} DT`, color: MSP_RED });
      }
      summaryRows.push({ label: 'Total TVA (19%)', value: `${fmt3(sale.tax)} DT` });
      if ((sale.timbreFiscal ?? 0) > 0) {
        summaryRows.push({ label: 'Timbre fiscal', value: `${fmt3(sale.timbreFiscal!)} DT` });
      }
      summaryRows.push({ label: 'Total TTC', value: `${fmt3(sale.total)} DT`, highlight: true });

      const summaryH = summaryRows.length * 16 + 10;
      if (y + summaryH + 28 > contentBottom(doc)) {
        doc.addPage();
        pageNum++;
        y = drawCompactHeader(doc, title, sale.invoiceNumber, company);
        y += 6;
      }

      const afterTotals = drawTotals(doc, y, summaryRows, pageW);
      y = afterTotals + 10;

      // ── Montant en lettres ─────────────────────────────────────────────────
      if (y + 16 < contentBottom(doc)) {
        const amountWords = numberToFrenchWords(sale.total);
        const docLabel = DOC_TITLES[documentType].toLowerCase();
        doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Oblique')
          .text(
            `Arrêté le présent ${docLabel} à la somme de : ${amountWords}`,
            MARGIN, y,
            { width: pageW - MARGIN * 2 },
          );
      }

      // ── Footer ─────────────────────────────────────────────────────────────
      drawPageFooter(doc, company, 'Merci pour votre confiance.', pageNum);

      doc.end();
    });
  }

  // ─── Avoir documents ──────────────────────────────────────────────────────────

  generateAvoirDocument(
    avoir: PdfAvoirData,
    company: PdfCompanyInfo = {},
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4', autoFirstPage: true });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const tableW = pageW - MARGIN * 2;
      const logoPath = resolveLogoPath();
      let pageNum = 1;

      // ── Page 1 full header ─────────────────────────────────────────────────
      let y = drawFirstPageHeader(doc, 'AVOIR', avoir.numero, avoir.dateAvoir, company, logoPath);

      // ── Two-column: meta left, client right ────────────────────────────────
      const colMid = pageW / 2 - 8;
      const clientX = colMid + 8;
      const clientW = pageW - MARGIN - clientX;
      const sectionY = y;

      doc.fontSize(7).fillColor(MSP_GRAY).font('Helvetica').text('Date :', MARGIN, y);
      doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
        .text(fmtDate(avoir.dateAvoir), MARGIN + 30, y);
      y += 12;

      doc.fontSize(7).fillColor(MSP_GRAY).font('Helvetica').text("Facture d'origine :", MARGIN, y);
      doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
        .text(avoir.factureOrigine, MARGIN + 80, y);
      y += 12;

      if (avoir.motif) {
        doc.fontSize(7).fillColor(MSP_GRAY).font('Helvetica').text('Motif :', MARGIN, y);
        doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica')
          .text(avoir.motif, MARGIN + 35, y, { width: colMid - MARGIN - 35 });
        y += 12;
      }

      const clientBoxBottom = drawClientBlock(
        doc,
        clientX, sectionY, clientW,
        avoir.customerName,
        avoir.isCounterClient ?? false,
        avoir.customerAddress,
        avoir.customerPhone,
        avoir.customerEmail,
        avoir.customerTaxId,
        avoir.customerNote,
      );

      y = Math.max(y + 6, clientBoxBottom + 10);

      // ── Items table ────────────────────────────────────────────────────────
      // Cols: Désignation | Qté | PU HT | Total HT | TVA% | Total TTC | Motif
      const colWidths = [0, 28, 50, 44, 32, 50, 50];
      const fixedW = colWidths.reduce((s, w) => s + w, 0);
      colWidths[0] = tableW - fixedW;

      const headers = ['Désignation', 'Qté', 'PU HT', 'Total HT', 'TVA%', 'Total TTC', 'Motif'];

      let sectionTopY = y;
      y = drawTableHeader(doc, y, colWidths, headers, tableW, 1);

      avoir.items.forEach((item, idx) => {
        if (y + ROW_H > contentBottom(doc)) {
          doc.rect(MARGIN, sectionTopY, tableW, y - sectionTopY)
            .strokeColor(MSP_BORDER).lineWidth(0.3).stroke();

          doc.addPage();
          pageNum++;
          const afterCompact = drawCompactHeader(doc, 'AVOIR', avoir.numero, company);
          sectionTopY = afterCompact;
          y = drawTableHeader(doc, afterCompact, colWidths, headers, tableW, 1);
        }

        const bg = idx % 2 === 0 ? WHITE : MSP_LIGHT_GRAY;
        doc.rect(MARGIN, y, tableW, ROW_H).fillColor(bg).fill();

        if (idx % 2 !== 0) {
          doc.rect(MARGIN, y, 3, ROW_H).fillColor(MSP_RED).fill();
        }

        const rowData = [
          item.name,
          String(item.quantiteRetournee),
          fmt3(item.prixUnitaireHt),
          fmt3(item.totalHt),
          `${item.tva}%`,
          fmt3(item.totalTtc),
          item.motifLigne ?? '—',
        ];

        let colX = MARGIN;
        rowData.forEach((cell, i) => {
          doc.fontSize(7).fillColor(MSP_BLACK).font('Helvetica')
            .text(cell, colX + (i === 0 ? 6 : 3), y + 5, {
              width: colWidths[i] - 9,
              align: i >= 1 && i <= 5 ? 'right' : 'left',
              ellipsis: true,
            });
          colX += colWidths[i];
        });
        y += ROW_H;
      });

      doc.rect(MARGIN, sectionTopY, tableW, y - sectionTopY)
        .strokeColor(MSP_BORDER).lineWidth(0.3).stroke();

      y += 8;

      // ── Totals ─────────────────────────────────────────────────────────────
      const summaryRows: SummaryRow[] = [
        { label: 'Total HT', value: `${fmt3(avoir.subtotal)} DT` },
        { label: 'Total TVA', value: `${fmt3(avoir.tax)} DT` },
        { label: 'Total TTC', value: `${fmt3(avoir.total)} DT`, bold: true },
        { label: 'Montant remboursé', value: `${fmt3(avoir.montantRembourse)} DT`, highlight: true },
      ];

      const summaryH = summaryRows.length * 16 + 10;
      if (y + summaryH + 16 > contentBottom(doc)) {
        doc.addPage();
        pageNum++;
        y = drawCompactHeader(doc, 'AVOIR', avoir.numero, company);
        y += 6;
      }

      const afterTotals = drawTotals(doc, y, summaryRows, pageW);
      y = afterTotals + 10;

      // ── Montant en lettres ─────────────────────────────────────────────────
      if (y + 16 < contentBottom(doc)) {
        const amountWords = numberToFrenchWords(avoir.total);
        doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Oblique')
          .text(
            `Arrêté le présent avoir à la somme de : ${amountWords}`,
            MARGIN, y,
            { width: pageW - MARGIN * 2 },
          );
      }

      // ── Footer ─────────────────────────────────────────────────────────────
      drawPageFooter(
        doc,
        company,
        "Ce document annule et remplace partiellement la facture d'origine.",
        pageNum,
      );

      doc.end();
    });
  }
}
