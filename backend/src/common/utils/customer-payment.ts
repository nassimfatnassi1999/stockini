import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma, SurplusDisposition } from '@prisma/client';

export const TND_SCALE = 3;
const ZERO = new Prisma.Decimal(0);

export function tnd(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0).toDecimalPlaces(
    TND_SCALE,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

export interface CustomerPaymentAllocation {
  amountReceived: Prisma.Decimal;
  amountApplied: Prisma.Decimal;
  changeDue: Prisma.Decimal;
  changeReturned: Prisma.Decimal;
  retainedSurplus: Prisma.Decimal;
  customerCreditCreated: Prisma.Decimal;
  remainingBefore: Prisma.Decimal;
  remainingAfter: Prisma.Decimal;
  surplusDisposition: SurplusDisposition;
  paymentStatus: PaymentStatus;
}

export function allocateCustomerPayment(input: {
  remainingBefore: Prisma.Decimal.Value;
  amountReceived: Prisma.Decimal.Value;
  method: PaymentMethod;
  surplusDisposition?: SurplusDisposition;
  hasCustomer: boolean;
}): CustomerPaymentAllocation {
  const remainingBefore = tnd(Prisma.Decimal.max(tnd(input.remainingBefore), ZERO));
  const amountReceived = tnd(input.amountReceived);
  if (amountReceived.lte(ZERO)) {
    throw new BadRequestException('Le montant reçu doit être au minimum de 0,001 DT');
  }
  if (remainingBefore.lte(ZERO)) {
    throw new BadRequestException('Ce document est déjà soldé');
  }

  const amountApplied = tnd(Prisma.Decimal.min(amountReceived, remainingBefore));
  const changeDue = tnd(Prisma.Decimal.max(amountReceived.minus(amountApplied), ZERO));
  const disposition = changeDue.isZero()
    ? SurplusDisposition.NONE
    : input.surplusDisposition;

  if (!changeDue.isZero() && !disposition) {
    throw new BadRequestException(
      'Le montant reçu dépasse le reste à payer : la destination du surplus est obligatoire',
    );
  }
  if (disposition === SurplusDisposition.RETURNED && input.method !== PaymentMethod.CASH) {
    throw new BadRequestException(
      'La monnaie physique ne peut être rendue que pour un paiement en espèces',
    );
  }
  if (disposition === SurplusDisposition.CUSTOMER_CREDIT && !input.hasCustomer) {
    throw new BadRequestException('Un crédit nécessite un client identifié');
  }
  if (
    disposition === SurplusDisposition.CASH_SURPLUS &&
    input.method !== PaymentMethod.CASH
  ) {
    throw new BadRequestException(
      'Un surplus encaissé est réservé aux paiements en espèces',
    );
  }

  const changeReturned =
    disposition === SurplusDisposition.RETURNED ? changeDue : ZERO;
  const retainedSurplus =
    disposition === SurplusDisposition.CASH_SURPLUS ? changeDue : ZERO;
  const customerCreditCreated =
    disposition === SurplusDisposition.CUSTOMER_CREDIT ? changeDue : ZERO;
  const remainingAfter = tnd(
    Prisma.Decimal.max(remainingBefore.minus(amountApplied), ZERO),
  );
  const paymentStatus = remainingAfter.isZero()
    ? PaymentStatus.PAID
    : PaymentStatus.PARTIAL;

  const allocated = tnd(
    amountApplied
      .plus(changeReturned)
      .plus(retainedSurplus)
      .plus(customerCreditCreated),
  );
  if (!allocated.eq(amountReceived)) {
    throw new BadRequestException('Répartition du paiement incohérente');
  }

  return {
    amountReceived,
    amountApplied,
    changeDue,
    changeReturned,
    retainedSurplus,
    customerCreditCreated,
    remainingBefore,
    remainingAfter,
    surplusDisposition: disposition ?? SurplusDisposition.NONE,
    paymentStatus,
  };
}
