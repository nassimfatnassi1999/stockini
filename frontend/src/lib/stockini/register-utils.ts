export const MIN_MARGIN_PERCENT = 20;
export const DEFAULT_MARGIN_PERCENT = 40;

export interface RegisterLine {
  id: string;
  productId: string | null;
  reference: string;
  designation: string;
  location: string;
  brand: string;
  quantity: number;
  puHt: number;
  purchasePriceHt: number;
  remisePercent: number;
  tvaPercent: number;
  netHt: number;
  netTtc: number;
  margePercent: number | null;
  margeAmount: number | null;
}

/** PU HT using the default 40% markup on purchase cost */
export function calcDefaultSellingPriceHt(purchasePriceHt: number): number {
  return round3(purchasePriceHt * (1 + DEFAULT_MARGIN_PERCENT / 100));
}

/** Effective unit price after applying a per-line discount */
export function calcNetUnitPriceHt(puHt: number, discountPercent: number): number {
  return round3(puHt * (1 - discountPercent / 100));
}

/** Profit amount per unit after discount, null when purchasePriceHt is 0 */
export function calcMargeAmount(
  puHt: number,
  discountPercent: number,
  purchasePriceHt: number,
): number | null {
  if (purchasePriceHt <= 0) return null;
  return round3(calcNetUnitPriceHt(puHt, discountPercent) - purchasePriceHt);
}

/** Profit % based on net price after discount, null when purchasePriceHt is 0 */
export function calcMargePercent(
  puHt: number,
  discountPercent: number,
  purchasePriceHt: number,
): number | null {
  if (purchasePriceHt <= 0) return null;
  const net = calcNetUnitPriceHt(puHt, discountPercent);
  return Math.round(((net - purchasePriceHt) / purchasePriceHt) * 10000) / 100;
}

export interface DocumentTotals {
  totalHt: number;
  totalRemise: number;
  totalTva: number;
  totalTtc: number;
}

export type DocumentType = 'DEVIS' | 'BON_COMMANDE' | 'BON_LIVRAISON' | 'FACTURE';

export function createEmptyLine(): RegisterLine {
  return {
    id: crypto.randomUUID(),
    productId: null,
    reference: '',
    designation: '',
    location: '',
    brand: '',
    quantity: 1,
    puHt: 0,
    purchasePriceHt: 0,
    remisePercent: 0,
    tvaPercent: 19,
    netHt: 0,
    netTtc: 0,
    margePercent: null,
    margeAmount: null,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function recalculateLine(line: RegisterLine): RegisterLine {
  const grossHt = round3(line.quantity * line.puHt);
  const remiseAmount = round3(grossHt * line.remisePercent / 100);
  const netHt = round3(grossHt - remiseAmount);
  const netTtc = round3(netHt * (1 + line.tvaPercent / 100));
  const margePercent = calcMargePercent(line.puHt, line.remisePercent, line.purchasePriceHt);
  const margeAmount = calcMargeAmount(line.puHt, line.remisePercent, line.purchasePriceHt);
  return { ...line, netHt, netTtc, margePercent, margeAmount };
}

export function isFilledLine(line: RegisterLine): boolean {
  return (
    line.productId !== null ||
    line.reference.trim() !== '' ||
    line.designation.trim() !== ''
  );
}

export function calculateDocumentTotals(lines: RegisterLine[]): DocumentTotals {
  const filled = lines.filter(isFilledLine);
  const totalGrossHt = round3(filled.reduce((s, l) => s + round3(l.quantity * l.puHt), 0));
  const totalHt = round3(filled.reduce((s, l) => s + l.netHt, 0));
  const totalRemise = round3(totalGrossHt - totalHt);
  const totalTva = round3(filled.reduce((s, l) => s + round3(l.netHt * l.tvaPercent / 100), 0));
  const totalTtc = round3(totalHt + totalTva);
  return { totalHt, totalRemise, totalTva, totalTtc };
}

const DOC_LABELS: Record<DocumentType, string> = {
  DEVIS: 'Devis',
  BON_COMMANDE: 'Bon de Commande',
  BON_LIVRAISON: 'Bon de Livraison',
  FACTURE: 'Facture',
};

export function generatePlaceholderPdf(type: DocumentType, docNumber?: string) {
  const label = DOC_LABELS[type];
  const date = new Date().toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${label}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 60px; color: #333; }
    h1 { font-size: 28px; text-align: center; letter-spacing: 0.05em; margin-bottom: 8px; }
    .sub { text-align: center; color: #666; font-size: 14px; margin-bottom: 40px; }
    .notice { margin-top: 60px; text-align: center; color: #999; font-style: italic;
              font-size: 13px; border: 1px dashed #ccc; padding: 20px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${label.toUpperCase()}</h1>
  <p class="sub">
    Date : ${date}${docNumber ? ` &nbsp;&bull;&nbsp; Référence : ${docNumber}` : ''}
  </p>
  <div class="notice">Template PDF à configurer</div>
</body>
</html>`;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}
