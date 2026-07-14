import Decimal from 'decimal.js';

export const DEFAULT_SALES_MARGIN_PERCENT = 40;
export const SALES_MONEY_DECIMALS = 3;

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const decimal = (value: unknown, fallback = 0) => {
  try {
    if (value === null || value === undefined || value === '') return new Decimal(fallback);
    const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
    const result = new Decimal(normalized as Decimal.Value);
    return result.isFinite() ? result : new Decimal(fallback);
  } catch {
    return new Decimal(fallback);
  }
};

export function salesRound3(value: Decimal.Value): number {
  return decimal(value).toDecimalPlaces(SALES_MONEY_DECIMALS, Decimal.ROUND_HALF_UP).toNumber();
}

export interface SalesLineCalculationInput {
  purchasePriceHt: number | string;
  /** Gross sale price before discount. When omitted it is derived from marginPercent. */
  grossSalePriceHt?: number | string | null;
  marginPercent?: number | string | null;
  discountPercent?: number | string | null;
  taxPercent?: number | string | null;
  quantity?: number | string | null;
}

export function calculateSalesLine(input: SalesLineCalculationInput) {
  const purchasePriceHt = Decimal.max(0, decimal(input.purchasePriceHt));
  const grossMarginPercent = decimal(input.marginPercent, DEFAULT_SALES_MARGIN_PERCENT);
  const discountPercent = Decimal.max(0, decimal(input.discountPercent));
  const taxPercent = Decimal.max(0, decimal(input.taxPercent));
  const quantity = Decimal.max(0, decimal(input.quantity));
  const grossSalePriceHt = input.grossSalePriceHt === null || input.grossSalePriceHt === undefined
    ? purchasePriceHt.mul(new Decimal(1).plus(grossMarginPercent.div(100)))
    : Decimal.max(0, decimal(input.grossSalePriceHt));
  const discountAmountUnitHt = grossSalePriceHt.mul(discountPercent).div(100);
  const netSalePriceHt = grossSalePriceHt.minus(discountAmountUnitHt);
  const lineNetHt = netSalePriceHt.mul(quantity);
  const purchaseCostHt = purchasePriceHt.mul(quantity);
  const marginAmountHt = lineNetHt.minus(purchaseCostHt);
  const marginPercentOnCost = purchaseCostHt.gt(0)
    ? marginAmountHt.div(purchaseCostHt).mul(100)
    : new Decimal(0);
  const vatAmount = lineNetHt.mul(taxPercent).div(100);
  const lineTtc = lineNetHt.plus(vatAmount);

  return {
    grossMarginPercent: grossMarginPercent.toNumber(),
    discountPercent: discountPercent.toNumber(),
    netMarginPercent: marginPercentOnCost.toNumber(),
    marginPercentOnCost: marginPercentOnCost.toNumber(),
    unitPriceHtBeforeDiscount: grossSalePriceHt.toNumber(),
    grossSalePriceHt: grossSalePriceHt.toNumber(),
    unitPriceHt: netSalePriceHt.toNumber(),
    netSalePriceHt: netSalePriceHt.toNumber(),
    unitPriceTtc: netSalePriceHt.plus(netSalePriceHt.mul(taxPercent).div(100)).toNumber(),
    discountAmount: discountAmountUnitHt.mul(quantity).toNumber(),
    discountAmountHt: discountAmountUnitHt.mul(quantity).toNumber(),
    marginAmount: quantity.gt(0) ? marginAmountHt.div(quantity).toNumber() : 0,
    marginAmountHt: marginAmountHt.toNumber(),
    purchaseCostHt: purchaseCostHt.toNumber(),
    totalHt: lineNetHt.toNumber(),
    lineNetHt: lineNetHt.toNumber(),
    taxAmount: vatAmount.toNumber(),
    vatAmount: vatAmount.toNumber(),
    totalTtc: lineTtc.toNumber(),
    lineTtc: lineTtc.toNumber(),
  };
}

export function calculateSalesTotals(
  lines: ReturnType<typeof calculateSalesLine>[],
  fiscalStamp: number | string = 0,
) {
  const totalHt = lines.reduce((sum, line) => sum.plus(line.lineNetHt), new Decimal(0));
  const totalVat = lines.reduce((sum, line) => sum.plus(line.vatAmount), new Decimal(0));
  const totalDiscountHt = lines.reduce((sum, line) => sum.plus(line.discountAmountHt), new Decimal(0));
  const totalPurchaseCostHt = lines.reduce((sum, line) => sum.plus(line.purchaseCostHt), new Decimal(0));
  const totalMarginHt = totalHt.minus(totalPurchaseCostHt);
  const stamp = Decimal.max(0, decimal(fiscalStamp));
  return {
    totalHt: salesRound3(totalHt),
    totalVat: salesRound3(totalVat),
    totalDiscountHt: salesRound3(totalDiscountHt),
    totalPurchaseCostHt: salesRound3(totalPurchaseCostHt),
    totalMarginHt: salesRound3(totalMarginHt),
    totalTtc: salesRound3(totalHt.plus(totalVat)),
    fiscalStamp: salesRound3(stamp),
    totalToPay: salesRound3(totalHt.plus(totalVat).plus(stamp)),
  };
}
