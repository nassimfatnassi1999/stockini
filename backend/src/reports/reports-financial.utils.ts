import { DocumentType, Prisma, SaleStatus } from '@prisma/client';

export const REVENUE_RECOGNIZED_STATUSES: SaleStatus[] = [
  SaleStatus.COMPLETED,
  SaleStatus.PARTIALLY_REFUNDED,
  SaleStatus.REFUNDED,
  SaleStatus.RETURNED,
];

export type RevenueDocument = {
  documentType: DocumentType;
  status: SaleStatus;
  deletedAt?: Date | null;
  transformedToId?: string | null;
};

/** Unique business rule used by analytics and available to document workflows. */
export function isRevenueRecognizedDocument(
  document: RevenueDocument,
): boolean {
  if (
    document.deletedAt ||
    !REVENUE_RECOGNIZED_STATUSES.includes(document.status)
  )
    return false;
  if (document.documentType === DocumentType.FACTURE) return true;
  return (
    document.documentType === DocumentType.BON_LIVRAISON &&
    !document.transformedToId
  );
}

/** Prisma equivalent of isRevenueRecognizedDocument, kept beside that rule. */
export function revenueRecognizedSaleWhere(): Prisma.SaleWhereInput {
  return {
    deletedAt: null,
    status: { in: REVENUE_RECOGNIZED_STATUSES },
    OR: [
      { documentType: DocumentType.FACTURE },
      { documentType: DocumentType.BON_LIVRAISON, transformedToId: null },
    ],
  };
}

export function financialRates(
  revenue: Prisma.Decimal.Value,
  cost: Prisma.Decimal.Value,
  profit: Prisma.Decimal.Value,
) {
  const r = new Prisma.Decimal(revenue);
  const c = new Prisma.Decimal(cost);
  const p = new Prisma.Decimal(profit);
  return {
    marginRateOnCost: c.isZero() ? new Prisma.Decimal(0) : p.div(c).mul(100),
    markupRateOnRevenue: r.isZero() ? new Prisma.Decimal(0) : p.div(r).mul(100),
  };
}
