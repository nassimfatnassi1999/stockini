import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  serializePaymentSummary,
  VALID_SUPPLIER_PAYMENT_WHERE,
} from '../common/services/purchase-payment-state';
import { calculatePaymentAmounts } from '../common/utils/payment-status';
import { commercialTotalFinal } from '../common/utils/commercial-document';

config({ quiet: true });
if (!process.env.DATABASE_URL) {
  config({ path: resolve(process.cwd(), '../.env'), quiet: true });
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL est requis');

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const purchases = await prisma.purchase.findMany({
    where: { deletedAt: null },
    include: {
      supplier: { select: { name: true } },
      payments: {
        where: VALID_SUPPLIER_PAYMENT_WHERE,
        select: { amount: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const changes = purchases.flatMap((purchase) => {
    const paid = purchase.payments.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    const next = calculatePaymentAmounts(
      commercialTotalFinal(purchase.total, purchase.stampDuty),
      paid,
    );
    if (
      purchase.paidAmount.equals(next.paidAmount) &&
      purchase.remainingAmount.equals(next.remainingAmount) &&
      purchase.paymentStatus === next.paymentStatus
    ) {
      return [];
    }
    return [{ purchase, next }];
  });

  console.table(
    changes.map(({ purchase, next }) => ({
      achat: purchase.orderNumber,
      fournisseur: purchase.supplier.name,
      ancienPaye: purchase.paidAmount.toFixed(3),
      nouveauPaye: next.paidAmount.toFixed(3),
      ancienReste: purchase.remainingAmount.toFixed(3),
      nouveauReste: next.remainingAmount.toFixed(3),
      ancienStatut: purchase.paymentStatus,
      nouveauStatut: next.paymentStatus,
    })),
  );

  if (apply && changes.length) {
    await prisma.$transaction(
      changes.map(({ purchase, next }) =>
        prisma.purchase.update({
          where: { id: purchase.id },
          data: serializePaymentSummary(next),
        }),
      ),
    );
  }

  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}: ${changes.length} achat(s) à corriger sur ${purchases.length}.`,
  );
  if (!apply)
    console.log('Relancer avec --apply pour enregistrer les corrections.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
