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

const DOC_TITLES: Record<DocumentType, string> = {
  DEVIS: 'DEVIS',
  BON_COMMANDE: 'BON DE COMMANDE',
  BON_LIVRAISON: 'BON DE LIVRAISON',
  FACTURE: 'FACTURE',
  AVOIR: 'AVOIR',
};

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

@Injectable()
export class PdfService {
  generateSaleDocument(
    sale: PdfSaleData,
    documentType: DocumentType,
    company: PdfCompanyInfo = {},
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const title = DOC_TITLES[documentType];
      const pageW = doc.page.width;
      const margin = 40;
      const colRight = pageW - margin;

      // ── Header ──────────────────────────────────────────────────────────
      doc
        .fontSize(18)
        .fillColor('#1e50a0')
        .font('Helvetica-Bold')
        .text(title, margin, 40);

      const companyName = company.name ?? 'Stockini';
      doc
        .fontSize(10)
        .fillColor('#323232')
        .font('Helvetica-Bold')
        .text(companyName, margin, 40, {
          align: 'right',
          width: pageW - margin * 2,
        });

      let rightY = 55;
      doc.fontSize(8).fillColor('#646464').font('Helvetica');
      const companyLines: string[] = [];
      if (company.address) companyLines.push(company.address);
      if (company.phone) companyLines.push(`Tél : ${company.phone}`);
      if (company.email) companyLines.push(company.email);
      if (company.taxNumber) companyLines.push(`MF : ${company.taxNumber}`);
      companyLines.forEach((line) => {
        doc.text(line, margin, rightY, {
          align: 'right',
          width: pageW - margin * 2,
        });
        rightY += 12;
      });

      const headerBottom = Math.max(70, rightY + 4);

      doc
        .moveTo(margin, headerBottom)
        .lineTo(colRight, headerBottom)
        .strokeColor('#c8d2e6')
        .lineWidth(0.5)
        .stroke();

      // ── Document meta ─────────────────────────────────────────────────
      let y = headerBottom + 10;
      doc
        .fontSize(10)
        .fillColor('#1e1e1e')
        .font('Helvetica-Bold')
        .text(`${title} N° ${sale.invoiceNumber}`, margin, y);
      y += 14;
      doc
        .fontSize(8)
        .fillColor('#505050')
        .font('Helvetica')
        .text(`Date : ${fmtDate(sale.createdAt)}`, margin, y);
      y += 10;

      // Client box (right side)
      const boxX = pageW / 2 + 5;
      const boxW = colRight - boxX;
      const boxY = headerBottom + 10;
      doc
        .rect(boxX, boxY, boxW, 55)
        .fillColor('#f5f7fc')
        .strokeColor('#c8d2e6')
        .lineWidth(0.5)
        .fillAndStroke();
      doc
        .fontSize(7)
        .fillColor('#5064a0')
        .font('Helvetica-Bold')
        .text('CLIENT', boxX + 6, boxY + 6);
      doc
        .fontSize(9)
        .fillColor('#1e1e1e')
        .font('Helvetica-Bold')
        .text(sale.customerName, boxX + 6, boxY + 16);
      doc.fontSize(7).fillColor('#505050').font('Helvetica');
      let cY = boxY + 28;
      if (sale.customerAddress) {
        doc.text(sale.customerAddress, boxX + 6, cY, { width: boxW - 12 });
        cY += 11;
      }
      if (sale.customerPhone)
        doc.text(`Tél : ${sale.customerPhone}`, boxX + 6, cY, {
          width: boxW - 12,
        });

      y = Math.max(y + 20, boxY + 60);

      // ── Items table ───────────────────────────────────────────────────
      const colWidths = [50, 0, 30, 55, 55, 35, 55]; // 0 = auto for designation
      const tableW = colRight - margin;
      const fixedW = colWidths.reduce((s, w) => s + w, 0);
      const autoW = tableW - fixedW;
      colWidths[1] = autoW;

      const headers = [
        'Réf',
        'Désignation',
        'Qté',
        'PU HT',
        'Total HT',
        'TVA',
        'Total TTC',
      ];
      const rowH = 18;

      // Header row
      doc.rect(margin, y, tableW, rowH).fillColor('#1e50a0').fill();
      let colX = margin;
      headers.forEach((h, i) => {
        doc
          .fontSize(7)
          .fillColor('#ffffff')
          .font('Helvetica-Bold')
          .text(h, colX + 3, y + 5, {
            width: colWidths[i] - 6,
            align: i >= 2 ? 'right' : 'left',
          });
        colX += colWidths[i];
      });
      y += rowH;

      // Data rows
      sale.items.forEach((item, idx) => {
        const tvaRate = 19;
        const totalTtc = item.total * (1 + tvaRate / 100);
        const rowData = [
          item.reference,
          item.name,
          String(item.quantity),
          fmt3(item.unitPrice),
          fmt3(item.total),
          `${tvaRate}%`,
          fmt3(totalTtc),
        ];
        const bg = idx % 2 === 0 ? '#ffffff' : '#f7f9ff';
        doc.rect(margin, y, tableW, rowH).fillColor(bg).fill();
        colX = margin;
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
        y += rowH;
      });

      // Table border
      doc
        .rect(
          margin,
          y - sale.items.length * rowH - rowH,
          tableW,
          sale.items.length * rowH + rowH,
        )
        .strokeColor('#c8d2e6')
        .lineWidth(0.3)
        .stroke();

      y += 10;

      // ── Totals ────────────────────────────────────────────────────────
      const summaryW = 160;
      const summaryX = colRight - summaryW;
      const rows: Array<{ label: string; value: string; bold?: boolean }> = [
        { label: 'Total HT', value: `${fmt3(sale.subtotal)} DT` },
      ];
      if (sale.discount > 0)
        rows.push({ label: 'Remise', value: `- ${fmt3(sale.discount)} DT` });
      rows.push({ label: 'Total TVA (19%)', value: `${fmt3(sale.tax)} DT` });
      rows.push({
        label: 'Total TTC',
        value: `${fmt3(sale.total)} DT`,
        bold: true,
      });

      const summaryH = rows.length * 16 + 8;
      doc
        .rect(summaryX, y, summaryW, summaryH)
        .fillColor('#f5f7fc')
        .strokeColor('#c8d2e6')
        .lineWidth(0.3)
        .fillAndStroke();

      rows.forEach((row, i) => {
        const ry = y + 6 + i * 16;
        if (row.bold) {
          doc
            .moveTo(summaryX + 4, ry - 3)
            .lineTo(summaryX + summaryW - 4, ry - 3)
            .strokeColor('#b4c8e6')
            .lineWidth(0.3)
            .stroke();
        }
        doc
          .fontSize(row.bold ? 9 : 7)
          .fillColor(row.bold ? '#1e1e1e' : '#505050')
          .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(row.label, summaryX + 6, ry);
        doc
          .fontSize(row.bold ? 9 : 7)
          .fillColor(row.bold ? '#1e1e1e' : '#505050')
          .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(row.value, summaryX + 6, ry, {
            width: summaryW - 12,
            align: 'right',
          });
      });

      // ── Footer ────────────────────────────────────────────────────────
      const pageH = doc.page.height;
      const footerY = pageH - 50;
      doc
        .moveTo(margin, footerY)
        .lineTo(colRight, footerY)
        .strokeColor('#c8d2e6')
        .lineWidth(0.3)
        .stroke();
      doc
        .fontSize(8)
        .fillColor('#787878')
        .font('Helvetica-Oblique')
        .text('Merci pour votre confiance.', margin, footerY + 6, {
          align: 'center',
          width: pageW - margin * 2,
        });
      if (company.taxNumber) {
        doc
          .fontSize(7)
          .fillColor('#787878')
          .font('Helvetica')
          .text(`MF : ${company.taxNumber}`, margin, footerY + 18, {
            align: 'center',
            width: pageW - margin * 2,
          });
      }
      doc
        .fontSize(6)
        .fillColor('#aaaaaa')
        .font('Helvetica')
        .text(
          `Document généré le ${fmtDate(new Date())}`,
          margin,
          footerY + 30,
          { align: 'center', width: pageW - margin * 2 },
        );

      doc.end();
    });
  }

  generateAvoirDocument(
    avoir: PdfAvoirData,
    company: PdfCompanyInfo = {},
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const margin = 40;
      const colRight = pageW - margin;

      // ── Header ──────────────────────────────────────────────────────────
      doc
        .fontSize(18)
        .fillColor('#c0392b')
        .font('Helvetica-Bold')
        .text('AVOIR', margin, 40);

      const companyName = company.name ?? 'Stockini';
      doc
        .fontSize(10)
        .fillColor('#323232')
        .font('Helvetica-Bold')
        .text(companyName, margin, 40, {
          align: 'right',
          width: pageW - margin * 2,
        });

      let rightY = 55;
      doc.fontSize(8).fillColor('#646464').font('Helvetica');
      const companyLines: string[] = [];
      if (company.address) companyLines.push(company.address);
      if (company.phone) companyLines.push(`Tél : ${company.phone}`);
      if (company.email) companyLines.push(company.email);
      if (company.taxNumber) companyLines.push(`MF : ${company.taxNumber}`);
      companyLines.forEach((line) => {
        doc.text(line, margin, rightY, {
          align: 'right',
          width: pageW - margin * 2,
        });
        rightY += 12;
      });

      const headerBottom = Math.max(70, rightY + 4);
      doc
        .moveTo(margin, headerBottom)
        .lineTo(colRight, headerBottom)
        .strokeColor('#e8b4b0')
        .lineWidth(0.5)
        .stroke();

      // ── Document meta ─────────────────────────────────────────────────
      let y = headerBottom + 10;
      doc
        .fontSize(10)
        .fillColor('#1e1e1e')
        .font('Helvetica-Bold')
        .text(`AVOIR N° ${avoir.numero}`, margin, y);
      y += 14;
      doc
        .fontSize(8)
        .fillColor('#505050')
        .font('Helvetica')
        .text(`Date : ${fmtDate(avoir.dateAvoir)}`, margin, y);
      y += 12;
      doc
        .fontSize(8)
        .fillColor('#505050')
        .font('Helvetica')
        .text(`Facture d'origine : ${avoir.factureOrigine}`, margin, y);
      y += 10;
      if (avoir.motif) {
        doc
          .fontSize(8)
          .fillColor('#505050')
          .font('Helvetica')
          .text(`Motif : ${avoir.motif}`, margin, y);
        y += 10;
      }

      // Client box (right side)
      const boxX = pageW / 2 + 5;
      const boxW = colRight - boxX;
      const boxY = headerBottom + 10;
      doc
        .rect(boxX, boxY, boxW, 55)
        .fillColor('#fdf5f5')
        .strokeColor('#e8b4b0')
        .lineWidth(0.5)
        .fillAndStroke();
      doc
        .fontSize(7)
        .fillColor('#a04040')
        .font('Helvetica-Bold')
        .text('CLIENT', boxX + 6, boxY + 6);
      doc
        .fontSize(9)
        .fillColor('#1e1e1e')
        .font('Helvetica-Bold')
        .text(avoir.customerName, boxX + 6, boxY + 16);
      doc.fontSize(7).fillColor('#505050').font('Helvetica');
      let cY = boxY + 28;
      if (avoir.customerAddress) {
        doc.text(avoir.customerAddress, boxX + 6, cY, { width: boxW - 12 });
        cY += 11;
      }
      if (avoir.customerPhone)
        doc.text(`Tél : ${avoir.customerPhone}`, boxX + 6, cY, {
          width: boxW - 12,
        });

      y = Math.max(y + 20, boxY + 60);

      // ── Items table ───────────────────────────────────────────────────
      const tableW = colRight - margin;
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
      const rowH = 18;

      doc.rect(margin, y, tableW, rowH).fillColor('#c0392b').fill();
      let colX = margin;
      headers.forEach((h, i) => {
        doc
          .fontSize(7)
          .fillColor('#ffffff')
          .font('Helvetica-Bold')
          .text(h, colX + 3, y + 5, {
            width: colWidths[i] - 6,
            align: i >= 2 && i <= 6 ? 'right' : 'left',
          });
        colX += colWidths[i];
      });
      y += rowH;

      avoir.items.forEach((item, idx) => {
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
        const bg = idx % 2 === 0 ? '#ffffff' : '#fdf5f5';
        doc.rect(margin, y, tableW, rowH).fillColor(bg).fill();
        colX = margin;
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
        y += rowH;
      });

      doc
        .rect(
          margin,
          y - avoir.items.length * rowH - rowH,
          tableW,
          avoir.items.length * rowH + rowH,
        )
        .strokeColor('#e8b4b0')
        .lineWidth(0.3)
        .stroke();

      y += 10;

      // ── Totals ────────────────────────────────────────────────────────
      const summaryW = 180;
      const summaryX = colRight - summaryW;
      const rows: Array<{
        label: string;
        value: string;
        bold?: boolean;
        color?: string;
      }> = [
        { label: 'Total HT', value: `${fmt3(avoir.subtotal)} DT` },
        { label: 'Total TVA (19%)', value: `${fmt3(avoir.tax)} DT` },
        { label: 'Total TTC', value: `${fmt3(avoir.total)} DT`, bold: true },
        {
          label: 'Montant remboursé',
          value: `${fmt3(avoir.montantRembourse)} DT`,
          bold: true,
          color: '#c0392b',
        },
      ];

      const summaryH = rows.length * 16 + 8;
      doc
        .rect(summaryX, y, summaryW, summaryH)
        .fillColor('#fdf5f5')
        .strokeColor('#e8b4b0')
        .lineWidth(0.3)
        .fillAndStroke();

      rows.forEach((row, i) => {
        const ry = y + 6 + i * 16;
        if (row.bold) {
          doc
            .moveTo(summaryX + 4, ry - 3)
            .lineTo(summaryX + summaryW - 4, ry - 3)
            .strokeColor('#e8b4b0')
            .lineWidth(0.3)
            .stroke();
        }
        const color = row.color ?? (row.bold ? '#1e1e1e' : '#505050');
        doc
          .fontSize(row.bold ? 9 : 7)
          .fillColor(color)
          .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(row.label, summaryX + 6, ry);
        doc
          .fontSize(row.bold ? 9 : 7)
          .fillColor(color)
          .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(row.value, summaryX + 6, ry, {
            width: summaryW - 12,
            align: 'right',
          });
      });

      // ── Footer ────────────────────────────────────────────────────────
      const pageH = doc.page.height;
      const footerY = pageH - 50;
      doc
        .moveTo(margin, footerY)
        .lineTo(colRight, footerY)
        .strokeColor('#e8b4b0')
        .lineWidth(0.3)
        .stroke();
      doc
        .fontSize(8)
        .fillColor('#787878')
        .font('Helvetica-Oblique')
        .text(
          "Ce document annule et remplace partiellement la facture d'origine.",
          margin,
          footerY + 6,
          {
            align: 'center',
            width: pageW - margin * 2,
          },
        );
      if (company.taxNumber) {
        doc
          .fontSize(7)
          .fillColor('#787878')
          .font('Helvetica')
          .text(`MF : ${company.taxNumber}`, margin, footerY + 18, {
            align: 'center',
            width: pageW - margin * 2,
          });
      }
      doc
        .fontSize(6)
        .fillColor('#aaaaaa')
        .font('Helvetica')
        .text(
          `Document généré le ${fmtDate(new Date())}`,
          margin,
          footerY + 30,
          { align: 'center', width: pageW - margin * 2 },
        );

      doc.end();
    });
  }
}
