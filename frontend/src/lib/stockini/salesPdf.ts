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

export function generateSalesPDF(
  sale: SaleDetail,
  documentType: SalesDocumentType,
  company: CompanyInfo = {},
): void {
  const config = DOC_CONFIG[documentType];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 80, 160);
  doc.text(config.title, margin, y + 8);

  // Company info (right side)
  const companyName = company.name ?? 'Stockini';
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text(companyName, pageW - margin, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const companyLines: string[] = [];
  if (company.address) companyLines.push(company.address);
  if (company.phone) companyLines.push(`Tél : ${company.phone}`);
  if (company.email) companyLines.push(company.email);
  if (company.taxNumber) companyLines.push(`MF : ${company.taxNumber}`);
  companyLines.forEach((line, i) => {
    doc.text(line, pageW - margin, y + (i + 1) * 4.5, { align: 'right' });
  });

  y += Math.max(12, companyLines.length * 4.5 + 4);

  // Separator line
  doc.setDrawColor(200, 210, 230);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // ── Document info ─────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);

  const docRef = sale.invoiceNumber;
  const docDate = fmtDate(sale.createdAt);
  const clientName = sale.customer?.name ?? 'Client comptoir';
  const clientAddr = sale.customer?.address ?? '';
  const clientPhone = sale.customer?.phone ?? '';

  // Left: document details
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(`${config.title} N° ${docRef}`, margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Date : ${docDate}`, margin, y);
  y += 5;

  // Right: client info box
  const boxX = pageW / 2 + 5;
  const boxW = pageW / 2 - margin - 5;
  const boxY = y - 10;
  doc.setDrawColor(200, 210, 230);
  doc.setFillColor(245, 247, 252);
  doc.roundedRect(boxX, boxY, boxW, 22, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80, 100, 160);
  doc.text('CLIENT', boxX + 3, boxY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(clientName, boxX + 3, boxY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  let clientY = boxY + 15;
  if (clientAddr) {
    doc.text(clientAddr, boxX + 3, clientY);
    clientY += 4.5;
  }
  if (clientPhone) doc.text(`Tél : ${clientPhone}`, boxX + 3, clientY);

  y += 16;

  // ── Items table ───────────────────────────────────────────────────────────
  const tableHead = [
    ['Réf', 'Désignation', 'Qté', 'PU HT', 'Total HT', 'TVA', 'Total TTC'],
  ];

  const tableBody = sale.items.map((item) => {
    const unitPrice = Number(item.unitPrice);
    const qty = item.quantity;
    const totalHt = Number(item.total);
    const tvaRate = 19;
    const totalTtc = totalHt * (1 + tvaRate / 100);
    return [
      item.product?.reference ?? '—',
      item.product?.name ?? '—',
      String(qty),
      fmt3(unitPrice),
      fmt3(totalHt),
      `${tvaRate} %`,
      fmt3(totalTtc),
    ];
  });

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: y,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [40, 40, 40] },
    headStyles: {
      fillColor: [30, 80, 160],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [247, 249, 255] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 12, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 24, halign: 'right' },
    },
    didDrawPage: () => {},
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Totals summary ────────────────────────────────────────────────────────
  const summaryX = pageW - margin - 70;
  const summaryW = 70;

  const subtotal = Number(sale.subtotal);
  const taxAmount = Number(sale.tax);
  const discountAmount = Number(sale.discount);
  const total = Number(sale.total);

  doc.setFillColor(245, 247, 252);
  doc.setDrawColor(200, 210, 230);

  const rows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'Total HT', value: `${fmt3(subtotal)} DT` },
  ];
  if (discountAmount > 0) {
    rows.push({ label: 'Remise', value: `- ${fmt3(discountAmount)} DT` });
  }
  rows.push({ label: 'Total TVA (19%)', value: `${fmt3(taxAmount)} DT` });
  rows.push({ label: 'Total TTC', value: `${fmt3(total)} DT`, bold: true });

  const rowH = 6;
  const boxH = rows.length * rowH + 6;
  doc.roundedRect(summaryX, y, summaryW, boxH, 2, 2, 'FD');

  rows.forEach((row, i) => {
    const ry = y + 4 + i * rowH;
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 9 : 8);
    doc.setTextColor(row.bold ? 30 : 80, row.bold ? 30 : 80, row.bold ? 30 : 80);
    doc.text(row.label, summaryX + 3, ry);
    doc.text(row.value, summaryX + summaryW - 3, ry, { align: 'right' });
    if (row.bold) {
      doc.setDrawColor(180, 200, 230);
      doc.setLineWidth(0.3);
      doc.line(summaryX + 2, ry - 3.5, summaryX + summaryW - 2, ry - 3.5);
    }
  });

  y += boxH + 12;

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  const footerY = pageH - 20;

  doc.setDrawColor(200, 210, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageW - margin, footerY);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Merci pour votre confiance.', pageW / 2, footerY + 5, { align: 'center' });
  if (company.taxNumber) {
    doc.text(`MF : ${company.taxNumber}`, pageW / 2, footerY + 10, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Document généré le ${fmtDate(new Date().toISOString())}`, pageW / 2, footerY + 15, {
    align: 'center',
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  const fileName = `${config.filePrefix}-${sale.invoiceNumber}.pdf`;
  doc.save(fileName);
}
