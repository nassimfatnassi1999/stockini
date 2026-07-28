import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { calculateSalePriceFromPurchaseTtc } from '../common/utils/sales-calculations';

config({ quiet: true });
if (!process.env.DATABASE_URL) config({ path: resolve(process.cwd(), '../.env'), quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL est requis');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const reference = process.argv.find((arg) => arg.startsWith('--reference='))?.slice('--reference='.length);
const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
const r3 = (value: Prisma.Decimal.Value) => D(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);

async function main() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, ...(reference ? { reference } : {}) },
    include: {
      purchaseItems: {
        where: { receivedQuantity: { gt: 0 }, purchase: { deletedAt: null } },
        include: { purchase: { select: { orderNumber: true, createdAt: true } } },
        orderBy: { purchase: { createdAt: 'desc' } },
      },
      stockMovements: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (reference && products.length === 0) throw new Error(`Produit ${reference} introuvable`);

  const rows = products.map((product) => {
    const vatFactor = D(1).plus(D(product.tva).div(100));
    const expectedPurchaseTtc = r3(D(product.purchasePrice).mul(vatFactor));
    const expectedSale = calculateSalePriceFromPurchaseTtc({ purchaseTtc: product.purchasePriceTtc.toString(), markupPercent: 40, discountPercent: 0, vatPercent: product.tva.toString() });
    const receipts = product.purchaseItems;
    const receivedQuantity = receipts.reduce((sum, item) => sum.plus(item.receivedQuantity), D(0));
    const receivedValue = receipts.reduce((sum, item) => {
      const net = item.unitCostHtNet ?? r3(D(item.unitCost).minus(r3(D(item.unitCost).mul(item.discountPercent).div(100))));
      return sum.plus(D(net).mul(item.receivedQuantity));
    }, D(0));
    const receiptCump = receivedQuantity.gt(0) ? r3(receivedValue.div(receivedQuantity)) : null;
    const ambiguousInbound = product.stockMovements.some((movement) =>
      ['ENTRY', 'ADJUSTMENT', 'INVENTORY_CORRECTION', 'CUSTOMER_RETURN', 'RETURN_IN'].includes(movement.type),
    );
    const issues = [
      !product.purchasePriceTtc.equals(expectedPurchaseTtc) && 'PA_HT_TTC_INCOHERENT',
      !D(product.salePrice).equals(expectedSale.saleHtGross) && 'PV_AUTO_INCOHERENT',
      receiptCump && !product.purchasePrice.equals(receiptCump) && 'CUMP_RECEPTION_DESYNCHRONISE',
    ].filter(Boolean).join(',') || 'OK';
    return {
      reference: product.reference,
      designation: product.name,
      purchasePriceHt: product.purchasePrice.toFixed(3),
      purchasePriceTtc: product.purchasePriceTtc.toFixed(3),
      expectedPurchaseTtc: expectedPurchaseTtc.toFixed(3),
      storedSalePriceHt: product.salePrice.toFixed(3),
      resolvedSalePriceHt: r3(expectedSale.saleHtGross).toFixed(3),
      resolvedSalePriceTtc: r3(expectedSale.saleTtcGross).toFixed(3),
      vatRate: product.tva.toFixed(3),
      lastSellingPrice: product.lastSellingPrice?.toFixed(3) ?? null,
      lastPurchase: receipts[0]?.purchase.orderNumber ?? null,
      lastPurchaseGrossHt: receipts[0]?.unitCost.toFixed(3) ?? null,
      lastPurchaseDiscount: receipts[0]?.discountPercent.toFixed(3) ?? null,
      lastPurchaseNetHt: receipts[0]?.unitCostHtNet?.toFixed(3) ?? null,
      receiptCump: receiptCump?.toFixed(3) ?? null,
      correctionSafe: Boolean(receiptCump && !ambiguousInbound),
      issues,
    };
  });
  console.table(rows.filter((row) => reference || row.issues !== 'OK'));
  console.log({ mode: 'DRY-RUN', analyzed: rows.length, inconsistent: rows.filter((row) => row.issues !== 'OK').length, reference: reference ?? null });
  console.log('Aucune donnée modifiée. Les CUMP déterministes se corrigent séparément avec npm run costs:repair.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
