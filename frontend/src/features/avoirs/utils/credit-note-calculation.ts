export type RefundMethod =
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "CHECK"
  | "CUSTOMER_CREDIT"
  | "NONE";

export interface CreditNoteLineInput {
  productId: string;
  saleItemId?: string;
  quantiteRetournee: number;
  motifLigne?: string;
}

export interface CreditNotePayload {
  saleId: string;
  customerId?: string;
  motif?: string;
  refundMethod: RefundMethod;
  items: CreditNoteLineInput[];
}

export interface CreditNoteCalculationLine {
  quantity: number;
  unitPriceHt: number;
  tvaRate: number;
}

export interface CreditNoteTotals {
  totalHt: number;
  totalTva: number;
  totalTtc: number;
}

const MONEY_SCALE = 1000;

export function roundCreditNoteMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

export function calculateCreditNoteTotals(
  lines: CreditNoteCalculationLine[],
): CreditNoteTotals {
  const totalHt = roundCreditNoteMoney(
    lines.reduce((sum, line) => sum + line.quantity * line.unitPriceHt, 0),
  );
  const totalTva = roundCreditNoteMoney(
    lines.reduce(
      (sum, line) =>
        sum + line.quantity * line.unitPriceHt * (line.tvaRate / 100),
      0,
    ),
  );

  return {
    totalHt,
    totalTva,
    totalTtc: roundCreditNoteMoney(totalHt + totalTva),
  };
}
