import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PaymentStatus, Prisma, PrismaClient, SurplusDisposition } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { commercialTotalFinal } from '../common/utils/commercial-document';
import { tnd } from '../common/utils/customer-payment';

config({ quiet: true });
if (!process.env.DATABASE_URL) {
  config({ path: resolve(process.cwd(), '../.env'), quiet: true });
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est requis');

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const sales = await prisma.sale.findMany({
    where: {
      deletedAt: null,
      OR: [
        { paidAmount: { gt: prisma.sale.fields.total } },
        { AND: [{ paymentStatus: { not: PaymentStatus.PAID } }, { remainingAmount: { gt: 0 } }] },
      ],
    },
    include: {
      payments: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  });

  const repairs = sales.flatMap((sale) => {
    const total = tnd(
      Prisma.Decimal.max(
        new Prisma.Decimal(
          commercialTotalFinal(sale.total, sale.stampDuty),
        ).minus(sale.totalRefunded),
        0,
      ),
    );
    const receivedTotal = sale.payments.reduce(
      (sum, payment) => sum.plus(payment.amountReceived.gt(0) ? payment.amountReceived : payment.amount),
      new Prisma.Decimal(0),
    );
    if (!receivedTotal.gt(total) || sale.remainingAmount.eq(0) && sale.paymentStatus === PaymentStatus.PAID) {
      return [];
    }
    return [{ sale, total, receivedTotal }];
  });

  console.table(
    repairs.map(({ sale, total, receivedTotal }) => ({
      document: sale.invoiceNumber,
      total: total.toFixed(3),
      ancienPaye: sale.paidAmount.toFixed(3),
      recu: receivedTotal.toFixed(3),
      ancienReste: sale.remainingAmount.toFixed(3),
      surplusNonResolue: receivedTotal.minus(total).toFixed(3),
    })),
  );

  if (apply) {
    for (const { sale, total } of repairs) {
      await prisma.$transaction(async (tx) => {
        let remaining = total;
        for (const payment of sale.payments) {
          const received = tnd(
            payment.amountReceived.gt(0) ? payment.amountReceived : payment.amount,
          );
          const applied = tnd(Prisma.Decimal.min(received, remaining));
          const surplus = tnd(received.minus(applied));
          const before = remaining;
          remaining = tnd(Prisma.Decimal.max(remaining.minus(applied), 0));
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              amount: applied,
              amountReceived: received,
              amountApplied: applied,
              changeDue: surplus,
              retainedSurplus: surplus,
              remainingBefore: before,
              remainingAfter: remaining,
              surplusDisposition: surplus.gt(0)
                ? SurplusDisposition.UNRESOLVED_OVERPAYMENT
                : SurplusDisposition.NONE,
            },
          });
        }
        const appliedTotal = total.minus(remaining);
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            paidAmount: appliedTotal,
            remainingAmount: remaining,
            paymentStatus: remaining.eq(0)
              ? PaymentStatus.PAID
              : appliedTotal.gt(0)
                ? PaymentStatus.PARTIAL
                : PaymentStatus.UNPAID,
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'payment.overpayment_repaired',
            entity: 'Sale',
            entityId: sale.id,
            oldValue: {
              paidAmount: sale.paidAmount.toFixed(3),
              remainingAmount: sale.remainingAmount.toFixed(3),
              paymentStatus: sale.paymentStatus,
            },
            newValue: {
              paidAmount: appliedTotal.toFixed(3),
              remainingAmount: remaining.toFixed(3),
              paymentStatus: remaining.eq(0) ? 'PAID' : 'PARTIAL',
            },
            metadata: {
              invoiceNumber: sale.invoiceNumber,
              classification: 'UNRESOLVED_OVERPAYMENT',
            },
          },
        });
      });
    }
  }

  console.log(`${repairs.length} document(s) ${apply ? 'réparé(s)' : 'à réparer (dry-run)'}.`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
