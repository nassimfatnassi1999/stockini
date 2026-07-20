import {
  PaymentStatus,
  PaymentType,
  Prisma,
  PurchaseDocumentType,
  PurchaseStatus,
} from '@prisma/client';
import { commercialTotalFinal } from '../utils/commercial-document';
import {
  calculatePaymentAmounts,
  PaymentAmounts,
} from '../utils/payment-status';

type PurchaseForPaymentState = {
  id: string;
  supplierId: string;
  total: Prisma.Decimal | number | string;
  stampDuty: Prisma.Decimal | number | string;
};

type PaymentStateClient = Pick<
  Prisma.TransactionClient,
  'payment' | 'purchase'
>;

export const VALID_SUPPLIER_PAYMENT_WHERE = {
  type: PaymentType.SUPPLIER_PAYMENT,
  deletedAt: null,
} as const;

export const SUPPLIER_DEBT_PURCHASE_WHERE: Prisma.PurchaseWhereInput = {
  deletedAt: null,
  status: { not: PurchaseStatus.CANCELLED },
  documentType: { not: PurchaseDocumentType.BON_COMMANDE },
};

/** Source de vérité unique : total TTC de l'achat moins ses paiements actifs. */
export async function getPurchasePaymentSummary(
  db: PaymentStateClient,
  purchase: PurchaseForPaymentState,
): Promise<PaymentAmounts> {
  const aggregate = await db.payment.aggregate({
    where: {
      purchaseId: purchase.id,
      ...VALID_SUPPLIER_PAYMENT_WHERE,
    },
    _sum: { amount: true },
  });

  return calculatePaymentAmounts(
    commercialTotalFinal(purchase.total, purchase.stampDuty),
    aggregate._sum.amount ?? 0,
  );
}

/** Synchronise le cache de l'achat dans la même transaction que la mutation. */
export async function syncPurchasePaymentState(
  tx: Prisma.TransactionClient,
  purchase: PurchaseForPaymentState,
): Promise<PaymentAmounts> {
  const summary = await getPurchasePaymentSummary(tx, purchase);
  await tx.purchase.update({
    where: { id: purchase.id },
    data: summary,
  });
  return summary;
}

export type SupplierDebtSummary = {
  supplierId: string;
  supplierDebt: Prisma.Decimal;
};

/**
 * Calcule les dettes sans lire remainingAmount : les champs stockés peuvent être
 * anciens, alors que les paiements actifs liés sont la donnée comptable primaire.
 */
export async function getSupplierDebtMap(
  db: PaymentStateClient,
  supplierIds?: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const purchases = await db.purchase.findMany({
    where: {
      ...SUPPLIER_DEBT_PURCHASE_WHERE,
      ...(supplierIds && { supplierId: { in: supplierIds } }),
    },
    select: {
      id: true,
      supplierId: true,
      total: true,
      stampDuty: true,
      payments: {
        where: VALID_SUPPLIER_PAYMENT_WHERE,
        select: { amount: true },
      },
    },
  });

  const debts = new Map<string, Prisma.Decimal>();
  for (const purchase of purchases) {
    const paid = purchase.payments.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    const { remainingAmount } = calculatePaymentAmounts(
      commercialTotalFinal(purchase.total, purchase.stampDuty),
      paid,
    );
    debts.set(
      purchase.supplierId,
      (debts.get(purchase.supplierId) ?? new Prisma.Decimal(0)).plus(
        remainingAmount,
      ),
    );
  }
  return debts;
}

export function serializePaymentSummary(summary: PaymentAmounts) {
  return {
    paidAmount: summary.paidAmount.toFixed(3),
    remainingAmount: summary.remainingAmount.toFixed(3),
    paymentStatus: summary.paymentStatus as PaymentStatus,
  };
}
