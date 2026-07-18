import { PaymentStatus, Prisma } from '@prisma/client';

export const PAYMENT_ROUNDING_TOLERANCE = new Prisma.Decimal('0.001');

export interface PaymentAmounts {
  paidAmount: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
  paymentStatus: PaymentStatus;
}

/**
 * Source unique pour l'affichage financier d'un document. Les appelants
 * fournissent le total à payer et la somme des paiements encore valides.
 */
export function calculatePaymentAmounts(
  totalPayable: Prisma.Decimal.Value,
  validPaidAmount: Prisma.Decimal.Value,
): PaymentAmounts {
  const total = new Prisma.Decimal(totalPayable ?? 0);
  const paid = Prisma.Decimal.max(
    new Prisma.Decimal(validPaidAmount ?? 0),
    new Prisma.Decimal(0),
  );
  const remaining = Prisma.Decimal.max(total.minus(paid), new Prisma.Decimal(0));

  let paymentStatus: PaymentStatus;
  if (remaining.lte(PAYMENT_ROUNDING_TOLERANCE)) {
    paymentStatus = PaymentStatus.PAID;
  } else if (paid.gt(0)) {
    paymentStatus = PaymentStatus.PARTIAL;
  } else {
    paymentStatus = PaymentStatus.UNPAID;
  }

  return { paidAmount: paid, remainingAmount: remaining, paymentStatus };
}
