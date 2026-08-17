import { DocumentType, Prisma } from '@prisma/client';

export const DEFAULT_STAMP_DUTY = 1;

/**
 * Documents that create a customer receivable and can receive a payment.
 * A DEVIS (and a BON_COMMANDE) is commercial information only: its TTC is
 * useful, but it must never acquire a payment state or a balance due.
 */
export const PAYABLE_SALE_DOCUMENT_TYPES = [
  DocumentType.BON_LIVRAISON,
  DocumentType.FACTURE,
] as const;

export function isPayableSaleDocument(
  documentType: DocumentType | string | null | undefined,
): boolean {
  return PAYABLE_SALE_DOCUMENT_TYPES.some((type) => type === documentType);
}

/** Canonical persisted financial state for non-payable commercial documents. */
export function nonPayableFinancialState() {
  return { paidAmount: 0, remainingAmount: 0, paymentStatus: null };
}

export function commercialTotalFinalDecimal(
  totalTtc: Prisma.Decimal.Value,
  stampDuty: Prisma.Decimal.Value | null | undefined,
): Prisma.Decimal {
  return new Prisma.Decimal(totalTtc ?? 0)
    .plus(stampDuty ?? 0)
    .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

export function commercialTotalFinal(
  totalTtc: number | string | { toString(): string },
  stampDuty: number | string | { toString(): string } | null | undefined,
): number {
  return commercialTotalFinalDecimal(
    typeof totalTtc === 'object' ? totalTtc.toString() : totalTtc,
    stampDuty == null
      ? 0
      : typeof stampDuty === 'object'
        ? stampDuty.toString()
        : stampDuty,
  ).toNumber();
}
