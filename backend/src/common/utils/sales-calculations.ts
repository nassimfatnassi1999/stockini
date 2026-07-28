import Decimal from 'decimal.js';

export const DEFAULT_SALES_MARGIN_PERCENT = 40;
export const SALES_CALCULATION_VERSION = 4;
export const SALES_SNAPSHOT_VERSION = 2;
export const SALES_MONEY_DECIMALS = 3;

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

function decimal(value: unknown, fallback = 0): Decimal {
  try {
    if (value === null || value === undefined || value === '')
      return new Decimal(fallback);
    const normalized =
      typeof value === 'string' ? value.trim().replace(',', '.') : value;
    const parsed = new Decimal(normalized as Decimal.Value);
    return parsed.isFinite() ? parsed : new Decimal(fallback);
  } catch {
    return new Decimal(fallback);
  }
}

export function salesRound3(value: Decimal.Value): number {
  return decimal(value)
    .toDecimalPlaces(SALES_MONEY_DECIMALS, Decimal.ROUND_HALF_UP)
    .toNumber();
}
export const roundMoney = salesRound3;
export const convertHtToTtc = (ht: Decimal.Value, vatPercent: Decimal.Value) =>
  salesRound3(decimal(ht).mul(decimal(1).plus(decimal(vatPercent).div(100))));
export const convertTtcToHt = (ttc: Decimal.Value, vatPercent: Decimal.Value) =>
  salesRound3(decimal(ttc).div(decimal(1).plus(decimal(vatPercent).div(100))));
export const calculateDiscountedPrice = (gross: Decimal.Value, discountPercent: Decimal.Value) =>
  salesRound3(decimal(gross).mul(decimal(1).minus(decimal(discountPercent).div(100))));
export function calculateSalePriceFromPurchaseTtc(input: {
  purchaseTtc: Decimal.Value;
  markupPercent: Decimal.Value;
  discountPercent: Decimal.Value;
  vatPercent: Decimal.Value;
}) {
  const saleTtcGross = salesRound3(decimal(input.purchaseTtc).mul(decimal(1).plus(decimal(input.markupPercent).div(100))));
  const saleTtcNet = calculateDiscountedPrice(saleTtcGross, input.discountPercent);
  return {
    saleTtcGross,
    saleHtGross: convertTtcToHt(saleTtcGross, input.vatPercent),
    discountAmountTtc: salesRound3(decimal(saleTtcGross).minus(saleTtcNet)),
    saleTtcNet,
    saleHtNet: convertTtcToHt(saleTtcNet, input.vatPercent),
  };
}

export const calculateSaleNetUnitPrice = (gross: Decimal.Value, discountPercent: Decimal.Value) =>
  salesRound3(decimal(gross).mul(decimal(1).minus(decimal(discountPercent).div(100))));
export const calculateMarginAmount = (saleNet: Decimal.Value, purchaseNet: Decimal.Value) =>
  salesRound3(decimal(saleNet).minus(decimal(purchaseNet)));
export const calculateMarginOnCostPercent = (margin: Decimal.Value, purchaseNet: Decimal.Value) =>
  decimal(purchaseNet).gt(0) ? salesRound3(decimal(margin).div(decimal(purchaseNet)).mul(100)) : 0;
export const calculateMarkupPercent = (margin: Decimal.Value, saleNet: Decimal.Value) =>
  decimal(saleNet).gt(0) ? salesRound3(decimal(margin).div(decimal(saleNet)).mul(100)) : 0;

export interface SalesLineCalculationInput {
  purchasePriceHt: number | string;
  /** Coût TTC net explicite. Prioritaire pour la tarification automatique TTC. */
  purchasePriceTtc?: number | string | null;
  /** Prix de vente brut HT avant remise. Dérivé de la marge lorsqu'il est absent. */
  grossSalePriceHt?: number | string | null;
  marginPercent?: number | string | null;
  discountPercent?: number | string | null;
  taxPercent?: number | string | null;
  quantity?: number | string | null;
}

export function calculateSalesLine(input: SalesLineCalculationInput) {
  const purchasePriceHt = Decimal.max(0, decimal(input.purchasePriceHt));
  const purchasePriceTtc = Decimal.max(0, decimal(input.purchasePriceTtc));
  const grossMarginPercent = decimal(
    input.marginPercent,
    DEFAULT_SALES_MARGIN_PERCENT,
  );
  const discountPercent = Decimal.min(
    100,
    Decimal.max(0, decimal(input.discountPercent)),
  );
  const taxPercent = Decimal.max(0, decimal(input.taxPercent));
  const quantity = Decimal.max(0, decimal(input.quantity));
  const vatFactor = new Decimal(1).plus(taxPercent.div(100));
  const hasExplicitGross = input.grossSalePriceHt !== null && input.grossSalePriceHt !== undefined;
  const explicitGrossHt = Decimal.max(0, decimal(input.grossSalePriceHt));
  const autoGrossTtc = purchasePriceTtc.gt(0)
    ? decimal(salesRound3(purchasePriceTtc.mul(new Decimal(1).plus(grossMarginPercent.div(100)))))
    : null;
  const grossSalePriceHt = hasExplicitGross
    ? explicitGrossHt
    : autoGrossTtc
      ? autoGrossTtc.div(vatFactor)
      : purchasePriceHt.mul(new Decimal(1).plus(grossMarginPercent.div(100)));

  // A commercial discount is applied to the catalogue selling price.  It must
  // never be subtracted from the margin percentage: 40% margin and 20%
  // discount is not a 20% margin.
  const roundedGrossUnit = decimal(salesRound3(grossSalePriceHt));
  const grossSalePriceTtc = autoGrossTtc && !hasExplicitGross
    ? autoGrossTtc
    : decimal(salesRound3(roundedGrossUnit.mul(vatFactor)));
  const unitDiscountTtc = decimal(salesRound3(grossSalePriceTtc.mul(discountPercent).div(100)));
  const netSalePriceTtc = decimal(salesRound3(grossSalePriceTtc.minus(unitDiscountTtc)));
  const netSalePriceHt = decimal(salesRound3(netSalePriceTtc.div(vatFactor)));
  const unitDiscountHt = roundedGrossUnit.minus(netSalePriceHt);
  const lineNetHt = decimal(salesRound3(netSalePriceHt.mul(quantity)));
  const purchaseCostHt = decimal(salesRound3(purchasePriceHt.mul(quantity)));
  const marginAmountHt = lineNetHt.minus(purchaseCostHt);
  const marginPercentOnCost = purchasePriceHt.gt(0)
    ? netSalePriceHt.minus(purchasePriceHt).div(purchasePriceHt).mul(100)
    : new Decimal(0);
  const lineTtc = decimal(salesRound3(netSalePriceTtc.mul(quantity)));
  const vatAmount = lineTtc.minus(lineNetHt);
  const discountAmountHt = decimal(salesRound3(unitDiscountHt.mul(quantity)));

  return {
    grossMarginPercent: grossMarginPercent.toNumber(),
    discountPercent: discountPercent.toNumber(),
    netMarginPercent: salesRound3(marginPercentOnCost),
    marginPercentOnCost: salesRound3(marginPercentOnCost),
    unitPriceHtBeforeDiscount: roundedGrossUnit.toNumber(),
    grossSalePriceHt: roundedGrossUnit.toNumber(),
    grossSalePriceTtc: grossSalePriceTtc.toNumber(),
    unitPriceHt: netSalePriceHt.toNumber(),
    netSalePriceHt: netSalePriceHt.toNumber(),
    unitPriceTtc: netSalePriceTtc.toNumber(),
    netSalePriceTtc: netSalePriceTtc.toNumber(),
    discountAmountTtc: salesRound3(unitDiscountTtc.mul(quantity)),
    discountAmount: discountAmountHt.toNumber(),
    discountAmountHt: discountAmountHt.toNumber(),
    marginAmount: salesRound3(netSalePriceHt.minus(purchasePriceHt)),
    marginAmountHt: salesRound3(marginAmountHt),
    purchaseCostHt: purchaseCostHt.toNumber(),
    totalHt: lineNetHt.toNumber(),
    lineNetHt: lineNetHt.toNumber(),
    taxAmount: vatAmount.toNumber(),
    vatAmount: vatAmount.toNumber(),
    totalTtc: salesRound3(lineTtc),
    lineTtc: salesRound3(lineTtc),
  };
}

export function calculateSalesTotals(
  lines: ReturnType<typeof calculateSalesLine>[],
  fiscalStamp: number | string = 0,
) {
  const sum = (
    field: 'lineNetHt' | 'vatAmount' | 'discountAmountHt' | 'purchaseCostHt',
  ) => lines.reduce((total, line) => total.plus(line[field]), new Decimal(0));
  const totalHt = sum('lineNetHt');
  const totalVat = sum('vatAmount');
  const totalPurchaseCostHt = sum('purchaseCostHt');
  const stamp = Decimal.max(0, decimal(fiscalStamp));
  return {
    totalHt: salesRound3(totalHt),
    totalVat: salesRound3(totalVat),
    totalDiscountHt: salesRound3(sum('discountAmountHt')),
    totalPurchaseCostHt: salesRound3(totalPurchaseCostHt),
    totalMarginHt: salesRound3(totalHt.minus(totalPurchaseCostHt)),
    totalTtc: salesRound3(totalHt.plus(totalVat)),
    fiscalStamp: salesRound3(stamp),
    totalToPay: salesRound3(totalHt.plus(totalVat).plus(stamp)),
  };
}
