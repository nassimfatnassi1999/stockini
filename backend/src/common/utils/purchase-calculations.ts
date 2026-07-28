import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
const d = (value: Decimal.Value = 0) => new Decimal(value);
export const purchaseRound3 = (value: Decimal.Value) =>
  d(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber();

export function calculateWeightedAverageCost(input: {
  currentQuantity: number | string;
  currentUnitCostHtNet: Decimal.Value;
  incomingQuantity: number | string;
  incomingUnitCostHtNet: Decimal.Value;
}) {
  const currentQuantity = Decimal.max(0, d(input.currentQuantity));
  const incomingQuantity = Decimal.max(0, d(input.incomingQuantity));
  const totalQuantity = currentQuantity.plus(incomingQuantity);
  if (totalQuantity.isZero()) return 0;
  return purchaseRound3(
    d(input.currentUnitCostHtNet).mul(currentQuantity)
      .plus(d(input.incomingUnitCostHtNet).mul(incomingQuantity))
      .div(totalQuantity),
  );
}

export interface PurchaseLineInput {
  quantity: number | string;
  unitCost: number | string;
  discountPercent?: number | string | null;
  tvaPercent?: number | string | null;
}

export function calculatePurchaseLine(input: PurchaseLineInput) {
  const quantity = Decimal.max(0, d(input.quantity));
  const unitCost = Decimal.max(0, d(input.unitCost));
  const discountPercent = Decimal.min(
    100,
    Decimal.max(0, d(input.discountPercent ?? 0)),
  );
  const tvaPercent = Decimal.max(0, d(input.tvaPercent ?? 0));
  const unitDiscountAmount = d(
    purchaseRound3(unitCost.mul(discountPercent).div(100)),
  );
  const unitCostHtNet = d(purchaseRound3(unitCost.minus(unitDiscountAmount)));
  const grossHt = d(purchaseRound3(quantity.mul(unitCost)));
  const discountAmount = d(purchaseRound3(grossHt.minus(unitCostHtNet.mul(quantity))));
  const netHt = d(purchaseRound3(unitCostHtNet.mul(quantity)));
  const taxAmount = d(purchaseRound3(netHt.mul(tvaPercent).div(100)));
  return {
    unitCostHtGross: purchaseRound3(unitCost),
    unitDiscountAmount: unitDiscountAmount.toNumber(),
    unitCostHtNet: unitCostHtNet.toNumber(),
    lineTotalHtNet: netHt.toNumber(),
    grossHt: grossHt.toNumber(),
    discountAmount: discountAmount.toNumber(),
    netHt: netHt.toNumber(),
    taxAmount: taxAmount.toNumber(),
    totalTtc: purchaseRound3(netHt.plus(taxAmount)),
  };
}

export function calculatePurchaseTotals(
  lines: Array<Pick<ReturnType<typeof calculatePurchaseLine>, 'grossHt' | 'discountAmount' | 'netHt' | 'taxAmount'>>,
  stampDuty: number | string = 0,
) {
  const sum = (field: 'grossHt' | 'discountAmount' | 'netHt' | 'taxAmount') =>
    lines.reduce((total, line) => total.plus(line[field]), d(0));
  const subtotal = sum('netHt');
  const tax = sum('taxAmount');
  const stamp = Decimal.max(0, d(stampDuty));
  return {
    grossSubtotal: purchaseRound3(sum('grossHt')),
    subtotal: purchaseRound3(subtotal),
    discount: purchaseRound3(sum('discountAmount')),
    tax: purchaseRound3(tax),
    total: purchaseRound3(subtotal.plus(tax)),
    stampDuty: purchaseRound3(stamp),
    totalFinal: purchaseRound3(subtotal.plus(tax).plus(stamp)),
  };
}
