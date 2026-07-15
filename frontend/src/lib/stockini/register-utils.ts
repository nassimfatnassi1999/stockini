import { generateClientId } from '@/lib/id';
import {
  calculateSalesLine,
  calculateSalesTotals,
  DEFAULT_SALES_MARGIN_PERCENT,
  salesRound3,
} from '@/lib/salesCalculations';
import { calculatePurchaseLine, calculatePurchaseTotals } from '@/lib/purchaseCalculations';

export const MIN_MARGIN_PERCENT = 20;
export const DEFAULT_MARGIN_PERCENT = DEFAULT_SALES_MARGIN_PERCENT;

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
  /** Base margin % before discount (stored per-line, independent of other lines) */
  defaultMarginPercent: number;
  remisePercent: number;
  tvaPercent: number;
  netHt: number;
  netTtc: number;
  margePercent: number | null;
  margeAmount: number | null;
  /** true = user explicitly set puHt; recalculateSaleLine must not overwrite it */
  manualUnitPriceHt: boolean;
}

/** PU HT using the default 40% markup on purchase cost */
export function calcDefaultSellingPriceHt(purchasePriceHt: number): number {
  return round3(purchasePriceHt * (1 + DEFAULT_MARGIN_PERCENT / 100));
}

/** Prix net Stockini : la remise retire des points au taux de marge. */
export function calcNetUnitPriceHt(
  puHt: number,
  discountPercent: number,
  purchasePriceHt = 0,
): number {
  const grossMarginAmount = puHt - purchasePriceHt;
  const grossMarginPercent = purchasePriceHt > 0
    ? (grossMarginAmount / purchasePriceHt) * 100
    : DEFAULT_MARGIN_PERCENT;
  const netMarginPercent = grossMarginPercent - discountPercent;
  const netMarginAmount = grossMarginPercent === 0
    ? purchasePriceHt * (netMarginPercent / 100)
    : grossMarginAmount * (netMarginPercent / grossMarginPercent);
  return round3(purchasePriceHt + netMarginAmount);
}

/** Profit amount per unit after discount, null when purchasePriceHt is 0 */
export function calcMargeAmount(
  puHt: number,
  discountPercent: number,
  purchasePriceHt: number,
): number | null {
  if (purchasePriceHt <= 0) return null;
  return round3(calcNetUnitPriceHt(puHt, discountPercent, purchasePriceHt) - purchasePriceHt);
}

/** Profit % based on net price after discount, null when purchasePriceHt is 0 */
export function calcMargePercent(
  puHt: number,
  discountPercent: number,
  purchasePriceHt: number,
): number | null {
  if (purchasePriceHt <= 0) return null;
  const net = calcNetUnitPriceHt(puHt, discountPercent, purchasePriceHt);
  return Math.round(((net - purchasePriceHt) / purchasePriceHt) * 10000) / 100;
}

export interface DocumentTotals {
  totalHt: number;
  totalRemise: number;
  totalTva: number;
  totalTtc: number;
  stampDuty: number;
  totalFinal: number;
}

export const DEFAULT_STAMP_DUTY = 1;

export interface SaleMargeTotals {
  margeTotaleDt: number;
  margeTotalePourcent: number;
}

export type DocumentType = 'DEVIS' | 'BON_COMMANDE' | 'BON_LIVRAISON' | 'FACTURE';

export function createEmptyLine(id: string = generateClientId()): RegisterLine {
  return {
    id,
    productId: null,
    reference: '',
    designation: '',
    location: '',
    brand: '',
    quantity: 1,
    puHt: 0,
    purchasePriceHt: 0,
    defaultMarginPercent: DEFAULT_MARGIN_PERCENT,
    remisePercent: 0,
    tvaPercent: 19,
    netHt: 0,
    netTtc: 0,
    margePercent: null,
    margeAmount: null,
    manualUnitPriceHt: false,
  };
}

function round3(value: number): number {
  return salesRound3(value);
}

/** For purchases: remise reduces the purchase price directly */
export function recalculateLine(line: RegisterLine): RegisterLine {
  const result = calculatePurchaseLine({ quantity: line.quantity, unitCost: line.puHt, discountPercent: line.remisePercent, tvaPercent: line.tvaPercent });
  const netHt = result.netHt;
  const netTtc = result.totalTtc;
  const margePercent = calcMargePercent(line.puHt, line.remisePercent, line.purchasePriceHt);
  const margeAmount = calcMargeAmount(line.puHt, line.remisePercent, line.purchasePriceHt);
  return { ...line, netHt, netTtc, margePercent, margeAmount };
}

/**
 * For sales (auto mode): puHt = purchasePriceHt × (1 + defaultMarginPercent / 100) — always
 * the GROSS unit price (no discount baked in). Remise removes points from the gross margin
 * so the payload sent to the backend is unambiguous: unitPrice = gross, discountPercent = remise.
 *
 * When manualUnitPriceHt is true, puHt is frozen (user-set) and only the
 * derived fields (margePercent, margeAmount, netHt, netTtc) are recalculated.
 */
export function recalculateSaleLine(line: RegisterLine): RegisterLine {
  if (line.purchasePriceHt > 0) {
    const result = calculateSalesLine({
      purchasePriceHt: line.purchasePriceHt,
      ...(line.manualUnitPriceHt && { grossSalePriceHt: line.puHt }),
      marginPercent: line.defaultMarginPercent,
      discountPercent: line.remisePercent,
      taxPercent: line.tvaPercent,
      quantity: line.quantity,
    });
    return {
      ...line,
      puHt: result.grossSalePriceHt,
      margePercent: result.netMarginPercent,
      margeAmount: result.marginAmount,
      netHt: result.totalHt,
      netTtc: result.totalTtc,
    };
  }

  // Devis sans coût connu : conserver le brut saisi et appliquer la réduction de marge.
  const result = calculateSalesLine({
    purchasePriceHt: 0,
    grossSalePriceHt: line.puHt,
    discountPercent: line.remisePercent,
    taxPercent: line.tvaPercent,
    quantity: line.quantity,
  });
  return { ...line, margePercent: null, margeAmount: null, netHt: result.totalHt, netTtc: result.totalTtc };
}

export function calculateSalesDocumentTotals(lines: RegisterLine[]): DocumentTotals {
  const filled = lines.filter(isFilledLine);
  const calculations = filled.map((line) => calculateSalesLine({
    purchasePriceHt: line.purchasePriceHt,
    grossSalePriceHt: line.puHt,
    marginPercent: line.defaultMarginPercent,
    discountPercent: line.remisePercent,
    taxPercent: line.tvaPercent,
    quantity: line.quantity,
  }));
  const totals = calculateSalesTotals(calculations, DEFAULT_STAMP_DUTY);
  return {
    totalHt: totals.totalHt,
    totalRemise: totals.totalDiscountHt,
    totalTva: totals.totalVat,
    totalTtc: totals.totalTtc,
    stampDuty: totals.fiscalStamp,
    totalFinal: totals.totalToPay,
  };
}

export function isFilledLine(line: RegisterLine): boolean {
  return (
    line.productId !== null ||
    line.reference.trim() !== '' ||
    line.designation.trim() !== ''
  );
}

export function calculateDocumentTotals(lines: RegisterLine[], stampDuty = DEFAULT_STAMP_DUTY): DocumentTotals {
  const filled = lines.filter(isFilledLine);
  const totals = calculatePurchaseTotals(filled.map((line) => calculatePurchaseLine({
    quantity: line.quantity, unitCost: line.puHt, discountPercent: line.remisePercent, tvaPercent: line.tvaPercent,
  })), stampDuty);
  return { totalHt: totals.subtotal, totalRemise: totals.discount, totalTva: totals.tax,
    totalTtc: totals.total, stampDuty: totals.stampDuty, totalFinal: totals.totalFinal };
}

/**
 * margeTotaleDt  = Σ (margeAmount × quantité)
 * margeTotalePourcent = margeTotaleDt / Σ (purchasePriceHt × quantité) × 100
 */
export function calculateSaleMargeTotals(lines: RegisterLine[]): SaleMargeTotals {
  const filled = lines.filter(isFilledLine);
  const margeTotaleDt = round3(
    filled.reduce((s, l) => s + (l.margeAmount !== null ? round3(l.margeAmount * l.quantity) : 0), 0),
  );
  const totalPrixAchat = round3(
    filled.reduce((s, l) => s + round3(l.purchasePriceHt * l.quantity), 0),
  );
  const margeTotalePourcent =
    totalPrixAchat > 0 ? Math.round((margeTotaleDt / totalPrixAchat) * 10000) / 100 : 0;
  return { margeTotaleDt, margeTotalePourcent };
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
