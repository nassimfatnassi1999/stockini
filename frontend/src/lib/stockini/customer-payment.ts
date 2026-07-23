import Decimal from "decimal.js";

Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_UP });

const ZERO = new Decimal(0);

export type SurplusDisposition =
  | "NONE"
  | "RETURNED"
  | "CUSTOMER_CREDIT"
  | "CASH_SURPLUS";

const tnd = (value: Decimal.Value) =>
  new Decimal(value || 0).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

export function calculateCustomerPayment(
  remainingBeforeValue: Decimal.Value,
  amountReceivedValue: Decimal.Value,
) {
  const remainingBefore = Decimal.max(tnd(remainingBeforeValue), ZERO);
  const amountReceived = Decimal.max(tnd(amountReceivedValue), ZERO);
  const amountApplied = Decimal.min(amountReceived, remainingBefore);
  const changeDue = Decimal.max(amountReceived.minus(amountApplied), ZERO);
  const remainingAfter = Decimal.max(
    remainingBefore.minus(amountApplied),
    ZERO,
  );
  return {
    remainingBefore,
    amountReceived,
    amountApplied,
    changeDue,
    remainingAfter,
    paymentStatus: remainingAfter.isZero() ? "PAID" : "PARTIAL",
  } as const;
}
