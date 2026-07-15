import Decimal from 'decimal.js';

export const DEFAULT_SALES_MARGIN_PERCENT = 40;
export const SALES_CALCULATION_VERSION = 3;
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

export interface SalesLineCalculationInput {
  purchasePriceHt: number | string;
  /** Prix de vente brut HT avant remise. Dérivé de la marge lorsqu'il est absent. */
  grossSalePriceHt?: number | string | null;
  marginPercent?: number | string | null;
  discountPercent?: number | string | null;
  taxPercent?: number | string | null;
  quantity?: number | string | null;
}

export function calculateSalesLine(input: SalesLineCalculationInput) {
  const purchasePriceHt = Decimal.max(0, decimal(input.purchasePriceHt));
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
  const grossSalePriceHt =
    input.grossSalePriceHt === null || input.grossSalePriceHt === undefined
      ? purchasePriceHt.mul(new Decimal(1).plus(grossMarginPercent.div(100)))
      : Decimal.max(0, decimal(input.grossSalePriceHt));

  // Stockini : la remise retire des points au taux de marge. Ce n'est pas une
  // remise commerciale appliquée au prix de vente brut.
  const roundedGrossUnit = decimal(salesRound3(grossSalePriceHt));
  const netMarginPercent = grossMarginPercent.minus(discountPercent);
  const grossMarginAmount = roundedGrossUnit.minus(purchasePriceHt);
  const netMarginAmount = grossMarginPercent.isZero()
    ? purchasePriceHt.mul(netMarginPercent).div(100)
    : grossMarginAmount.mul(netMarginPercent).div(grossMarginPercent);
  const netSalePriceHt = decimal(
    salesRound3(purchasePriceHt.plus(netMarginAmount)),
  );
  const lineNetHt = decimal(salesRound3(netSalePriceHt.mul(quantity)));
  const purchaseCostHt = decimal(salesRound3(purchasePriceHt.mul(quantity)));
  const marginAmountHt = lineNetHt.minus(purchaseCostHt);
  const marginPercentOnCost = purchasePriceHt.gt(0)
    ? netMarginPercent
    : new Decimal(0);
  const vatAmount = decimal(salesRound3(lineNetHt.mul(taxPercent).div(100)));
  const lineTtc = lineNetHt.plus(vatAmount);
  const discountAmountHt = decimal(
    salesRound3(roundedGrossUnit.minus(netSalePriceHt).mul(quantity)),
  );

  return {
    grossMarginPercent: grossMarginPercent.toNumber(),
    discountPercent: discountPercent.toNumber(),
    netMarginPercent: salesRound3(marginPercentOnCost),
    marginPercentOnCost: salesRound3(marginPercentOnCost),
    unitPriceHtBeforeDiscount: roundedGrossUnit.toNumber(),
    grossSalePriceHt: roundedGrossUnit.toNumber(),
    unitPriceHt: netSalePriceHt.toNumber(),
    netSalePriceHt: netSalePriceHt.toNumber(),
    unitPriceTtc: salesRound3(
      netSalePriceHt.mul(new Decimal(1).plus(taxPercent.div(100))),
    ),
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
