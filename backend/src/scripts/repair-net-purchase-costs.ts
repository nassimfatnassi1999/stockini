import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { calculateSalePriceFromPurchaseTtc } from '../common/utils/sales-calculations';

config({ quiet: true });
if (!process.env.DATABASE_URL) config({ path: resolve(process.cwd(), '../.env'), quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL est requis');

const apply = process.argv.includes('--apply');
const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
const money = (value: Prisma.Decimal.Value) => D(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
const netPurchaseUnitCost = (gross: Prisma.Decimal.Value, discount: Prisma.Decimal.Value) =>
  money(D(gross).minus(money(D(gross).mul(discount).div(100))));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const [purchaseItems, saleItems, products, ambiguousInbound] = await Promise.all([
    prisma.purchaseItem.findMany({ include: { purchase: { select: { orderNumber: true, createdAt: true } } } }),
    prisma.saleItem.findMany({
      where: { OR: [{ unitPurchaseCostHt: null }, { purchaseCostEstimated: true }] },
      include: { sale: { select: { invoiceNumber: true, createdAt: true } } },
    }),
    prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, reference: true, purchasePrice: true, purchasePriceTtc: true, tva: true } }),
    prisma.stockMovement.findMany({
      where: { type: { in: ['ENTRY', 'ADJUSTMENT', 'INVENTORY_CORRECTION', 'CUSTOMER_RETURN', 'RETURN_IN'] } },
      select: { productId: true },
    }),
  ]);

  const purchaseChanges = purchaseItems.flatMap((item) => {
    const net = netPurchaseUnitCost(item.unitCost, item.discountPercent);
    const line = money(net.mul(item.quantity));
    const unitDiscount = money(D(item.unitCost).minus(net));
    if (item.unitCostHtNet?.equals(net) && item.lineTotalHtNet?.equals(line) && item.discountAmount.equals(unitDiscount)) return [];
    return [{ item, net, line, unitDiscount }];
  });

  const receivedByProduct = new Map<string, typeof purchaseItems>();
  for (const item of purchaseItems) {
    if (item.receivedQuantity <= 0) continue;
    receivedByProduct.set(item.productId, [...(receivedByProduct.get(item.productId) ?? []), item]);
  }
  const saleChanges: Array<{ item: (typeof saleItems)[number]; oldCost: Prisma.Decimal | null; newCost: Prisma.Decimal }> = [];
  const ambiguousSales: typeof saleItems = [];
  for (const item of saleItems) {
    const candidates = (receivedByProduct.get(item.productId) ?? []).filter((p) => p.purchase.createdAt <= item.sale.createdAt);
    const costs = [...new Set(candidates.map((p) => netPurchaseUnitCost(p.unitCost, p.discountPercent).toFixed(3)))];
    if (costs.length !== 1) { ambiguousSales.push(item); continue; }
    saleChanges.push({ item, oldCost: item.unitPurchaseCostHt, newCost: D(costs[0]) });
  }
  const ambiguousProductIds = new Set(ambiguousInbound.map((movement) => movement.productId));
  const productChanges = products.flatMap((product) => {
    const receipts = receivedByProduct.get(product.id) ?? [];
    if (!receipts.length || ambiguousProductIds.has(product.id)) return [];
    const totalQuantity = receipts.reduce((sum, item) => sum.plus(item.receivedQuantity), D(0));
    const totalValue = receipts.reduce((sum, item) => {
      const net = netPurchaseUnitCost(item.unitCost, item.discountPercent);
      return sum.plus(net.mul(item.receivedQuantity));
    }, D(0));
    const cump = money(totalValue.div(totalQuantity));
    return product.purchasePrice.equals(cump) ? [] : [{ product, cump }];
  });

  console.table(purchaseChanges.map(({ item, net, line }) => ({ achat: item.purchase.orderNumber, ligne: item.id, ancienCout: item.unitCostHtNet?.toFixed(3) ?? 'NULL', nouveauCout: net.toFixed(3), totalNet: line.toFixed(3) })));
  console.table(saleChanges.map(({ item, oldCost, newCost }) => {
    const saleNet = item.finalUnitPrice ?? D(item.total).div(item.quantity);
    return { vente: item.sale.invoiceNumber, ligne: item.id, ancienCout: oldCost?.toFixed(3) ?? 'NULL', nouveauCout: newCost.toFixed(3), ancienneMarge: oldCost == null ? '?' : money(D(saleNet).minus(oldCost)).toFixed(3), nouvelleMarge: money(D(saleNet).minus(newCost)).toFixed(3) };
  }));
  console.table(productChanges.map(({ product, cump }) => ({ produit: product.reference, ancienCump: product.purchasePrice.toFixed(3), nouveauCump: cump.toFixed(3) })));
  console.log({ mode: apply ? 'APPLY' : 'DRY-RUN', purchaseLinesAnalyzed: purchaseItems.length, purchaseLinesCorrectible: purchaseChanges.length, productsAnalyzed: products.length, productsCorrectible: productChanges.length, ambiguousProducts: ambiguousProductIds.size, saleLinesAnalyzed: saleItems.length, saleLinesCorrectible: saleChanges.length, ambiguousSaleLines: ambiguousSales.length });

  if (apply) {
    await prisma.$transaction([
      ...purchaseChanges.map(({ item, net, line, unitDiscount }) => prisma.purchaseItem.update({ where: { id: item.id }, data: { unitCostHtNet: net, lineTotalHtNet: line, discountAmount: unitDiscount } })),
      ...saleChanges.map(({ item, newCost }) => prisma.saleItem.update({ where: { id: item.id }, data: { unitPurchaseCostHt: newCost, purchaseCostEstimated: false } })),
      ...productChanges.map(({ product, cump }) => {
        const derivedPurchasePriceTtc = money(cump.mul(D(1).plus(D(product.tva).div(100))));
        // Un écart maximal d'un millime provient souvent de la conversion d'un
        // TTC fournisseur exact vers un HT à trois décimales. Préserver ce TTC.
        const purchasePriceTtc = D(product.purchasePriceTtc).minus(derivedPurchasePriceTtc).abs().lte(0.001)
          ? product.purchasePriceTtc
          : derivedPurchasePriceTtc;
        const resolvedSale = calculateSalePriceFromPurchaseTtc({ purchaseTtc: purchasePriceTtc.toString(), markupPercent: 40, discountPercent: 0, vatPercent: product.tva.toString() });
        return prisma.product.update({ where: { id: product.id }, data: {
          purchasePrice: cump,
          purchasePriceTtc,
          salePrice: resolvedSale.saleHtGross,
        } });
      }),
    ]);
  } else console.log('Aucune écriture. Sauvegardez la base puis relancez avec --apply.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
