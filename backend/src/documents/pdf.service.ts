import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { DocumentType } from '@prisma/client';

export interface PdfSaleItem {
  reference: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PdfSaleData {
  invoiceNumber: string;
  createdAt: Date | string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  customerName: string;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
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
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
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

// ── Layout constants ──────────────────────────────────────────────────────────
const MARGIN = 40;
const ROW_H = 18;
// Footer reserve: space kept at the bottom of EVERY page for the footer block
// (drawn only on the last page). Must be large enough so that all footer
// elements stay within page.height − MARGIN (= PDFKit's bottom boundary).
const FOOTER_H = 92;
const DEFAULT_COMPANY = 'Moumna spare part';

const DOC_TITLES: Record<DocumentType, string> = {
  DEVIS: 'DEVIS',
  BON_COMMANDE: 'BON DE COMMANDE',
  BON_LIVRAISON: 'BON DE LIVRAISON',
  FACTURE: 'FACTURE',
  AVOIR: 'AVOIR',
};

// ── Utility formatters ────────────────────────────────────────────────────────
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

// ── Layout helpers ────────────────────────────────────────────────────────────

/** Y below which content must not go (footer is reserved below this line). */
function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - MARGIN - FOOTER_H;
}

/** Y where the footer separator line starts. */
function footerStartY(doc: PDFKit.PDFDocument): number {
  return doc.page.height - MARGIN - FOOTER_H + 4;
}

/**
 * Draw the compact header shown on continuation pages (pages 2+).
 * Returns the Y position right after the header separator.
 */
function drawCompactHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  docNumber: string,
  company: PdfCompanyInfo,
  accentColor: string,
): number {
  const pageW = doc.page.width;
  const companyName = company.name ?? DEFAULT_COMPANY;
  const y = MARGIN;

  doc
    .fontSize(9)
    .fillColor(accentColor)
    .font('Helvetica-Bold')
    .text(`${title} N° ${docNumber}`, MARGIN, y);

  doc
    .fontSize(8)
    .fillColor('#323232')
    .font('Helvetica-Bold')
    .text(companyName, MARGIN, y, {
      align: 'right',
      width: pageW - MARGIN * 2,
    });

  doc
    .moveTo(MARGIN, y + 14)
    .lineTo(pageW - MARGIN, y + 14)
    .strokeColor('#c8d2e6')
    .lineWidth(0.3)
    .stroke();

  return y + 22;
}

/**
 * Draw the blue/colored table header row.
 * Returns the Y position right after the header row.
 */
function drawTableHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  colWidths: number[],
  headers: string[],
  tableW: number,
  fillColor: string,
  numericStartIdx = 2,
): number {
  doc.rect(MARGIN, y, tableW, ROW_H).fillColor(fillColor).fill();
  let colX = MARGIN;
  headers.forEach((h, i) => {
    doc
      .fontSize(7)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text(h, colX + 3, y + 5, {
        width: colWidths[i] - 6,
        align: i >= numericStartIdx ? 'right' : 'left',
      });
    colX += colWidths[i];
  });
  return y + ROW_H;
}

/**
 * Draw the footer + cachet block on the CURRENT (last) page.
 * All content is positioned within footerStartY .. page.height − MARGIN.
 */
function drawPageFooter(
  doc: PDFKit.PDFDocument,
  company: PdfCompanyInfo,
  accentColor: string,
  mainText: string,
  pageNum: number,
): void {
  const pageW = doc.page.width;
  const fy = footerStartY(doc);
  const companyName = company.name ?? DEFAULT_COMPANY;

  // Separator line
  doc
    .moveTo(MARGIN, fy)
    .lineTo(pageW - MARGIN, fy)
    .strokeColor(accentColor)
    .lineWidth(0.3)
    .stroke();

  // Left column text (60 % width)
  const textW = (pageW - MARGIN * 2) * 0.62;
  let ty = fy + 8;

  doc
    .fontSize(7.5)
    .fillColor('#787878')
    .font('Helvetica-Oblique')
    .text(mainText, MARGIN, ty, { width: textW });
  ty += 11;

  doc
    .fontSize(7.5)
    .fillColor('#323232')
    .font('Helvetica-Bold')
    .text(companyName, MARGIN, ty, { width: textW });
  ty += 10;

  const infoLine = [company.address, company.phone, company.email]
    .filter(Boolean)
    .join('  |  ');
  if (infoLine) {
    doc
      .fontSize(6.5)
      .fillColor('#646464')
      .font('Helvetica')
      .text(infoLine, MARGIN, ty, { width: textW });
    ty += 9;
  }

  if (company.taxNumber) {
    doc
      .fontSize(6.5)
      .fillColor('#646464')
      .font('Helvetica')
      .text(`MF : ${company.taxNumber}`, MARGIN, ty, { width: textW });
    ty += 9;
  }

  doc
    .fontSize(6)
    .fillColor('#aaaaaa')
    .font('Helvetica')
    .text(
      `Page ${pageNum}  —  Document généré le ${fmtDate(new Date())}`,
      MARGIN,
      ty,
      { width: textW },
    );

  // Right column: Cachet box
  const cachetW = 148;
  const cachetH = 58;
  const cachetX = pageW - MARGIN - cachetW;
  const cachetY = fy + 6;

  doc
    .rect(cachetX, cachetY, cachetW, cachetH)
    .strokeColor(accentColor)
    .lineWidth(0.5)
    .stroke();

  doc
    .fontSize(7)
    .fillColor('#505050')
    .font('Helvetica-Bold')
    .text('Cachet et signature', cachetX, cachetY + 6, {
      width: cachetW,
      align: 'center',
    });
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
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const title = DOC_TITLES[documentType];
      const pageW = doc.page.width;
      const tableW = pageW - MARGIN * 2;
      const accentColor = '#1e50a0';
      const companyName = company.name ?? DEFAULT_COMPANY;
      let pageNum = 1;

      // ── Page 1 full header ─────────────────────────────────────────────────
      doc
        .fontSize(22)
        .fillColor(accentColor)
        .font('Helvetica-Bold')
        .text(title, MARGIN, MARGIN);

      doc
        .fontSize(10)
        .fillColor('#323232')
        .font('Helvetica-Bold')
        .text(companyName, MARGIN, MARGIN, {
          align: 'right',
          width: pageW - MARGIN * 2,
        });

      let rightY = MARGIN + 14;
      const companyLines: string[] = [];
      if (company.address) companyLines.push(company.address);
      if (company.phone) companyLines.push(`Tél : ${company.phone}`);
      if (company.email) companyLines.push(company.email);
      if (company.taxNumber) companyLines.push(`MF : ${company.taxNumber}`);

      doc.fontSize(8).fillColor('#646464').font('Helvetica');
      companyLines.forEach((line) => {
        doc.text(line, MARGIN, rightY, {
          align: 'right',
          width: pageW - MARGIN * 2,
        });
        rightY += 11;
      });

      const headerBottom = Math.max(MARGIN + 32, rightY + 6);
      doc
        .moveTo(MARGIN, headerBottom)
        .lineTo(pageW - MARGIN, headerBottom)
        .strokeColor('#c8d2e6')
        .lineWidth(0.5)
        .stroke();

      // ── Document meta ──────────────────────────────────────────────────────
      let y = headerBottom + 10;

      doc
        .fontSize(11)
        .fillColor('#1e1e1e')
        .font('Helvetica-Bold')
        .text(`${title} N° ${sale.invoiceNumber}`, MARGIN, y);
      y += 15;

      doc
        .fontSize(8)
        .fillColor('#505050')
        .font('Helvetica')
        .text(`Date : ${fmtDate(sale.createdAt)}`, MARGIN, y);
      y += 12;

      // Client box (right side, same row as meta)
      const boxX = pageW / 2 + 8;
      const boxW = pageW - MARGIN - boxX;
      const boxY = headerBottom + 10;

      let clientBoxH = 38;
      if (sale.customerAddress) clientBoxH += 12;
      if (sale.customerPhone) clientBoxH += 12;
      if (sale.customerEmail) clientBoxH += 12;

      doc
        .rect(boxX, boxY, boxW, clientBoxH)
        .fillColor('#f5f7fc')
        .strokeColor('#c8d2e6')
        .lineWidth(0.5)
        .fillAndStroke();

      doc
        .fontSize(7)
        .fillColor('#5064a0')
        .font('Helvetica-Bold')
        .text('CLIENT', boxX + 6, boxY + 5);

      doc
        .fontSize(9)
        .fillColor('#1e1e1e')
        .font('Helvetica-Bold')
        .text(sale.customerName, boxX + 6, boxY + 15, { width: boxW - 12 });

      doc.fontSize(7).fillColor('#505050').font('Helvetica');
      let cY = boxY + 27;
      if (sale.customerAddress) {
        doc.text(sale.customerAddress, boxX + 6, cY, { width: boxW - 12 });
        cY += 12;
      }
      if (sale.customerPhone) {
        doc.text(`Tél : ${sale.customerPhone}`, boxX + 6, cY, {
          width: boxW - 12,
        });
        cY += 12;
      }
      if (sale.customerEmail) {
        doc.text(sale.customerEmail, boxX + 6, cY, { width: boxW - 12 });
      }

      y = Math.max(y + 8, boxY + clientBoxH + 10);

      // ── Items table ────────────────────────────────────────────────────────
      const colWidths = [50, 0, 30, 55, 55, 35, 55];
      const fixedW = colWidths.reduce((s, w) => s + w, 0);
      colWidths[1] = tableW - fixedW;

      const headers = [
        'Réf',
        'Désignation',
        'Qté',
        'PU HT',
        'Total HT',
        'TVA',
        'Total TTC',
      ];

      // Draw first table header
      let sectionTopY = y; // top of current page's table block (includes header row)
      y = drawTableHeader(doc, y, colWidths, headers, tableW, accentColor);

      // Draw rows with automatic pagination
      sale.items.forEach((item, idx) => {
        if (y + ROW_H > contentBottom(doc)) {
          // Close the table section border on this page
          doc
            .rect(MARGIN, sectionTopY, tableW, y - sectionTopY)
            .strokeColor('#c8d2e6')
            .lineWidth(0.3)
            .stroke();

          // New page
          doc.addPage();
          pageNum++;
          const afterCompact = drawCompactHeader(
            doc,
            title,
            sale.invoiceNumber,
            company,
            accentColor,
          );
          sectionTopY = afterCompact;
          y = drawTableHeader(
            doc,
            afterCompact,
            colWidths,
            headers,
            tableW,
            accentColor,
          );
        }

        const tvaRate = 19;
        const totalTtc = item.total * (1 + tvaRate / 100);
        const bg = idx % 2 === 0 ? '#ffffff' : '#f7f9ff';
        doc.rect(MARGIN, y, tableW, ROW_H).fillColor(bg).fill();

        const rowData = [
          item.reference,
          item.name,
          String(item.quantity),
          fmt3(item.unitPrice),
          fmt3(item.total),
          `${tvaRate}%`,
          fmt3(totalTtc),
        ];

        let colX = MARGIN;
        rowData.forEach((cell, i) => {
          doc
            .fontSize(7)
            .fillColor('#282828')
            .font('Helvetica')
            .text(cell, colX + 3, y + 5, {
              width: colWidths[i] - 6,
              align: i >= 2 ? 'right' : 'left',
              ellipsis: true,
            });
          colX += colWidths[i];
        });
        y += ROW_H;
      });

      // Close final table section border
      doc
        .rect(MARGIN, sectionTopY, tableW, y - sectionTopY)
        .strokeColor('#c8d2e6')
        .lineWidth(0.3)
        .stroke();

      y += 10;

      // ── Totals ─────────────────────────────────────────────────────────────
      const summaryRows: Array<{
        label: string;
        value: string;
        bold?: boolean;
      }> = [{ label: 'Total HT', value: `${fmt3(sale.subtotal)} DT` }];

      if (sale.discount > 0) {
        summaryRows.push({
          label: 'Remise',
          value: `- ${fmt3(sale.discount)} DT`,
        });
      }
      summaryRows.push({
        label: 'Total TVA (19%)',
        value: `${fmt3(sale.tax)} DT`,
      });
      summaryRows.push({
        label: 'Total TTC',
        value: `${fmt3(sale.total)} DT`,
        bold: true,
      });

      const summaryW = 165;
      const summaryH = summaryRows.length * 16 + 12;

      // Move to new page if totals block doesn't fit
      if (y + summaryH > contentBottom(doc)) {
        doc.addPage();
        pageNum++;
        y = drawCompactHeader(doc, title, sale.invoiceNumber, company, accentColor);
        y += 6;
      }

      const summaryX = pageW - MARGIN - summaryW;
      doc
        .rect(summaryX, y, summaryW, summaryH)
        .fillColor('#f5f7fc')
        .strokeColor('#c8d2e6')
        .lineWidth(0.3)
        .fillAndStroke();

      summaryRows.forEach((row, i) => {
        const ry = y + 7 + i * 16;
        if (row.bold) {
          doc
            .moveTo(summaryX + 4, ry - 3)
            .lineTo(summaryX + summaryW - 4, ry - 3)
            .strokeColor('#b4c8e6')
            .lineWidth(0.3)
            .stroke();
        }
        doc
          .fontSize(row.bold ? 9 : 7.5)
          .fillColor(row.bold ? '#1e1e1e' : '#505050')
          .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(row.label, summaryX + 6, ry);
        doc
          .fontSize(row.bold ? 9 : 7.5)
          .fillColor(row.bold ? '#1e1e1e' : '#505050')
          .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(row.value, summaryX + 6, ry, {
            width: summaryW - 12,
            align: 'right',
          });
      });

      // ── Footer + cachet (last page only) ───────────────────────────────────
      drawPageFooter(
        doc,
        company,
        accentColor,
        'Merci pour votre confiance.',
        pageNum,
      );

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
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const tableW = pageW - MARGIN * 2;
      const accentColor = '#c0392b';
      const borderColor = '#e8b4b0';
      const companyName = company.name ?? DEFAULT_COMPANY;
      let pageNum = 1;

      // ── Page 1 full header ─────────────────────────────────────────────────
      doc
        .fontSize(22)
        .fillColor(accentColor)
        .font('Helvetica-Bold')
        .text('AVOIR', MARGIN, MARGIN);

      doc
        .fontSize(10)
        .fillColor('#323232')
        .font('Helvetica-Bold')
        .text(companyName, MARGIN, MARGIN, {
          align: 'right',
          width: pageW - MARGIN * 2,
        });

      let rightY = MARGIN + 14;
      const companyLines: string[] = [];
      if (company.address) companyLines.push(company.address);
      if (company.phone) companyLines.push(`Tél : ${company.phone}`);
      if (company.email) companyLines.push(company.email);
      if (company.taxNumber) companyLines.push(`MF : ${company.taxNumber}`);

      doc.fontSize(8).fillColor('#646464').font('Helvetica');
      companyLines.forEach((line) => {
        doc.text(line, MARGIN, rightY, {
          align: 'right',
          width: pageW - MARGIN * 2,
        });
        rightY += 11;
      });

      const headerBottom = Math.max(MARGIN + 32, rightY + 6);
      doc
        .moveTo(MARGIN, headerBottom)
        .lineTo(pageW - MARGIN, headerBottom)
        .strokeColor(borderColor)
        .lineWidth(0.5)
        .stroke();

      // ── Document meta ──────────────────────────────────────────────────────
      let y = headerBottom + 10;

      doc
        .fontSize(11)
        .fillColor('#1e1e1e')
        .font('Helvetica-Bold')
        .text(`AVOIR N° ${avoir.numero}`, MARGIN, y);
      y += 15;

      doc
        .fontSize(8)
        .fillColor('#505050')
        .font('Helvetica')
        .text(`Date : ${fmtDate(avoir.dateAvoir)}`, MARGIN, y);
      y += 11;

      doc.text(
        `Facture d'origine : ${avoir.factureOrigine}`,
        MARGIN,
        y,
      );
      y += 11;

      if (avoir.motif) {
        doc.text(`Motif : ${avoir.motif}`, MARGIN, y);
        y += 11;
      }

      // Client box (right side)
      const boxX = pageW / 2 + 8;
      const boxW = pageW - MARGIN - boxX;
      const boxY = headerBottom + 10;

      let clientBoxH = 38;
      if (avoir.customerAddress) clientBoxH += 12;
      if (avoir.customerPhone) clientBoxH += 12;
      if (avoir.customerEmail) clientBoxH += 12;

      doc
        .rect(boxX, boxY, boxW, clientBoxH)
        .fillColor('#fdf5f5')
        .strokeColor(borderColor)
        .lineWidth(0.5)
        .fillAndStroke();

      doc
        .fontSize(7)
        .fillColor('#a04040')
        .font('Helvetica-Bold')
        .text('CLIENT', boxX + 6, boxY + 5);

      doc
        .fontSize(9)
        .fillColor('#1e1e1e')
        .font('Helvetica-Bold')
        .text(avoir.customerName, boxX + 6, boxY + 15, { width: boxW - 12 });

      doc.fontSize(7).fillColor('#505050').font('Helvetica');
      let cY = boxY + 27;
      if (avoir.customerAddress) {
        doc.text(avoir.customerAddress, boxX + 6, cY, { width: boxW - 12 });
        cY += 12;
      }
      if (avoir.customerPhone) {
        doc.text(`Tél : ${avoir.customerPhone}`, boxX + 6, cY, {
          width: boxW - 12,
        });
        cY += 12;
      }
      if (avoir.customerEmail) {
        doc.text(avoir.customerEmail, boxX + 6, cY, { width: boxW - 12 });
      }

      y = Math.max(y + 8, boxY + clientBoxH + 10);

      // ── Items table ────────────────────────────────────────────────────────
      const colWidths = [50, 0, 30, 50, 45, 35, 50, 50];
      const fixedW = colWidths.reduce((s, w) => s + w, 0);
      colWidths[1] = tableW - fixedW;

      const headers = [
        'Réf',
        'Désignation',
        'Qté',
        'PU HT',
        'Total HT',
        'TVA',
        'Total TTC',
        'Motif',
      ];

      let sectionTopY = y;
      y = drawTableHeader(doc, y, colWidths, headers, tableW, accentColor, 2);

      avoir.items.forEach((item, idx) => {
        if (y + ROW_H > contentBottom(doc)) {
          doc
            .rect(MARGIN, sectionTopY, tableW, y - sectionTopY)
            .strokeColor(borderColor)
            .lineWidth(0.3)
            .stroke();

          doc.addPage();
          pageNum++;
          const afterCompact = drawCompactHeader(
            doc,
            'AVOIR',
            avoir.numero,
            company,
            accentColor,
          );
          sectionTopY = afterCompact;
          y = drawTableHeader(
            doc,
            afterCompact,
            colWidths,
            headers,
            tableW,
            accentColor,
            2,
          );
        }

        const bg = idx % 2 === 0 ? '#ffffff' : '#fdf5f5';
        doc.rect(MARGIN, y, tableW, ROW_H).fillColor(bg).fill();

        const rowData = [
          item.reference,
          item.name,
          String(item.quantiteRetournee),
          fmt3(item.prixUnitaireHt),
          fmt3(item.totalHt),
          `${item.tva}%`,
          fmt3(item.totalTtc),
          item.motifLigne ?? '',
        ];

        let colX = MARGIN;
        rowData.forEach((cell, i) => {
          doc
            .fontSize(7)
            .fillColor('#282828')
            .font('Helvetica')
            .text(cell, colX + 3, y + 5, {
              width: colWidths[i] - 6,
              align: i >= 2 && i <= 6 ? 'right' : 'left',
              ellipsis: true,
            });
          colX += colWidths[i];
        });
        y += ROW_H;
      });

      doc
        .rect(MARGIN, sectionTopY, tableW, y - sectionTopY)
        .strokeColor(borderColor)
        .lineWidth(0.3)
        .stroke();

      y += 10;

      // ── Totals ─────────────────────────────────────────────────────────────
      const summaryRows: Array<{
        label: string;
        value: string;
        bold?: boolean;
        color?: string;
      }> = [
        { label: 'Total HT', value: `${fmt3(avoir.subtotal)} DT` },
        { label: 'Total TVA', value: `${fmt3(avoir.tax)} DT` },
        {
          label: 'Total TTC',
          value: `${fmt3(avoir.total)} DT`,
          bold: true,
        },
        {
          label: 'Montant remboursé',
          value: `${fmt3(avoir.montantRembourse)} DT`,
          bold: true,
          color: accentColor,
        },
      ];

      const summaryW = 175;
      const summaryH = summaryRows.length * 16 + 12;

      if (y + summaryH > contentBottom(doc)) {
        doc.addPage();
        pageNum++;
        y = drawCompactHeader(doc, 'AVOIR', avoir.numero, company, accentColor);
        y += 6;
      }

      const summaryX = pageW - MARGIN - summaryW;
      doc
        .rect(summaryX, y, summaryW, summaryH)
        .fillColor('#fdf5f5')
        .strokeColor(borderColor)
        .lineWidth(0.3)
        .fillAndStroke();

      summaryRows.forEach((row, i) => {
        const ry = y + 7 + i * 16;
        if (row.bold) {
          doc
            .moveTo(summaryX + 4, ry - 3)
            .lineTo(summaryX + summaryW - 4, ry - 3)
            .strokeColor(borderColor)
            .lineWidth(0.3)
            .stroke();
        }
        const color = row.color ?? (row.bold ? '#1e1e1e' : '#505050');
        doc
          .fontSize(row.bold ? 9 : 7.5)
          .fillColor(color)
          .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(row.label, summaryX + 6, ry);
        doc
          .fontSize(row.bold ? 9 : 7.5)
          .fillColor(color)
          .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(row.value, summaryX + 6, ry, {
            width: summaryW - 12,
            align: 'right',
          });
      });

      // ── Footer + cachet (last page only) ───────────────────────────────────
      drawPageFooter(
        doc,
        company,
        accentColor,
        "Ce document annule et remplace partiellement la facture d'origine.",
        pageNum,
      );

      doc.end();
    });
  }
}
