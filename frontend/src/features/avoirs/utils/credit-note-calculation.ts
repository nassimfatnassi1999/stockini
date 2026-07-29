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
  refundStampDuty?: boolean;
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

export function roundCreditNoteMoney(value: Decimal.Value): number {
  return new Decimal(value)
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
    .toNumber();
}

export function calculateCreditNoteTotals(
  lines: CreditNoteCalculationLine[],
): CreditNoteTotals {
  const totalHtDecimal = lines.reduce(
    (sum, line) => sum.plus(new Decimal(line.unitPriceHt).mul(line.quantity)),
    new Decimal(0),
  );
  const totalTvaDecimal = lines.reduce(
    (sum, line) =>
      sum.plus(
        new Decimal(line.unitPriceHt)
          .mul(line.quantity)
          .mul(line.tvaRate)
          .div(100),
      ),
    new Decimal(0),
  );
  const totalHt = roundCreditNoteMoney(totalHtDecimal);
  const totalTva = roundCreditNoteMoney(totalTvaDecimal);

  return {
    totalHt,
    totalTva,
    totalTtc: roundCreditNoteMoney(new Decimal(totalHt).plus(totalTva)),
  };
}
import Decimal from "decimal.js";
