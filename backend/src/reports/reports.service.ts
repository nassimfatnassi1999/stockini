import { Injectable } from '@nestjs/common';
import {
  CaisseMovementType,
  CreditNoteStatus,
  DocumentType,
  ExpenseStatus,
  PaymentStatus,
  PaymentType,
  PurchaseStatus,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReportOverviewQueryDto, ReportPeriod } from './dto/report-overview.dto';

// ─── KPI CALCULATION RULES ────────────────────────────────────────────────────
//
// CA net: SUM(total - totalRefunded) on Sales WHERE
//   documentType IN [FACTURE, BON_LIVRAISON], status != CANCELLED,
//   deletedAt IS NULL, createdAt in period.
//
// Encaissements clients: SUM(Payment.amount) WHERE
//   type=CUSTOMER_PAYMENT, cashImpactDone=true, deletedAt=null, createdAt in period.
//
// Impayés clients: SUM(Sale.remainingAmount) from CA-eligible sales in period.
//
// Total achats: SUM(Purchase.total) WHERE
//   status NOT IN [CANCELLED], deletedAt=null, createdAt in period.
//
// Paiements fournisseurs: SUM(Payment.amount) WHERE
//   type=SUPPLIER_PAYMENT, cashImpactDone=true, deletedAt=null, createdAt in period.
//
// Impayés fournisseurs: SUM(Purchase.remainingAmount) from active purchases in period.
//
// Bénéfice estimé: CA net - Total achats. Marge % = (Bénéfice / CA) * 100.
//
// Valeur stock (global): SUM(quantity * purchasePrice/salePrice) on active products.
//
// Dépenses: SUM(CaisseMovement.montant) WHERE
//   type=RETRAIT_MANUEL, clearedAt=null, createdAt in period.
//
// Avoirs: CreditNote in period (by dateAvoir), statut != CANCELLED.
//
// Mouvements stock: StockMovement in period.
//   Entries: ENTRY|PURCHASE_RECEPTION|CUSTOMER_RETURN
//   Exits:   EXIT|SALE|SUPPLIER_RETURN
//
// Top produits: SaleItem joined to FACTURE/BL sales (not CANCELLED) in period,
//   grouped by productId, ordered SUM(quantity) DESC, limit 10.
//
// Top clients: Sale grouped by customerId in period,
//   ordered SUM(total - totalRefunded) DESC, limit 10.
//
// Top fournisseurs: Purchase grouped by supplierId, SUM(total) DESC, limit 10.
//
// Séries: hourly (today), daily (week/month/custom), monthly (year).
// ─────────────────────────────────────────────────────────────────────────────

const TZ_OFFSET_MS = 60 * 60_000; // Africa/Tunis permanently UTC+1

// ─── Date range resolver ──────────────────────────────────────────────────────

export function resolveReportDateRange(
  period: ReportPeriod | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
): { gte: Date; lte: Date } {
  const now = new Date();
  const localNow = new Date(now.getTime() + TZ_OFFSET_MS);
  const today = new Date(
    Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
    ) - TZ_OFFSET_MS,
  );

  if (period === 'custom' && dateFrom && dateTo) {
    const start = new Date(new Date(dateFrom).getTime() - TZ_OFFSET_MS);
    const end = new Date(
      new Date(dateTo).getTime() - TZ_OFFSET_MS + 86_400_000 - 1,
    );
    return { gte: start, lte: end };
  }

  switch (period) {
    case 'today':
      return { gte: today, lte: new Date(today.getTime() + 86_400_000 - 1) };
    case 'week':
      return { gte: new Date(now.getTime() - 7 * 86_400_000), lte: now };
    case 'month':
      return {
        gte: new Date(
          Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1) -
            TZ_OFFSET_MS,
        ),
        lte: now,
      };
    case 'year':
      return {
        gte: new Date(
          Date.UTC(localNow.getUTCFullYear(), 0, 1) - TZ_OFFSET_MS,
        ),
        lte: now,
      };
    default:
      return {
        gte: new Date(
          Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1) -
            TZ_OFFSET_MS,
        ),
        lte: now,
      };
  }
}

function getPrevRange(range: { gte: Date; lte: Date }): {
  gte: Date;
  lte: Date;
} {
  const durationMs = range.lte.getTime() - range.gte.getTime();
  return {
    gte: new Date(range.gte.getTime() - durationMs - 86_400_000),
    lte: new Date(range.gte.getTime() - 1),
  };
}

// ─── Time-series bucketing ────────────────────────────────────────────────────

interface TimeBucket {
  label: string;
  start: Date;
  end: Date;
}

const MONTHS_FR = [
  'Jan','Fév','Mar','Avr','Mai','Jun',
  'Jul','Aoû','Sep','Oct','Nov','Déc',
];

function buildTimeBuckets(
  period: ReportPeriod | undefined,
  range: { gte: Date; lte: Date },
): TimeBucket[] {
  const localNow = new Date(Date.now() + TZ_OFFSET_MS);
  const buckets: TimeBucket[] = [];

  if (period === 'year') {
    const year = localNow.getUTCFullYear();
    for (let m = 0; m < 12; m++) {
      buckets.push({
        label: MONTHS_FR[m]!,
        start: new Date(Date.UTC(year, m, 1) - TZ_OFFSET_MS),
        end: new Date(Date.UTC(year, m + 1, 0, 23, 59, 59, 999) - TZ_OFFSET_MS),
      });
    }
    return buckets;
  }

  if (period === 'today') {
    for (let h = 0; h < 24; h += 4) {
      const start = new Date(range.gte.getTime() + h * 3_600_000);
      buckets.push({
        label: `${String(h).padStart(2, '0')}h`,
        start,
        end: new Date(start.getTime() + 4 * 3_600_000 - 1),
      });
    }
    return buckets;
  }

  const msDay = 86_400_000;
  const totalDays = Math.ceil(
    (range.lte.getTime() - range.gte.getTime()) / msDay,
  );
  const step = Math.max(1, Math.ceil(totalDays / 60));
  let cursor = new Date(range.gte);

  while (cursor <= range.lte) {
    const end = new Date(
      Math.min(cursor.getTime() + step * msDay - 1, range.lte.getTime()),
    );
    const local = new Date(cursor.getTime() + TZ_OFFSET_MS);
    const dd = String(local.getUTCDate()).padStart(2, '0');
    const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
    buckets.push({ label: `${dd}/${mm}`, start: new Date(cursor), end });
    cursor = new Date(cursor.getTime() + step * msDay);
  }
  return buckets;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  if (v == null) return 0;
  return typeof v === 'string' ? parseFloat(v) || 0 : Number(v);
}

function trend(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

// ─── Filters ──────────────────────────────────────────────────────────────────

const REVENUE_DOC_TYPES = [DocumentType.FACTURE, DocumentType.BON_LIVRAISON];

const STOCK_ENTRY_TYPES = [
  StockMovementType.ENTRY,
  StockMovementType.PURCHASE_RECEPTION,
  StockMovementType.CUSTOMER_RETURN,
];

const STOCK_EXIT_TYPES = [
  StockMovementType.EXIT,
  StockMovementType.SALE,
  StockMovementType.SUPPLIER_RETURN,
];

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private round3(value: number): number {
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  }

  async getOverview(query: ReportOverviewQueryDto) {
    const period = query.period ?? 'month';
    const range = resolveReportDateRange(period, query.dateFrom, query.dateTo);
    const prevRange = getPrevRange(range);
    const buckets = buildTimeBuckets(period, range);

    const salesFilter = {
      documentType: { in: REVENUE_DOC_TYPES },
      status: { notIn: [SaleStatus.DRAFT, SaleStatus.CANCELLED] },
      deletedAt: null as null,
      transformedToId: null as null,
    };

    const purchasesFilter = {
      status: { notIn: [PurchaseStatus.CANCELLED] },
      deletedAt: null as null,
    };

    const [
      salesAgg,
      prevSalesAgg,
      purchasesAgg,
      prevPurchasesAgg,
      customerPaymentsAgg,
      supplierPaymentsAgg,
      depensesAgg,
      avoirsAgg,
      devisCount,
      bonCommandeCount,
      blCount,
      factureCount,
      cancelledCount,
      caisseConfig,
      stockProducts,
      stockEntries,
      stockExits,
      stockMovementsCount,
      paidSalesCount,
      partialSalesCount,
      unpaidSalesCount,
      topProductsRaw,
      topSuppliersRaw,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { ...salesFilter, createdAt: range },
        _sum: { total: true, stampDuty: true, totalRefunded: true, paidAmount: true, remainingAmount: true },
        _count: true,
      }),
      this.prisma.sale.aggregate({
        where: { ...salesFilter, createdAt: prevRange },
        _sum: { total: true, stampDuty: true, totalRefunded: true },
        _count: true,
      }),
      this.prisma.purchase.aggregate({
        where: { ...purchasesFilter, createdAt: range },
        _sum: { total: true, stampDuty: true, remainingAmount: true, paidAmount: true },
        _count: true,
      }),
      this.prisma.purchase.aggregate({
        where: { ...purchasesFilter, createdAt: prevRange },
        _sum: { total: true, stampDuty: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: {
          type: PaymentType.CUSTOMER_PAYMENT,
          cashImpactDone: true,
          deletedAt: null,
          createdAt: range,
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          type: PaymentType.SUPPLIER_PAYMENT,
          cashImpactDone: true,
          deletedAt: null,
          createdAt: range,
        },
        _sum: { amount: true },
      }),
      this.prisma.caisseMovement.aggregate({
        where: {
          type: { in: [CaisseMovementType.RETRAIT_MANUEL, CaisseMovementType.DEPENSE_GENERALE] },
          clearedAt: null,
          createdAt: range,
        },
        _sum: { montant: true },
      }),
      this.prisma.creditNote.aggregate({
        where: { statut: { not: 'CANCELLED' }, dateAvoir: range },
        _sum: { total: true, stampDuty: true, montantRembourse: true },
        _count: true,
      }),
      this.prisma.sale.count({
        where: { documentType: DocumentType.DEVIS, deletedAt: null, createdAt: range },
      }),
      this.prisma.sale.count({
        where: { documentType: DocumentType.BON_COMMANDE, deletedAt: null, createdAt: range },
      }),
      this.prisma.sale.count({
        where: { documentType: DocumentType.BON_LIVRAISON, deletedAt: null, createdAt: range },
      }),
      this.prisma.sale.count({
        where: { documentType: DocumentType.FACTURE, deletedAt: null, createdAt: range },
      }),
      this.prisma.sale.count({
        where: { status: SaleStatus.CANCELLED, deletedAt: null, createdAt: range },
      }),
      this.prisma.caisseConfig.findFirst(),
      this.prisma.product.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          reference: true,
          sku: true,
          quantity: true,
          minStock: true,
          purchasePrice: true,
          salePrice: true,
          category: { select: { name: true } },
          brand: { select: { name: true } },
        },
      }),
      this.prisma.stockMovement.aggregate({
        where: { type: { in: STOCK_ENTRY_TYPES }, createdAt: range },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.aggregate({
        where: { type: { in: STOCK_EXIT_TYPES }, createdAt: range },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.count({ where: { createdAt: range } }),
      this.prisma.sale.count({
        where: { ...salesFilter, paymentStatus: PaymentStatus.PAID, createdAt: range },
      }),
      this.prisma.sale.count({
        where: { ...salesFilter, paymentStatus: PaymentStatus.PARTIAL, createdAt: range },
      }),
      this.prisma.sale.count({
        where: { ...salesFilter, paymentStatus: PaymentStatus.UNPAID, createdAt: range },
      }),
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where: {
          sale: {
            ...salesFilter,
            createdAt: range,
          },
        },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
      this.prisma.purchase.groupBy({
        by: ['supplierId'],
        where: { ...purchasesFilter, createdAt: range },
        _sum: { total: true, stampDuty: true, remainingAmount: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
    ]);

    // ── Hydrate top products ───────────────────────────────────────────────────
    const [topProductDetails, topClientSales, supplierDetails] =
      await Promise.all([
        this.prisma.product.findMany({
          where: { id: { in: topProductsRaw.map((r) => r.productId) } },
          select: {
            id: true,
            name: true,
            reference: true,
            category: { select: { name: true } },
          },
        }),
        this.prisma.sale.groupBy({
          by: ['customerId'],
          where: { ...salesFilter, customerId: { not: null }, createdAt: range },
          _sum: { total: true, stampDuty: true, totalRefunded: true, remainingAmount: true },
          orderBy: { _sum: { total: 'desc' } },
          take: 10,
        }),
        this.prisma.supplier.findMany({
          where: { id: { in: topSuppliersRaw.map((s) => s.supplierId) } },
          select: { id: true, name: true },
        }),
      ]);

    const topClientIds = topClientSales
      .map((s) => s.customerId)
      .filter((id): id is string => id != null);
    const topClientDetails = await this.prisma.customer.findMany({
      where: { id: { in: topClientIds } },
      select: { id: true, name: true, reference: true },
    });

    // ── Time-series ───────────────────────────────────────────────────────────
    const series = await this.buildTimeSeries(buckets, salesFilter, purchasesFilter);
    const analytics = await this.computeFinancialAnalytics(range, prevRange, salesFilter);

    // ── Scalar KPIs ───────────────────────────────────────────────────────────
    const caNet = analytics.summary.netRevenueHT;
    const prevCaNet = analytics.previous.netRevenueHT;
    const totalAchats = num(purchasesAgg._sum.total) + num(purchasesAgg._sum.stampDuty);
    const panierMoyen = salesAgg._count > 0 ? caNet / salesAgg._count : 0;

    // Stock value (all active products)
    const stockValue = stockProducts.reduce(
      (acc, p) => ({
        purchaseValue: acc.purchaseValue + p.quantity * num(p.purchasePrice),
        saleValue: acc.saleValue + p.quantity * num(p.salePrice),
      }),
      { purchaseValue: 0, saleValue: 0 },
    );

    // Stock by category
    const catMap = new Map<
      string,
      { name: string; purchaseValue: number; saleValue: number; count: number }
    >();
    for (const p of stockProducts) {
      const cat = p.category?.name ?? 'Autre';
      const entry = catMap.get(cat) ?? {
        name: cat,
        purchaseValue: 0,
        saleValue: 0,
        count: 0,
      };
      entry.purchaseValue += p.quantity * num(p.purchasePrice);
      entry.saleValue += p.quantity * num(p.salePrice);
      entry.count++;
      catMap.set(cat, entry);
    }
    const stockByCategory = Array.from(catMap.values())
      .sort((a, b) => b.saleValue - a.saleValue)
      .slice(0, 10);

    // Critical products (derived from stockProducts — no extra query)
    const criticalProducts = stockProducts
      .filter((p) => p.quantity <= 0 || p.quantity <= p.minStock)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 20);

    const ruptureCount = stockProducts.filter((p) => p.quantity <= 0).length;
    const lowStockCount = stockProducts.filter(
      (p) => p.quantity > 0 && p.quantity <= p.minStock,
    ).length;

    // Maps for hydration
    const prodById = new Map(topProductDetails.map((p) => [p.id, p]));
    const clientById = new Map(topClientDetails.map((c) => [c.id, c]));
    const supplierById = new Map(supplierDetails.map((s) => [s.id, s]));

    const benefice = analytics.summary.netProfit;
    const marge = analytics.summary.markupOnRevenue;

    return {
      period,
      range: { from: range.gte.toISOString(), to: range.lte.toISOString() },

      financier: {
        ...analytics.summary,
        caNet: +caNet.toFixed(3),
        caGross: +analytics.summary.grossRevenueHT.toFixed(3),
        caTrend: trend(caNet, prevCaNet),
        encaissementsClients: +num(customerPaymentsAgg._sum.amount).toFixed(3),
        impayesClients: +analytics.summary.customerOutstanding.toFixed(3),
        totalAchats: +totalAchats.toFixed(3),
        achatsTrend: trend(totalAchats, num(prevPurchasesAgg._sum.total) + num(prevPurchasesAgg._sum.stampDuty)),
        paiementsFournisseurs: +num(supplierPaymentsAgg._sum.amount).toFixed(3),
        impayesFournisseurs: +analytics.summary.supplierOutstanding.toFixed(3),
        depenses: +analytics.summary.operatingExpenses.toFixed(3),
        beneficeEstime: +benefice.toFixed(3),
        margePercent: marge,
        soldeCaisse: +num(caisseConfig?.solde).toFixed(3),
        soldeBanque: +num(caisseConfig?.soldeBanque).toFixed(3),
        soldeGlobal: +(num(caisseConfig?.solde) + num(caisseConfig?.soldeBanque)).toFixed(3),
      },

      ventes: {
        count: salesAgg._count,
        prevCount: prevSalesAgg._count,
        countTrend: trend(salesAgg._count, prevSalesAgg._count),
        panierMoyen: +panierMoyen.toFixed(3),
        devisCount,
        bonCommandeCount,
        blCount,
        factureCount,
        cancelledCount,
        parStatutPaiement: {
          paye: paidSalesCount,
          partiel: partialSalesCount,
          impaye: unpaidSalesCount,
        },
        avoirs: {
          count: avoirsAgg._count,
          total: +(num(avoirsAgg._sum.total) + num(avoirsAgg._sum.stampDuty)).toFixed(3),
          montantRembourse: +num(avoirsAgg._sum.montantRembourse).toFixed(3),
        },
      },

      achats: {
        count: purchasesAgg._count,
        prevCount: prevPurchasesAgg._count,
        countTrend: trend(purchasesAgg._count, prevPurchasesAgg._count),
      },

      stock: {
        valeurAchat: +stockValue.purchaseValue.toFixed(3),
        valeurVente: +stockValue.saleValue.toFixed(3),
        totalProduits: stockProducts.length,
        ruptureCount,
        lowStockCount,
        totalQuantite: stockProducts.reduce((a, p) => a + p.quantity, 0),
        mouvements: {
          entries: num(stockEntries._sum.quantity),
          exits: num(stockExits._sum.quantity),
          total: stockMovementsCount,
        },
        produitsCritiques: criticalProducts.map((p) => ({
          id: p.id,
          name: p.name,
          reference: p.reference,
          sku: p.sku,
          quantity: p.quantity,
          minStock: p.minStock,
          category: p.category?.name ?? null,
          brand: p.brand?.name ?? null,
          statut: (p.quantity <= 0 ? 'rupture' : 'faible') as 'rupture' | 'faible',
        })),
        parCategorie: stockByCategory,
      },

      clients: { total: await this.prisma.customer.count({ where: { deletedAt: null } }) },

      topProduits: topProductsRaw.map((item) => ({
        product: prodById.get(item.productId) ?? null,
        quantitySold: num(item._sum.quantity),
        revenue: +num(item._sum.total).toFixed(3),
      })),
      profitParVente: analytics.profitBySale,
      profitParProduit: analytics.profitByProduct,
      profitParClient: analytics.profitByCustomer,

      topClients: topClientSales.map((item) => ({
        customer: clientById.get(item.customerId!) ?? null,
        ca: +(num(item._sum.total) + num(item._sum.stampDuty) - num(item._sum.totalRefunded)).toFixed(3),
        impaye: +num(item._sum.remainingAmount).toFixed(3),
      })),

      topFournisseurs: topSuppliersRaw.map((item) => ({
        supplier: supplierById.get(item.supplierId) ?? null,
        totalAchats: +(num(item._sum.total) + num(item._sum.stampDuty)).toFixed(3),
        impaye: +num(item._sum.remainingAmount).toFixed(3),
      })),

      series,
    };
  }

  private async buildTimeSeries(
    buckets: TimeBucket[],
    salesFilter: Record<string, unknown>,
    purchasesFilter: Record<string, unknown>,
  ) {
    return Promise.all(
      buckets.map(async (bucket) => {
        const range = { gte: bucket.start, lte: bucket.end };
        const [s, p, enc, dep] = await Promise.all([
          this.prisma.sale.aggregate({
            where: { ...salesFilter, createdAt: range },
            _sum: { total: true, stampDuty: true, totalRefunded: true },
          }),
          this.prisma.purchase.aggregate({
            where: { ...purchasesFilter, createdAt: range },
            _sum: { total: true, stampDuty: true },
          }),
          this.prisma.payment.aggregate({
            where: {
              type: PaymentType.CUSTOMER_PAYMENT,
              cashImpactDone: true,
              deletedAt: null,
              createdAt: range,
            },
            _sum: { amount: true },
          }),
          this.prisma.caisseMovement.aggregate({
            where: {
              type: { in: [CaisseMovementType.RETRAIT_MANUEL, CaisseMovementType.DEPENSE_GENERALE] },
              clearedAt: null,
              createdAt: range,
            },
            _sum: { montant: true },
          }),
        ]);

        const ca = num(s._sum.total) + num(s._sum.stampDuty) - num(s._sum.totalRefunded);
        const achats = num(p._sum.total) + num(p._sum.stampDuty);
        return {
          label: bucket.label,
          ca: +ca.toFixed(3),
          achats: +achats.toFixed(3),
          encaissements: +num(enc._sum.amount).toFixed(3),
          depenses: +num(dep._sum.montant).toFixed(3),
          benefice: +(ca - achats).toFixed(3),
        };
      }),
    );
  }

  private async computeFinancialAnalytics(
    range: { gte: Date; lte: Date },
    prevRange: { gte: Date; lte: Date },
    salesFilter: Record<string, unknown>,
  ) {
    const build = async (dateRange: { gte: Date; lte: Date }) => {
      const [
        sales,
        creditNotes,
        customerPayments,
        supplierOutstanding,
        operatingExpenses,
      ] = await Promise.all([
        this.prisma.sale.findMany({
          where: { ...salesFilter, createdAt: dateRange },
          include: {
            customer: { select: { id: true, name: true, reference: true } },
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    reference: true,
                    name: true,
                    quantity: true,
                    purchasePrice: true,
                    category: { select: { name: true } },
                    brand: { select: { name: true } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.creditNote.findMany({
          where: {
            statut: { not: CreditNoteStatus.CANCELLED },
            dateAvoir: dateRange,
          },
          include: {
            items: {
              include: {
                saleItem: {
                  select: {
                    unitPurchaseCostHTSnapshot: true,
                    product: { select: { purchasePrice: true } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.payment.aggregate({
          where: {
            type: PaymentType.CUSTOMER_PAYMENT,
            cashImpactDone: true,
            deletedAt: null,
            createdAt: dateRange,
          },
          _sum: { amount: true },
        }),
        this.prisma.purchase.aggregate({
          where: {
            status: { notIn: [PurchaseStatus.CANCELLED] },
            deletedAt: null,
          },
          _sum: { remainingAmount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            status: ExpenseStatus.ACTIVE,
            expenseDate: dateRange,
          },
          _sum: { amount: true },
        }),
      ]);

      const saleRows = sales.map((sale) => {
        let quantitySold = 0;
        let grossRevenueHT = 0;
        let netRevenueHT = 0;
        let discountsHT = 0;
        let cogsHT = 0;
        let hasEstimatedCost = false;

        for (const item of sale.items) {
          const quantity = item.quantity;
          const unitGrossHT = num(item.unitPrice);
          const lineNetHT = num(item.total);
          const snapshot = item.unitPurchaseCostHTSnapshot;
          const unitCost = snapshot == null
            ? num(item.product?.purchasePrice)
            : num(snapshot);

          quantitySold += quantity;
          grossRevenueHT += unitGrossHT * quantity;
          netRevenueHT += lineNetHT;
          discountsHT += Math.max(unitGrossHT * quantity - lineNetHT, 0);
          cogsHT += unitCost * quantity;
          hasEstimatedCost = hasEstimatedCost || snapshot == null;
        }

        const grossMarginHT = netRevenueHT - cogsHT;
        const paidAmount = num(sale.paidAmount);
        const remainingAmount = num(sale.remainingAmount);
        return {
          id: sale.id,
          date: sale.createdAt.toISOString(),
          reference: sale.invoiceNumber,
          client: sale.customer?.name ?? sale.counterClientFullName ?? 'Client comptoir',
          itemsCount: sale.items.length,
          quantitySold,
          netRevenueHT: this.round3(netRevenueHT),
          cogsHT: this.round3(cogsHT),
          grossMarginHT: this.round3(grossMarginHT),
          grossMarginRate: cogsHT > 0 ? this.round3((grossMarginHT / cogsHT) * 100) : 0,
          netProfit: this.round3(grossMarginHT),
          paymentStatus: sale.paymentStatus,
          paidAmount: this.round3(paidAmount),
          remainingAmount: this.round3(remainingAmount),
          hasEstimatedCost,
          grossRevenueHT,
          discountsHT,
          tax: num(sale.tax),
          stampDuty: num(sale.stampDuty),
          revenueTTC: num(sale.total) + num(sale.stampDuty),
        };
      });

      const creditNotesHT = creditNotes.reduce((sum, note) => sum + num(note.subtotal), 0);
      const creditNotesTTC = creditNotes.reduce(
        (sum, note) => sum + num(note.total) + num(note.stampDuty),
        0,
      );
      const returnedCOGS = creditNotes.reduce((sum, note) => {
        return sum + note.items.reduce((itemSum, item) => {
          const snapshot = item.saleItem?.unitPurchaseCostHTSnapshot;
          const unitCost = snapshot == null
            ? num(item.saleItem?.product?.purchasePrice)
            : num(snapshot);
          return itemSum + unitCost * item.quantiteRetournee;
        }, 0);
      }, 0);

      const grossRevenueHT = saleRows.reduce((sum, sale) => sum + sale.grossRevenueHT, 0);
      const revenueHTBeforeCreditNotes = saleRows.reduce((sum, sale) => sum + sale.netRevenueHT, 0);
      const discountsHT = saleRows.reduce((sum, sale) => sum + sale.discountsHT, 0);
      const vatCollected = saleRows.reduce((sum, sale) => sum + sale.tax, 0);
      const fiscalStampCollected = saleRows.reduce((sum, sale) => sum + sale.stampDuty, 0);
      const revenueTTC = saleRows.reduce((sum, sale) => sum + sale.revenueTTC, 0) - creditNotesTTC;
      const cogsHT = saleRows.reduce((sum, sale) => sum + sale.cogsHT, 0);
      const adjustedCOGS = Math.max(cogsHT - returnedCOGS, 0);
      const netRevenueHT = revenueHTBeforeCreditNotes - creditNotesHT;
      const grossMarginHT = netRevenueHT - adjustedCOGS;
      const operatingExpensesAmount = num(operatingExpenses._sum.amount);
      const netProfit = grossMarginHT - operatingExpensesAmount;
      const quantitySold = saleRows.reduce((sum, sale) => sum + sale.quantitySold, 0);
      const customerOutstanding = saleRows.reduce((sum, sale) => sum + sale.remainingAmount, 0);

      const productMap = new Map<string, {
        product: {
          id: string;
          reference: string;
          name: string;
          category: string | null;
          brand: string | null;
          stockActuel: number;
        };
        quantitySold: number;
        revenueHT: number;
        cogsHT: number;
        discountsHT: number;
        salesCount: Set<string>;
        hasEstimatedCost: boolean;
      }>();

      const clientMap = new Map<string, {
        customer: { id: string | null; name: string; reference: string | null };
        salesCount: number;
        revenueHT: number;
        grossMarginHT: number;
        paidAmount: number;
        outstanding: number;
        lastSale: string;
      }>();

      for (const sale of sales) {
        const clientKey = sale.customer?.id ?? `counter:${sale.counterClientFullName ?? sale.id}`;
        const clientEntry = clientMap.get(clientKey) ?? {
          customer: {
            id: sale.customer?.id ?? null,
            name: sale.customer?.name ?? sale.counterClientFullName ?? 'Client comptoir',
            reference: sale.customer?.reference ?? null,
          },
          salesCount: 0,
          revenueHT: 0,
          grossMarginHT: 0,
          paidAmount: 0,
          outstanding: 0,
          lastSale: sale.createdAt.toISOString(),
        };
        clientEntry.salesCount += 1;
        clientEntry.paidAmount += num(sale.paidAmount);
        clientEntry.outstanding += num(sale.remainingAmount);
        clientEntry.lastSale = sale.createdAt > new Date(clientEntry.lastSale)
          ? sale.createdAt.toISOString()
          : clientEntry.lastSale;

        for (const item of sale.items) {
          const unitGrossHT = num(item.unitPrice);
          const lineNetHT = num(item.total);
          const snapshot = item.unitPurchaseCostHTSnapshot;
          const unitCost = snapshot == null
            ? num(item.product?.purchasePrice)
            : num(snapshot);
          const lineCOGS = unitCost * item.quantity;
          const lineMargin = lineNetHT - lineCOGS;
          const productId = item.productId;
          const entry = productMap.get(productId) ?? {
            product: {
              id: productId,
              reference: item.product?.reference ?? '',
              name: item.designation ?? item.product?.name ?? 'Produit inconnu',
              category: item.product?.category?.name ?? null,
              brand: item.product?.brand?.name ?? null,
              stockActuel: item.product?.quantity ?? 0,
            },
            quantitySold: 0,
            revenueHT: 0,
            cogsHT: 0,
            discountsHT: 0,
            salesCount: new Set<string>(),
            hasEstimatedCost: false,
          };
          entry.quantitySold += item.quantity;
          entry.revenueHT += lineNetHT;
          entry.cogsHT += lineCOGS;
          entry.discountsHT += Math.max(unitGrossHT * item.quantity - lineNetHT, 0);
          entry.salesCount.add(sale.id);
          entry.hasEstimatedCost = entry.hasEstimatedCost || snapshot == null;
          productMap.set(productId, entry);

          clientEntry.revenueHT += lineNetHT;
          clientEntry.grossMarginHT += lineMargin;
        }
        clientMap.set(clientKey, clientEntry);
      }

      const profitByProduct = Array.from(productMap.values())
        .map((entry) => {
          const margin = entry.revenueHT - entry.cogsHT;
          const averageUnitMargin = entry.quantitySold > 0 ? margin / entry.quantitySold : 0;
          const marginRate = entry.cogsHT > 0 ? (margin / entry.cogsHT) * 100 : 0;
          const markupOnRevenue = entry.revenueHT > 0 ? (margin / entry.revenueHT) * 100 : 0;
          const profitability = entry.hasEstimatedCost
            ? 'cout_estime'
            : margin < 0
              ? 'vendu_a_perte'
              : markupOnRevenue < 10
                ? 'faible_marge'
                : markupOnRevenue < 25
                  ? 'rentable'
                  : 'tres_rentable';
          return {
            product: entry.product,
            quantitySold: entry.quantitySold,
            revenueHT: this.round3(entry.revenueHT),
            cogsHT: this.round3(entry.cogsHT),
            grossMarginHT: this.round3(margin),
            averageUnitMargin: this.round3(averageUnitMargin),
            grossMarginRate: this.round3(marginRate),
            averageSalePriceHT: this.round3(entry.quantitySold > 0 ? entry.revenueHT / entry.quantitySold : 0),
            averageDiscountHT: this.round3(entry.quantitySold > 0 ? entry.discountsHT / entry.quantitySold : 0),
            salesCount: entry.salesCount.size,
            profitability,
            hasEstimatedCost: entry.hasEstimatedCost,
          };
        })
        .sort((a, b) => b.grossMarginHT - a.grossMarginHT);

      const profitByCustomer = Array.from(clientMap.values())
        .map((entry) => ({
          customer: entry.customer,
          salesCount: entry.salesCount,
          revenueHT: this.round3(entry.revenueHT),
          grossMarginHT: this.round3(entry.grossMarginHT),
          netProfit: this.round3(entry.grossMarginHT),
          paidAmount: this.round3(entry.paidAmount),
          outstanding: this.round3(entry.outstanding),
          averageOrderValueHT: this.round3(entry.salesCount > 0 ? entry.revenueHT / entry.salesCount : 0),
          lastSale: entry.lastSale,
        }))
        .sort((a, b) => b.grossMarginHT - a.grossMarginHT);

      return {
        summary: {
          salesCount: sales.length,
          quantitySold,
          grossRevenueHT: this.round3(grossRevenueHT),
          discountsHT: this.round3(discountsHT),
          creditNotesHT: this.round3(creditNotesHT),
          netRevenueHT: this.round3(netRevenueHT),
          vatCollected: this.round3(vatCollected),
          fiscalStampCollected: this.round3(fiscalStampCollected),
          revenueTTC: this.round3(revenueTTC),
          cogsHT: this.round3(adjustedCOGS),
          grossMarginHT: this.round3(grossMarginHT),
          operatingExpenses: this.round3(operatingExpensesAmount),
          netProfit: this.round3(netProfit),
          grossMarginRate: adjustedCOGS > 0 ? this.round3((grossMarginHT / adjustedCOGS) * 100) : 0,
          markupOnRevenue: netRevenueHT > 0 ? this.round3((grossMarginHT / netRevenueHT) * 100) : 0,
          netProfitRate: netRevenueHT > 0 ? this.round3((netProfit / netRevenueHT) * 100) : 0,
          averageOrderValueHT: sales.length > 0 ? this.round3(netRevenueHT / sales.length) : 0,
          averageProfitPerSale: sales.length > 0 ? this.round3(netProfit / sales.length) : 0,
          customerPayments: this.round3(num(customerPayments._sum.amount)),
          customerOutstanding: this.round3(customerOutstanding),
          supplierOutstanding: this.round3(num(supplierOutstanding._sum.remainingAmount)),
          estimatedCostLines: saleRows.filter((sale) => sale.hasEstimatedCost).length,
          hasEstimatedCosts: saleRows.some((sale) => sale.hasEstimatedCost),
        },
        profitBySale: saleRows
          .map(({ grossRevenueHT: _grossRevenueHT, discountsHT: _discountsHT, tax: _tax, stampDuty: _stampDuty, revenueTTC: _revenueTTC, ...sale }) => sale)
          .sort((a, b) => b.netProfit - a.netProfit),
        profitByProduct,
        profitByCustomer,
      };
    };

    const [current, previous] = await Promise.all([build(range), build(prevRange)]);
    return { ...current, previous: previous.summary };
  }

  // ─── Legacy endpoints ─────────────────────────────────────────────────────────

  async dashboard() {
    const [productsCount, lowStockList, customersCount, salesAggregate, unpaidSales] =
      await Promise.all([
        this.prisma.product.count({ where: { deletedAt: null, isActive: true } }),
        this.lowStockProducts(),
        this.prisma.customer.count(),
        this.prisma.sale.aggregate({
          where: {
            documentType: DocumentType.FACTURE,
            status: SaleStatus.COMPLETED,
            deletedAt: null,
          },
          _sum: { total: true, stampDuty: true, paidAmount: true },
          _count: true,
        }),
        this.prisma.sale.count({
          where: {
            documentType: DocumentType.FACTURE,
            paymentStatus: { not: PaymentStatus.PAID },
            status: { not: SaleStatus.CANCELLED },
            deletedAt: null,
          },
        }),
      ]);

    return {
      productsCount,
      lowStockCount: lowStockList.length,
      customersCount,
      salesCount: salesAggregate._count,
      salesTotal: num(salesAggregate._sum.total) + num(salesAggregate._sum.stampDuty),
      paidTotal: salesAggregate._sum.paidAmount ?? 0,
      unpaidSales,
    };
  }

  async stockValue() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { quantity: true, purchasePrice: true, salePrice: true },
    });
    return products.reduce(
      (acc, p) => ({
        purchaseValue: acc.purchaseValue + p.quantity * Number(p.purchasePrice),
        saleValue: acc.saleValue + p.quantity * Number(p.salePrice),
      }),
      { purchaseValue: 0, saleValue: 0 },
    );
  }

  async lowStockProducts() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      include: { category: true, brand: true },
      orderBy: { quantity: 'asc' },
    });
    return products.filter((p) => p.quantity <= p.minStock);
  }

  async topSellingProducts(limit = 10) {
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((item) => item.productId) } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return grouped.map((item) => ({
      product: byId.get(item.productId),
      quantity: item._sum.quantity ?? 0,
      total: item._sum.total ?? 0,
    }));
  }

  salesSummary() {
    return this.prisma.sale.aggregate({
      where: { status: SaleStatus.COMPLETED },
      _sum: {
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        paidAmount: true,
        remainingAmount: true,
      },
      _count: true,
    });
  }
}
