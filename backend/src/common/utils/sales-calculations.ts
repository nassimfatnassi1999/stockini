export const DEFAULT_SALES_MARGIN_PERCENT = 40;

export function salesRound3(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

export interface SalesLineCalculationInput {
  purchasePriceHt: number;
  marginPercent?: number | null;
  discountPercent?: number | null;
  taxPercent?: number | null;
  quantity?: number | null;
}

export function calculateSalesLine(input: SalesLineCalculationInput) {
  const purchasePriceHt = Math.max(0, Number(input.purchasePriceHt) || 0);
  const grossMarginPercent = input.marginPercent !== null && input.marginPercent !== undefined && Number.isFinite(Number(input.marginPercent))
    ? Number(input.marginPercent)
    : DEFAULT_SALES_MARGIN_PERCENT;
  const discountPercent = Math.max(0, Number(input.discountPercent) || 0);
  const taxPercent = Math.max(0, Number(input.taxPercent) || 0);
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const netMarginPercent = salesRound3(grossMarginPercent - discountPercent);
  const unitPriceHtBeforeDiscount = salesRound3(purchasePriceHt * (1 + grossMarginPercent / 100));
  const unitPriceHt = salesRound3(purchasePriceHt * (1 + netMarginPercent / 100));
  const unitPriceTtc = salesRound3(unitPriceHt * (1 + taxPercent / 100));
  const discountAmount = salesRound3((unitPriceHtBeforeDiscount - unitPriceHt) * quantity);
  const marginAmount = salesRound3(unitPriceHt - purchasePriceHt);
  const totalHt = salesRound3(unitPriceHt * quantity);
  const taxAmount = salesRound3(totalHt * taxPercent / 100);
  const totalTtc = salesRound3(totalHt + taxAmount);

  return { grossMarginPercent, discountPercent, netMarginPercent, unitPriceHtBeforeDiscount,
    unitPriceHt, unitPriceTtc, discountAmount, marginAmount, totalHt, taxAmount, totalTtc };
}
