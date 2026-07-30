import { DocumentType, Prisma, SaleStatus } from '@prisma/client';

export type CustomerDebtRecord = {
  remainingAmount: Prisma.Decimal.Value;
  customerId?: string | null;
};

export type CustomerDebtSummary = {
  debtAmount: Prisma.Decimal;
  unpaidInvoicesCount: number;
};

/** Shared document scope for every current customer-debt consumer. */
export function customerDebtSaleWhere(
  scope?: Prisma.SaleWhereInput,
): Prisma.SaleWhereInput {
  const debtDocuments: Prisma.SaleWhereInput = {
    deletedAt: null,
    status: { not: SaleStatus.CANCELLED },
    customerId: { not: null },
    consolidationMemberships: { none: { active: true } },
    OR: [
      { documentType: DocumentType.FACTURE },
      {
        documentType: DocumentType.BON_LIVRAISON,
        transformedToId: null,
      },
    ],
  };
  return scope ? { AND: [debtDocuments, scope] } : debtDocuments;
}

/**
 * Unique source of truth for customer receivables.
 *
 * Sale.remainingAmount is maintained by the payment and credit-note workflows;
 * notably, it already includes accepted payment differences. Consumers must not
 * reconstruct debt from total, paidAmount and totalRefunded.
 */
export class CustomerDebtCalculator {
  static remaining(value: Prisma.Decimal.Value): Prisma.Decimal {
    return Prisma.Decimal.max(new Prisma.Decimal(value ?? 0), 0);
  }

  static summarize(records: CustomerDebtRecord[]): CustomerDebtSummary {
    let debtAmount = new Prisma.Decimal(0);
    let unpaidInvoicesCount = 0;

    for (const record of records) {
      const remaining = this.remaining(record.remainingAmount);
      if (remaining.gt(0)) {
        debtAmount = debtAmount.plus(remaining);
        unpaidInvoicesCount++;
      }
    }

    return { debtAmount, unpaidInvoicesCount };
  }

  static groupByCustomer(
    records: CustomerDebtRecord[],
  ): Map<string, CustomerDebtSummary> {
    const grouped = new Map<string, CustomerDebtSummary>();

    for (const record of records) {
      if (!record.customerId) continue;
      const remaining = this.remaining(record.remainingAmount);
      if (!remaining.gt(0)) continue;
      const current = grouped.get(record.customerId) ?? {
        debtAmount: new Prisma.Decimal(0),
        unpaidInvoicesCount: 0,
      };
      grouped.set(record.customerId, {
        debtAmount: current.debtAmount.plus(remaining),
        unpaidInvoicesCount: current.unpaidInvoicesCount + 1,
      });
    }

    return grouped;
  }
}
