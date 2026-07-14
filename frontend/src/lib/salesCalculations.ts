export const DEFAULT_SALES_MARGIN_PERCENT = 40;

export function salesRound3(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

export function toSalesNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = typeof value === 'string'
    ? Number(value.trim().replace(',', '.'))
    : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface SalesLineCalculationInput {
  purchasePriceHt: number;
  marginPercent?: number | null;
  discountPercent?: number | null;
  taxPercent?: number | null;
  quantity?: number | null;
}

export interface SalesLineCalculation {
  grossMarginPercent: number;
  discountPercent: number;
  netMarginPercent: number;
  unitPriceHtBeforeDiscount: number;
  unitPriceHt: number;
  unitPriceTtc: number;
  discountAmount: number;
  marginAmount: number;
  totalHt: number;
  taxAmount: number;
  totalTtc: number;
}

export function calculateSalesLine(input: SalesLineCalculationInput): SalesLineCalculation {
  const purchasePriceHt = Math.max(0, toSalesNumber(input.purchasePriceHt));
  const grossMarginPercent = toSalesNumber(input.marginPercent, DEFAULT_SALES_MARGIN_PERCENT);
  const discountPercent = Math.max(0, toSalesNumber(input.discountPercent));
  const taxPercent = Math.max(0, toSalesNumber(input.taxPercent));
  const quantity = Math.max(0, toSalesNumber(input.quantity));
  const netMarginPercent = salesRound3(grossMarginPercent - discountPercent);
  const unitPriceHtBeforeDiscount = salesRound3(
    purchasePriceHt * (1 + grossMarginPercent / 100),
  );
  const unitPriceHt = salesRound3(purchasePriceHt * (1 + netMarginPercent / 100));
  const unitPriceTtc = salesRound3(unitPriceHt * (1 + taxPercent / 100));
  const discountAmount = salesRound3(
    (unitPriceHtBeforeDiscount - unitPriceHt) * quantity,
  );
  const marginAmount = salesRound3(unitPriceHt - purchasePriceHt);
  const totalHt = salesRound3(unitPriceHt * quantity);
  const taxAmount = salesRound3(totalHt * taxPercent / 100);
  const totalTtc = salesRound3(totalHt + taxAmount);

  return {
    grossMarginPercent,
    discountPercent,
    netMarginPercent,
    unitPriceHtBeforeDiscount,
    unitPriceHt,
    unitPriceTtc,
    discountAmount,
    marginAmount,
    totalHt,
    taxAmount,
    totalTtc,
  };
}
