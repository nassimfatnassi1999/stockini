import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SaleDetail } from './types';

export type SalesDocumentType = 'devis' | 'bon_commande' | 'bon_livraison' | 'facture';

const DOC_CONFIG: Record<SalesDocumentType, { title: string; filePrefix: string }> = {
  devis: { title: 'DEVIS', filePrefix: 'DEVIS' },
  bon_commande: { title: 'BON DE COMMANDE', filePrefix: 'BON-COMMANDE' },
  bon_livraison: { title: 'BON DE LIVRAISON', filePrefix: 'BON-LIVRAISON' },
  facture: { title: 'FACTURE', filePrefix: 'FACTURE' },
};

interface CompanyInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
}

const DEFAULT_COMPANY = 'Moumna spare part';

// ── Layout constants (mm, A4 = 210 × 297 mm) ─────────────────────────────────
const MARGIN = 14;
const FOOTER_H = 28; // mm reserved at bottom for footer + cachet
// Content must not exceed PAGE_H - FOOTER_H - MARGIN from the top.
// jsPDF doesn't auto-add pages for absolute-positioned content, so this is
// used only to ensure footer items don't overlap with table content.

function fmt3(v: number | string): string {
  return Number(v).toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Draw the footer + cachet on a specific page. */
function drawFooter(
  doc: jsPDF,
  company: CompanyInfo,
  pageNum: number,
  totalPages: number,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const footerY = pageH - FOOTER_H;
  const companyName = company.name ?? DEFAULT_COMPANY;

  // Separator
  doc.setDrawColor(200, 210, 230);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, footerY, pageW - MARGIN, footerY);

  // Left: text block
  const textW = (pageW - MARGIN * 2) * 0.62;
  let ty = footerY + 5;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Merci pour votre confiance.', MARGIN, ty);
  ty += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(50, 50, 50);
  doc.text(companyName, MARGIN, ty);
  ty += 4;

  const infoLine = [company.address, company.phone, company.email]
    .filter(Boolean)
    .join('  |  ');
  if (infoLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    // Wrap long info lines within textW
    const lines = doc.splitTextToSize(infoLine, textW);
    doc.text(lines, MARGIN, ty);
    ty += lines.length * 3.5;
  }

  if (company.taxNumber) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`MF : ${company.taxNumber}`, MARGIN, ty);
    ty += 3.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(170, 170, 170);
  doc.text(
    `Page ${pageNum} / ${totalPages}  —  Document généré le ${fmtDate(new Date().toISOString())}`,
    MARGIN,
    ty,
  );

  // Right: Cachet box
  const cachetW = 52;
  const cachetH = FOOTER_H - 6;
  const cachetX = pageW - MARGIN - cachetW;
  const cachetY = footerY + 3;

  doc.setDrawColor(200, 210, 230);
  doc.setLineWidth(0.4);
  doc.roundedRect(cachetX, cachetY, cachetW, cachetH, 1, 1);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Cachet et signature', cachetX + cachetW / 2, cachetY + 5, {
    align: 'center',
  });
}

export function generateSalesPDF(
  sale: SaleDetail,
  documentType: SalesDocumentType,
  company: CompanyInfo = {},
): void {
  const config = DOC_CONFIG[documentType];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  // ── Header ────────────────────────────────────────────────────────────────────
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 80, 160);
  doc.text(config.title, MARGIN, y + 7);

  const companyName = company.name ?? DEFAULT_COMPANY;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text(companyName, pageW - MARGIN, y, { align: 'right' });

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  const companyLines: string[] = [];
  if (company.address) companyLines.push(company.address);
  if (company.phone) companyLines.push(`Tél : ${company.phone}`);
  if (company.email) companyLines.push(company.email);
  if (company.taxNumber) companyLines.push(`MF : ${company.taxNumber}`);
  companyLines.forEach((line, i) => {
    doc.text(line, pageW - MARGIN, y + (i + 1) * 4, { align: 'right' });
  });

  y += Math.max(10, companyLines.length * 4 + 3);

  // Separator
  doc.setDrawColor(200, 210, 230);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 5;

  // ── Document info ─────────────────────────────────────────────────────────────
  const docRef = sale.invoiceNumber;
  const docDate = fmtDate(sale.createdAt);
  const clientName = sale.customer?.name ?? 'Client comptoir';
  const clientAddr = sale.customer?.address ?? '';
  const clientPhone = sale.customer?.phone ?? '';
  const clientEmail = sale.customer?.email ?? '';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(`${config.title} N° ${docRef}`, MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`Date : ${docDate}`, MARGIN, y);
  y += 4;

  // Client box (right side)
  const boxX = pageW / 2 + 5;
  const boxW = pageW / 2 - MARGIN - 5;
  const boxY = y - 9;

  let clientBoxH = 20;
  if (clientAddr) clientBoxH += 4.5;
  if (clientPhone) clientBoxH += 4.5;
  if (clientEmail) clientBoxH += 4.5;

  doc.setDrawColor(200, 210, 230);
  doc.setFillColor(245, 247, 252);
  doc.roundedRect(boxX, boxY, boxW, clientBoxH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(80, 100, 160);
  doc.text('CLIENT', boxX + 3, boxY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(clientName, boxX + 3, boxY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  let clientY = boxY + 16;
  if (clientAddr) {
    doc.text(clientAddr, boxX + 3, clientY);
    clientY += 4.5;
  }
  if (clientPhone) {
    doc.text(`Tél : ${clientPhone}`, boxX + 3, clientY);
    clientY += 4.5;
  }
  if (clientEmail) {
    doc.text(clientEmail, boxX + 3, clientY);
  }

  y = Math.max(y + 8, boxY + clientBoxH + 6);

  // ── Items table ───────────────────────────────────────────────────────────────
  const tableHead = [
    ['Réf', 'Désignation', 'Qté', 'PU HT', 'Total HT', 'TVA', 'Total TTC'],
  ];

  const tableBody = sale.items.map((item) => {
    const unitPrice = Number(item.unitPrice);
    const totalHt = Number(item.total);
    const tvaRate = 19;
    const totalTtc = totalHt * (1 + tvaRate / 100);
    return [
      item.product?.reference ?? '—',
      item.product?.name ?? '—',
      String(item.quantity),
      fmt3(unitPrice),
      fmt3(totalHt),
      `${tvaRate} %`,
      fmt3(totalTtc),
    ];
  });

  // Keep space for footer on every page via margin bottom
  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_H + 2 },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [40, 40, 40] },
    headStyles: {
      fillColor: [30, 80, 160],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [247, 249, 255] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 11, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 13, halign: 'center' },
      6: { cellWidth: 24, halign: 'right' },
    },
    showHead: 'everyPage',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Totals summary ────────────────────────────────────────────────────────────
  const subtotal = Number(sale.subtotal);
  const taxAmount = Number(sale.tax);
  const discountAmount = Number(sale.discount);
  const total = Number(sale.total);

  const summaryRows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'Total HT', value: `${fmt3(subtotal)} DT` },
  ];
  if (discountAmount > 0) {
    summaryRows.push({ label: 'Remise', value: `- ${fmt3(discountAmount)} DT` });
  }
  summaryRows.push({ label: 'Total TVA (19%)', value: `${fmt3(taxAmount)} DT` });
  summaryRows.push({ label: 'Total TTC', value: `${fmt3(total)} DT`, bold: true });

  const summaryW = 68;
  const summaryX = pageW - MARGIN - summaryW;
  const rowH = 6;
  const summaryBoxH = summaryRows.length * rowH + 6;

  // If summary doesn't fit before footer area, push to next page
  const currentPageH = doc.internal.pageSize.getHeight();
  if (y + summaryBoxH > currentPageH - FOOTER_H - 4) {
    doc.addPage();
    y = MARGIN + 4;
  }

  doc.setFillColor(245, 247, 252);
  doc.setDrawColor(200, 210, 230);
  doc.roundedRect(summaryX, y, summaryW, summaryBoxH, 1.5, 1.5, 'FD');

  summaryRows.forEach((row, i) => {
    const ry = y + 4 + i * rowH;
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 9 : 8);
    doc.setTextColor(row.bold ? 30 : 80, row.bold ? 30 : 80, row.bold ? 30 : 80);
    if (row.bold) {
      doc.setDrawColor(180, 200, 230);
      doc.setLineWidth(0.25);
      doc.line(summaryX + 2, ry - 3, summaryX + summaryW - 2, ry - 3);
    }
    doc.text(row.label, summaryX + 3, ry);
    doc.text(row.value, summaryX + summaryW - 3, ry, { align: 'right' });
  });

  // ── Footer on every page ──────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, company, p, totalPages);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  const fileName = `${config.filePrefix}-${sale.invoiceNumber}.pdf`;
  doc.save(fileName);
}
