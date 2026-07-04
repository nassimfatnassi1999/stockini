import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { DocumentType, PurchaseDocumentType } from '@prisma/client';

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
  representant?: string | null;
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
  stampDuty: number;
  montantRembourse: number;
}

export interface PdfCompanyInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  logoUrl?: string;
  bankRib?: string;
}

// ── MSP Palette ───────────────────────────────────────────────────────────────
const MSP_RED = '#C0202A';
const MSP_BLACK = '#1A1A1A';
const MSP_DARK_GRAY = '#3D3D3D';
const MSP_GRAY = '#6B6B6B';
const MSP_LIGHT_GRAY = '#F5F5F5';
const MSP_BORDER = '#D0D0D0';
const MSP_LINE = '#EBEBEB';
const WHITE = '#FFFFFF';

// ── Layout constants ──────────────────────────────────────────────────────────
const MARGIN = 36;
const FOOTER_H = 72;
const ROW_MIN_H = 18;
const ROW_PAD_V = 4;
const INFO_ROW_H = 15;
const INFO_PAD = 8;
const DEFAULT_COMPANY = 'Moumna spare part';

const DOC_TITLES: Record<DocumentType | PurchaseDocumentType, string> = {
  DEVIS: 'DEVIS',
  BON_COMMANDE: 'BON DE COMMANDE',
  BON_LIVRAISON: 'BON DE LIVRAISON',
  FACTURE: 'FACTURE',
  AVOIR: 'AVOIR',
  BON_RECEPTION: 'BON DE RÉCEPTION',
  FACTURE_FOURNISSEUR: 'FACTURE FOURNISSEUR',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt3(v: number): string {
  return v.toFixed(3);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtDate(d: Date | string): string {
  const dt = new Date(d);
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function fmtDateTime(d: Date | string): string {
  const dt = new Date(d);
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
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

function numberToFrenchWords(n: number): string {
  const units = [
    '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
    'dix-sept', 'dix-huit', 'dix-neuf',
  ];
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
        result += tens[t] + (u > 0 ? '-' + units[u] : '');
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
    result += thousands === 1 ? 'mille' : convertHundreds(thousands) + ' mille';
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

// ── Drawing primitives ────────────────────────────────────────────────────────

function drawHLine(
  doc: PDFKit.PDFDocument,
  x1: number,
  y: number,
  x2: number,
  color = MSP_BORDER,
  lw = 0.3,
): void {
  doc.moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(lw).stroke();
}

function drawVLine(
  doc: PDFKit.PDFDocument,
  x: number,
  y1: number,
  y2: number,
  color = MSP_BORDER,
  lw = 0.3,
): void {
  doc.moveTo(x, y1).lineTo(x, y2).strokeColor(color).lineWidth(lw).stroke();
}

// ── First-page header ─────────────────────────────────────────────────────────

function drawFirstPageHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  docNumber: string,
  company: PdfCompanyInfo,
  logoPath: string | null,
): number {
  const pageW = doc.page.width;
  const companyName = company.name ?? DEFAULT_COMPANY;

  const headerTop = MARGIN;
  const docBlockW = 118;
  const docBlockH = 56;

  // Doc type block — left (title + N° only, date is in the info block)
  doc.rect(MARGIN, headerTop, docBlockW, docBlockH)
    .strokeColor(MSP_RED).lineWidth(0.6).stroke();
  doc.rect(MARGIN, headerTop, docBlockW, 17).fillColor(MSP_RED).fill();
  doc.fontSize(9.5).fillColor(WHITE).font('Helvetica-Bold')
    .text(title, MARGIN, headerTop + 4, { width: docBlockW, align: 'center', lineBreak: false });

  doc.fontSize(7.5).fillColor(MSP_BLACK).font('Helvetica-Bold')
    .text(`N° ${docNumber}`, MARGIN + 6, headerTop + 28, { width: docBlockW - 12, align: 'center', lineBreak: false });

  // Logo — right, larger
  const logoW = 135;
  const logoX = pageW - MARGIN - logoW;

  if (logoPath) {
    try {
      doc.image(logoPath, logoX, headerTop, { fit: [logoW, docBlockH], align: 'right', valign: 'center' });
    } catch {
      doc.fontSize(13).fillColor(MSP_RED).font('Helvetica-Bold')
        .text('MSP', logoX, headerTop + 18, { width: logoW, align: 'center' });
    }
  } else {
    doc.fontSize(13).fillColor(MSP_RED).font('Helvetica-Bold')
      .text('MSP', logoX, headerTop + 18, { width: logoW, align: 'center' });
  }

  // Company name — centered between doc block and logo
  const centerX = MARGIN + docBlockW + 12;
  const centerW = logoX - centerX - 12;
  const midY = headerTop + Math.floor((docBlockH - 14) / 2) - 7;

  doc.fontSize(13).fillColor(MSP_BLACK).font('Helvetica-Bold')
    .text(companyName, centerX, midY, { width: centerW, align: 'center', lineBreak: false });

  let subY = midY + 17;
  const subParts: string[] = [];
  if (company.address) subParts.push(company.address);
  if (company.phone) subParts.push(`Tél : ${company.phone}`);
  if (subParts.length > 0) {
    doc.fontSize(6.5).fillColor(MSP_GRAY).font('Helvetica')
      .text(subParts.join('  |  '), centerX, subY, { width: centerW, align: 'center', lineBreak: false });
    subY += 9;
  }
  if (company.taxNumber) {
    doc.fontSize(6.5).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
      .text(`MF : ${company.taxNumber}`, centerX, subY, { width: centerW, align: 'center', lineBreak: false });
  }

  // Thin red separator under header
  const sepY = headerTop + docBlockH + 8;
  drawHLine(doc, MARGIN, sepY, pageW - MARGIN, MSP_RED, 0.7);

  return sepY + 10;
}

// ── Compact continuation header ───────────────────────────────────────────────

function drawCompactHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  docNumber: string,
  company: PdfCompanyInfo,
): number {
  const pageW = doc.page.width;
  const y = MARGIN - 4;

  doc.fontSize(8).fillColor(MSP_RED).font('Helvetica-Bold')
    .text(`${title} N° ${docNumber}`, MARGIN, y, { lineBreak: false });
  doc.fontSize(7.5).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
    .text(company.name ?? DEFAULT_COMPANY, MARGIN, y, {
      align: 'right',
      width: pageW - MARGIN * 2,
      lineBreak: false,
    });

  const sepY = y + 14;
  drawHLine(doc, MARGIN, sepY, pageW - MARGIN, MSP_BORDER, 0.3);

  return sepY + 8;
}

// ── Info blocks ───────────────────────────────────────────────────────────────

interface InfoRow {
  label: string;
  value: string;
  italic?: boolean;
  valueColor?: string;
}

function drawInfoBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  blockTitle: string,
  rows: InfoRow[],
  blockH: number,
): void {
  const labelW = 52;

  (doc as any).roundedRect(x, y, w, blockH, 3)
    .strokeColor(MSP_BORDER).lineWidth(0.4).stroke();

  // Block title
  doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
    .text(blockTitle, x + INFO_PAD, y + 5, { width: w - INFO_PAD * 2, lineBreak: false });
  drawHLine(doc, x + 4, y + 15, x + w - 4, MSP_BORDER, 0.3);

  rows.forEach((row, i) => {
    const ry = y + INFO_PAD + 10 + i * INFO_ROW_H;
    if (i > 0) drawHLine(doc, x + 4, ry - 1, x + w - 4, MSP_LINE, 0.2);

    if (row.label) {
      doc.fontSize(6.5).fillColor(MSP_GRAY).font('Helvetica')
        .text(row.label, x + INFO_PAD, ry, { width: labelW, lineBreak: false });
    }

    const vx = x + INFO_PAD + (row.label ? labelW : 0);
    const vw = w - INFO_PAD * 2 - (row.label ? labelW : 0);
    doc.fontSize(7.5)
      .fillColor(row.valueColor ?? (row.italic ? MSP_RED : MSP_BLACK))
      .font(row.italic ? 'Helvetica-Oblique' : 'Helvetica-Bold')
      .text(row.value, vx, ry, { width: vw, lineBreak: false });
  });
}

function drawInfoBlocks(
  doc: PDFKit.PDFDocument,
  y: number,
  pageW: number,
  leftTitle: string,
  leftRows: InfoRow[],
  rightRows: InfoRow[],
): number {
  const gap = 12;
  const leftW = Math.floor((pageW - MARGIN * 2 - gap) * 0.36);
  const rightW = (pageW - MARGIN * 2 - gap) - leftW;

  const leftNatH = INFO_PAD + 10 + leftRows.length * INFO_ROW_H + INFO_PAD;
  const rightNatH = INFO_PAD + 10 + rightRows.length * INFO_ROW_H + INFO_PAD;
  const blockH = Math.max(leftNatH, rightNatH);

  drawInfoBlock(doc, MARGIN, y, leftW, leftTitle, leftRows, blockH);
  drawInfoBlock(doc, MARGIN + leftW + gap, y, rightW, 'CLIENT', rightRows, blockH);

  return y + blockH;
}

// ── Summary strip (compact reference line above table) ────────────────────────

function drawSummaryStrip(
  doc: PDFKit.PDFDocument,
  y: number,
  pageW: number,
  cells: { label: string; value: string }[],
): number {
  const tableW = pageW - MARGIN * 2;
  const stripH = 16;
  const cellW = Math.floor(tableW / cells.length);

  doc.rect(MARGIN, y, tableW, stripH).fillColor('#F8F8F8').fill();
  drawHLine(doc, MARGIN, y, pageW - MARGIN, MSP_BORDER, 0.3);
  drawHLine(doc, MARGIN, y + stripH, pageW - MARGIN, MSP_BORDER, 0.3);

  cells.forEach((cell, i) => {
    const cx = MARGIN + i * cellW;
    if (i > 0) drawVLine(doc, cx, y + 3, y + stripH - 3, MSP_BORDER, 0.3);

    const half = Math.floor(cellW / 2);
    doc.fontSize(6).fillColor(MSP_GRAY).font('Helvetica')
      .text(cell.label + ' :', cx + 6, y + 4, { width: half - 8, lineBreak: false });
    doc.fontSize(6.5).fillColor(MSP_BLACK).font('Helvetica-Bold')
      .text(cell.value, cx + half, y + 4, { width: half - 6, align: 'right', lineBreak: false });
  });

  return y + stripH + 5;
}

// ── Table header ──────────────────────────────────────────────────────────────

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  colWidths: number[],
  headers: string[],
  tableW: number,
): number {
  const HDR_H = 17;

  doc.rect(MARGIN, y, tableW, HDR_H).fillColor(MSP_BLACK).fill();

  let colX = MARGIN;
  headers.forEach((h, i) => {
    doc.fontSize(7).fillColor(WHITE).font('Helvetica-Bold')
      .text(h, colX + 3, y + 5, {
        width: colWidths[i] - 6,
        align: i === 0 ? 'center' : i === 1 ? 'left' : 'right',
        lineBreak: false,
      });
    colX += colWidths[i];
  });

  return y + HDR_H;
}

// Calculate row height based on designation text wrap
function calcRowH(doc: PDFKit.PDFDocument, text: string, colW: number): number {
  doc.font('Helvetica').fontSize(7);
  const h = doc.heightOfString(text, { width: colW - 8 });
  return Math.max(ROW_MIN_H, h + ROW_PAD_V * 2);
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
  const totW = 172;
  const totX = pageW - MARGIN - totW;
  const ROW_H_TOT = 17;

  summaryRows.forEach((row, i) => {
    const ry = y + i * ROW_H_TOT;

    if (row.highlight) {
      doc.rect(totX - 6, ry - 2, totW + 6, ROW_H_TOT + 1).fillColor(MSP_RED).fill();
    } else if (i > 0) {
      drawHLine(doc, totX, ry - 1, totX + totW, MSP_BORDER, 0.2);
    }

    const fColor = row.highlight ? WHITE : (row.color ?? (row.bold ? MSP_BLACK : MSP_DARK_GRAY));
    const fSize = row.highlight ? 9.5 : (row.bold ? 8.5 : 7.5);
    const fFont = (row.bold || row.highlight) ? 'Helvetica-Bold' : 'Helvetica';

    doc.fontSize(fSize).fillColor(fColor).font(fFont)
      .text(row.label, totX, ry, { lineBreak: false });
    doc.fontSize(fSize).fillColor(fColor).font(fFont)
      .text(row.value, totX, ry, { width: totW, align: 'right', lineBreak: false });
  });

  return y + summaryRows.length * ROW_H_TOT + 4;
}

// ── Footer ────────────────────────────────────────────────────────────────────

function drawPageFooter(
  doc: PDFKit.PDFDocument,
  company: PdfCompanyInfo,
  pageNum: number,
): void {
  const pageW = doc.page.width;
  const fy = doc.page.height - MARGIN - FOOTER_H + 4;

  drawHLine(doc, MARGIN, fy, pageW - MARGIN, MSP_RED, 0.6);

  // Company info line — only non-empty fields
  const companyParts: string[] = [company.name ?? DEFAULT_COMPANY];
  if (company.address) companyParts.push(company.address);
  if (company.phone) companyParts.push(`Tél : ${company.phone}`);
  if (company.email) companyParts.push(company.email);
  if (company.taxNumber) companyParts.push(`MF : ${company.taxNumber}`);

  doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
    .text(companyParts.join('  |  '), MARGIN, fy + 8, {
      width: pageW - MARGIN * 2,
      align: 'center',
      lineBreak: false,
    });

  // Page number — left
  doc.fontSize(6.5).fillColor(MSP_GRAY).font('Helvetica')
    .text(`Page ${pageNum}`, MARGIN, fy + 20, { lineBreak: false });

  // Cachet & signature box — right
  const cachetW = 132;
  const cachetH = FOOTER_H - 26;
  const cachetX = pageW - MARGIN - cachetW;
  const cachetY = fy + 18;

  doc.rect(cachetX, cachetY, cachetW, cachetH)
    .strokeColor(MSP_BORDER).lineWidth(0.4).stroke();
  doc.fontSize(6.5).fillColor(MSP_GRAY).font('Helvetica')
    .text('Cachet et signature', cachetX, cachetY + 5, { width: cachetW, align: 'center', lineBreak: false });
  drawHLine(doc, cachetX + 14, cachetY + 15, cachetX + cachetW - 14, MSP_BORDER, 0.2);

  // Optional bank details — uses the free space beside the signature box.
  const bankRib = company.bankRib?.trim();
  if (bankRib) {
    const bankX = MARGIN;
    const bankY = fy + 29;
    const bankW = cachetX - MARGIN - 10;
    const bankH = 35;

    (doc as any).roundedRect(bankX, bankY, bankW, bankH, 3)
      .fillAndStroke('#FAFAFA', MSP_BORDER);
    doc.fontSize(6.5).fillColor(MSP_DARK_GRAY).font('Helvetica-Bold')
      .text('Coordonnées bancaires', bankX + 8, bankY + 5, {
        width: bankW - 16,
        lineBreak: false,
      });
    drawHLine(doc, bankX + 5, bankY + 15, bankX + bankW - 5, MSP_LINE, 0.3);
    doc.fontSize(6.5).fillColor(MSP_BLACK).font('Helvetica')
      .text(`RIB : ${bankRib}`, bankX + 8, bankY + 19, {
        width: bankW - 16,
        height: bankH - 22,
        lineBreak: true,
        ellipsis: true,
      });
  }
}

// ── Shared table column definitions ──────────────────────────────────────────

function buildSaleColWidths(tableW: number): number[] {
  // Num | Désignation(flex) | Qté | PU HT | NET HT | TVA% | NET TTC
  const cols = [25, 0, 32, 56, 56, 38, 58];
  const fixed = cols.reduce((s, w) => s + w, 0);
  cols[1] = tableW - fixed;
  return cols;
}

const SALE_HEADERS = ['Num', 'Désignation', 'Qté', 'PU HT', 'NET HT', 'TVA%', 'NET TTC'];

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PdfService {
  // ── Sale documents (DEVIS / BON_COMMANDE / BON_LIVRAISON / FACTURE) ──────────

  generateSaleDocument(
    sale: PdfSaleData,
    documentType: DocumentType | PurchaseDocumentType,
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

      // ── Header ─────────────────────────────────────────────────────────────
      let y = drawFirstPageHeader(doc, title, sale.invoiceNumber, company, logoPath);

      // ── Info blocks ────────────────────────────────────────────────────────
      const leftRows: InfoRow[] = [
        { label: 'Type', value: title },
        { label: 'N°', value: sale.invoiceNumber },
        { label: 'Date', value: fmtDateTime(sale.createdAt) },
      ];
      if (sale.representant) {
        leftRows.push({ label: 'Représentant', value: sale.representant });
      }

      const rightRows: InfoRow[] = [
        { label: 'Client', value: sale.customerName },
      ];
      if (sale.isCounterClient) {
        rightRows.push({ label: '', value: 'Client comptoir', italic: true, valueColor: MSP_RED });
      }
      if (sale.customerTaxId) rightRows.push({ label: 'MF', value: sale.customerTaxId });
      if (sale.customerAddress) rightRows.push({ label: 'Adresse', value: sale.customerAddress });
      if (sale.customerPhone) rightRows.push({ label: 'Tél', value: sale.customerPhone });
      if (sale.customerNote) rightRows.push({ label: 'Note', value: sale.customerNote, italic: true });

      y = drawInfoBlocks(doc, y + 6, pageW, title, leftRows, rightRows) + 10;

      // ── Summary strip — document reference only ────────────────────────────
      y = drawSummaryStrip(doc, y, pageW, [
        { label: 'Document', value: sale.invoiceNumber },
      ]);

      // ── Items table ────────────────────────────────────────────────────────
      const colWidths = buildSaleColWidths(tableW);

      y = drawTableHeader(doc, y, colWidths, SALE_HEADERS, tableW);
      drawHLine(doc, MARGIN, y, pageW - MARGIN, MSP_BORDER, 0.3);

      sale.items.forEach((item, idx) => {
        const tvaRate = item.tvaPercent ?? 19;
        const netHt = item.total;
        const netTtc = netHt * (1 + tvaRate / 100);
        const rowH = calcRowH(doc, item.name, colWidths[1]);

        if (y + rowH > contentBottom(doc)) {
          drawHLine(doc, MARGIN, y, pageW - MARGIN, MSP_BORDER, 0.4);
          doc.addPage();
          pageNum++;
          const hY = drawCompactHeader(doc, title, sale.invoiceNumber, company);
          y = drawTableHeader(doc, hY, colWidths, SALE_HEADERS, tableW);
          drawHLine(doc, MARGIN, y, pageW - MARGIN, MSP_BORDER, 0.3);
        }

        const bg = idx % 2 === 0 ? WHITE : MSP_LIGHT_GRAY;
        doc.rect(MARGIN, y, tableW, rowH).fillColor(bg).fill();

        const cells = [
          String(idx + 1),
          item.name,
          String(item.quantity),
          fmt3(item.unitPrice),
          fmt3(netHt),
          `${tvaRate}%`,
          fmt3(netTtc),
        ];

        let colX = MARGIN;
        cells.forEach((cell, i) => {
          doc.fontSize(7).fillColor(MSP_BLACK).font('Helvetica')
            .text(cell, colX + 3, y + ROW_PAD_V, {
              width: colWidths[i] - 6,
              align: i === 0 ? 'center' : i === 1 ? 'left' : 'right',
              lineBreak: i === 1,
            });
          colX += colWidths[i];
        });

        drawHLine(doc, MARGIN, y + rowH, pageW - MARGIN, MSP_LINE, 0.2);
        y += rowH;
      });

      drawHLine(doc, MARGIN, y, pageW - MARGIN, MSP_BORDER, 0.4);
      y += 14;

      // ── Totals ─────────────────────────────────────────────────────────────
      const summaryRows: SummaryRow[] = [
        { label: 'TOTAL HT', value: `${fmt3(sale.subtotal)} DT` },
      ];
      if (sale.discount > 0) {
        summaryRows.push({ label: 'Remise incluse', value: `${fmt3(sale.discount)} DT`, color: MSP_RED });
      }
      summaryRows.push({ label: 'TOTAL TVA', value: `${fmt3(sale.tax)} DT` });
      summaryRows.push({ label: 'TOTAL TTC', value: `${fmt3(sale.total)} DT`, bold: true });
      if ((sale.timbreFiscal ?? 0) > 0) {
        summaryRows.push({ label: 'TIMBRE FISCAL', value: `${fmt3(sale.timbreFiscal!)} DT` });
      }
      const totalFinal = sale.total + (sale.timbreFiscal ?? 0);
      summaryRows.push({ label: 'TOTAL À PAYER', value: `${fmt3(totalFinal)} DT`, highlight: true });

      const totH = summaryRows.length * 17 + 4;
      if (y + totH + 24 > contentBottom(doc)) {
        doc.addPage();
        pageNum++;
        y = drawCompactHeader(doc, title, sale.invoiceNumber, company);
        y += 6;
      }

      const afterTotals = drawTotals(doc, y, summaryRows, pageW);
      y = afterTotals + 14;

      // ── Montant en lettres ─────────────────────────────────────────────────
      if (y + 14 < contentBottom(doc)) {
        const words = numberToFrenchWords(totalFinal);
        doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Oblique')
          .text(
            `Arrêté le présent ${title.toLowerCase()} à la somme de : ${words}`,
            MARGIN, y,
            { width: pageW - MARGIN * 2 },
          );
      }

      // ── Footer ─────────────────────────────────────────────────────────────
      drawPageFooter(doc, company, pageNum);

      doc.end();
    });
  }

  // ── Avoir documents ───────────────────────────────────────────────────────────

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

      // ── Header ─────────────────────────────────────────────────────────────
      let y = drawFirstPageHeader(doc, 'AVOIR', avoir.numero, company, logoPath);

      // ── Info blocks ────────────────────────────────────────────────────────
      const leftRows: InfoRow[] = [
        { label: 'Type', value: 'AVOIR' },
        { label: 'N°', value: avoir.numero },
        { label: 'Date', value: fmtDateTime(avoir.dateAvoir) },
        { label: 'Facture', value: avoir.factureOrigine },
      ];
      if (avoir.motif) leftRows.push({ label: 'Motif', value: avoir.motif });

      const rightRows: InfoRow[] = [
        { label: 'Client', value: avoir.customerName },
      ];
      if (avoir.isCounterClient) {
        rightRows.push({ label: '', value: 'Client comptoir', italic: true, valueColor: MSP_RED });
      }
      if (avoir.customerTaxId) rightRows.push({ label: 'MF', value: avoir.customerTaxId });
      if (avoir.customerAddress) rightRows.push({ label: 'Adresse', value: avoir.customerAddress });
      if (avoir.customerPhone) rightRows.push({ label: 'Tél', value: avoir.customerPhone });
      if (avoir.customerNote) rightRows.push({ label: 'Note', value: avoir.customerNote, italic: true });

      y = drawInfoBlocks(doc, y + 6, pageW, 'AVOIR', leftRows, rightRows) + 10;

      // ── Summary strip — document reference only ────────────────────────────
      y = drawSummaryStrip(doc, y, pageW, [
        { label: 'Document', value: avoir.numero },
      ]);

      // ── Items table ────────────────────────────────────────────────────────
      // Num | Désignation(flex) | Qté | PU HT | NET HT | TVA% | NET TTC | Motif
      const avColWidths = [25, 0, 30, 50, 50, 34, 50, 50];
      const avFixed = avColWidths.reduce((s, w) => s + w, 0);
      avColWidths[1] = tableW - avFixed;
      const avHeaders = ['Num', 'Désignation', 'Qté', 'PU HT', 'NET HT', 'TVA%', 'NET TTC', 'Motif'];

      y = drawTableHeader(doc, y, avColWidths, avHeaders, tableW);
      drawHLine(doc, MARGIN, y, pageW - MARGIN, MSP_BORDER, 0.3);

      avoir.items.forEach((item, idx) => {
        const desigH = calcRowH(doc, item.name, avColWidths[1]);
        const motifH = item.motifLigne ? calcRowH(doc, item.motifLigne, avColWidths[7]) : ROW_MIN_H;
        const rowH = Math.max(desigH, motifH);

        if (y + rowH > contentBottom(doc)) {
          drawHLine(doc, MARGIN, y, pageW - MARGIN, MSP_BORDER, 0.4);
          doc.addPage();
          pageNum++;
          const hY = drawCompactHeader(doc, 'AVOIR', avoir.numero, company);
          y = drawTableHeader(doc, hY, avColWidths, avHeaders, tableW);
          drawHLine(doc, MARGIN, y, pageW - MARGIN, MSP_BORDER, 0.3);
        }

        const bg = idx % 2 === 0 ? WHITE : MSP_LIGHT_GRAY;
        doc.rect(MARGIN, y, tableW, rowH).fillColor(bg).fill();

        const cells = [
          String(idx + 1),
          item.name,
          String(item.quantiteRetournee),
          fmt3(item.prixUnitaireHt),
          fmt3(item.totalHt),
          `${item.tva}%`,
          fmt3(item.totalTtc),
          item.motifLigne ?? '—',
        ];

        let colX = MARGIN;
        cells.forEach((cell, i) => {
          const isText = i === 1 || i === 7;
          doc.fontSize(7).fillColor(MSP_BLACK).font('Helvetica')
            .text(cell, colX + 3, y + ROW_PAD_V, {
              width: avColWidths[i] - 6,
              align: i === 0 ? 'center' : isText ? 'left' : 'right',
              lineBreak: isText,
            });
          colX += avColWidths[i];
        });

        drawHLine(doc, MARGIN, y + rowH, pageW - MARGIN, MSP_LINE, 0.2);
        y += rowH;
      });

      drawHLine(doc, MARGIN, y, pageW - MARGIN, MSP_BORDER, 0.4);
      y += 14;

      // ── Totals ─────────────────────────────────────────────────────────────
      const summaryRows: SummaryRow[] = [
        { label: 'TOTAL HT', value: `${fmt3(avoir.subtotal)} DT` },
        { label: 'TOTAL TVA', value: `${fmt3(avoir.tax)} DT` },
        { label: 'TOTAL TTC', value: `${fmt3(avoir.total)} DT`, bold: true },
        { label: 'TIMBRE FISCAL', value: `${fmt3(avoir.stampDuty)} DT` },
        { label: 'MONTANT REMBOURSÉ', value: `${fmt3(avoir.montantRembourse)} DT`, highlight: true },
      ];

      const totH = summaryRows.length * 17 + 4;
      if (y + totH + 16 > contentBottom(doc)) {
        doc.addPage();
        pageNum++;
        y = drawCompactHeader(doc, 'AVOIR', avoir.numero, company);
        y += 6;
      }

      const afterTotals = drawTotals(doc, y, summaryRows, pageW);
      y = afterTotals + 14;

      // ── Montant en lettres ─────────────────────────────────────────────────
      if (y + 14 < contentBottom(doc)) {
        const words = numberToFrenchWords(avoir.total + avoir.stampDuty);
        doc.fontSize(7).fillColor(MSP_DARK_GRAY).font('Helvetica-Oblique')
          .text(
            `Arrêté le présent avoir à la somme de : ${words}`,
            MARGIN, y,
            { width: pageW - MARGIN * 2 },
          );
      }

      // ── Footer ─────────────────────────────────────────────────────────────
      drawPageFooter(doc, company, pageNum);

      doc.end();
    });
  }
}
