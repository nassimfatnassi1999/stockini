import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
const d = (value: Decimal.Value = 0) => new Decimal(value);
export const purchaseRound3 = (value: Decimal.Value) =>
  d(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber();

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
  const grossHt = d(purchaseRound3(quantity.mul(unitCost)));
  const discountAmount = d(
    purchaseRound3(grossHt.mul(discountPercent).div(100)),
  );
  const netHt = d(purchaseRound3(grossHt.minus(discountAmount)));
  const taxAmount = d(purchaseRound3(netHt.mul(tvaPercent).div(100)));
  return {
    grossHt: grossHt.toNumber(),
    discountAmount: discountAmount.toNumber(),
    netHt: netHt.toNumber(),
    taxAmount: taxAmount.toNumber(),
    totalTtc: purchaseRound3(netHt.plus(taxAmount)),
  };
}

export function calculatePurchaseTotals(
  lines: ReturnType<typeof calculatePurchaseLine>[],
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
