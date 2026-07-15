import { Injectable } from '@nestjs/common';
import {
  DocumentType,
  ExpenseStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  PurchaseStatus,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ReportOverviewQueryDto,
  ReportPeriod,
} from './dto/report-overview.dto';

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
      return { gte: new Date(today.getTime() - 7 * 86_400_000), lte: now };
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
        gte: new Date(Date.UTC(localNow.getUTCFullYear(), 0, 1) - TZ_OFFSET_MS),
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
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Jun',
  'Jul',
  'Aoû',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
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
        label: MONTHS_FR[m],
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

function moneyRound(value: Prisma.Decimal.Value): number {
  return new Prisma.Decimal(value)
    .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

function trend(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

// ─── Filters ──────────────────────────────────────────────────────────────────

const REVENUE_STATUSES = [
  SaleStatus.COMPLETED,
  SaleStatus.PARTIALLY_REFUNDED,
  SaleStatus.REFUNDED,
  SaleStatus.RETURNED,
];

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

  private async calculateFinancials(range: { gte: Date; lte: Date }) {
    const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
    const round = (value: Prisma.Decimal.Value) =>
      D(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    const where: Prisma.SaleWhereInput = {
      createdAt: range,
      deletedAt: null,
      status: { in: REVENUE_STATUSES },
      OR: [
        { documentType: DocumentType.FACTURE },
        { documentType: DocumentType.BON_LIVRAISON, transformedToId: null },
      ],
    };
    const [sales, creditNotes, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        select: {
          subtotal: true,
          items: {
            select: {
              quantity: true,
              unitPurchaseCostHt: true,
              purchaseCostEstimated: true,
            },
          },
        },
      }),
      this.prisma.creditNote.findMany({
        where: { dateAvoir: range, statut: { not: 'CANCELLED' } },
        select: {
          subtotal: true,
          items: {
            select: {
              quantiteRetournee: true,
              saleItem: { select: { unitPurchaseCostHt: true } },
            },
          },
        },
      }),
      this.prisma.expense.aggregate({
        where: { expenseDate: range, status: ExpenseStatus.ACTIVE },
        _sum: { amount: true },
      }),
    ]);

    let grossRevenueHt = D(0);
    let cogsHt = D(0);
    let unknownCostLines = 0;
    let estimatedCostLines = 0;
    for (const sale of sales) {
      grossRevenueHt = grossRevenueHt.plus(sale.subtotal);
      for (const item of sale.items) {
        if (item.unitPurchaseCostHt == null) unknownCostLines += 1;
        else
          cogsHt = cogsHt.plus(D(item.unitPurchaseCostHt).mul(item.quantity));
        if (item.purchaseCostEstimated) estimatedCostLines += 1;
      }
    }

    let creditsHt = D(0);
    let returnedCogsHt = D(0);
    for (const creditNote of creditNotes) {
      creditsHt = creditsHt.plus(creditNote.subtotal);
      for (const item of creditNote.items) {
        const cost = item.saleItem?.unitPurchaseCostHt;
        if (cost != null)
          returnedCogsHt = returnedCogsHt.plus(
            D(cost).mul(item.quantiteRetournee),
          );
      }
    }

    const netRevenueHt = grossRevenueHt.minus(creditsHt);
    const netCogsHt = Prisma.Decimal.max(cogsHt.minus(returnedCogsHt), D(0));
    const grossMarginHt = netRevenueHt.minus(netCogsHt);
    const expenseTotal = D(expenses._sum.amount ?? 0);
    const netProfit = grossMarginHt.minus(expenseTotal);
    return {
      salesCount: sales.length,
      grossRevenueHt: round(grossRevenueHt),
      creditNotesHt: round(creditsHt),
      netRevenueHt: round(netRevenueHt),
      cogsHt: round(netCogsHt),
      returnedCogsHt: round(returnedCogsHt),
      grossMarginHt: round(grossMarginHt),
      expenses: round(expenseTotal),
      netProfit: round(netProfit),
      grossMarginRateOnRevenue: netRevenueHt.gt(0)
        ? round(grossMarginHt.div(netRevenueHt).mul(100))
        : 0,
      dataQuality: {
        unknownCostLines,
        estimatedCostLines,
        complete: unknownCostLines === 0,
      },
    };
  }

  async getOverview(query: ReportOverviewQueryDto) {
    const period = query.period ?? 'month';
    const range = resolveReportDateRange(period, query.dateFrom, query.dateTo);
    const prevRange = getPrevRange(range);
    const buckets = buildTimeBuckets(period, range);

    const salesFilter = {
      status: { in: REVENUE_STATUSES },
      deletedAt: null,
      OR: [
        { documentType: DocumentType.FACTURE },
        { documentType: DocumentType.BON_LIVRAISON, transformedToId: null },
      ],
    };

    const purchasesFilter = {
      status: { notIn: [PurchaseStatus.CANCELLED] },
      documentType: { not: 'BON_COMMANDE' as const },
      deletedAt: null,
    };

    const [
      salesAgg,
      prevSalesAgg,
      purchasesAgg,
      prevPurchasesAgg,
      customerPaymentsAgg,
      supplierPaymentsAgg,
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
        _sum: {
          total: true,
          stampDuty: true,
          totalRefunded: true,
          paidAmount: true,
          remainingAmount: true,
        },
        _count: true,
      }),
      this.prisma.sale.aggregate({
        where: { ...salesFilter, createdAt: prevRange },
        _sum: { total: true, stampDuty: true, totalRefunded: true },
        _count: true,
      }),
      this.prisma.purchase.aggregate({
        where: { ...purchasesFilter, createdAt: range },
        _sum: {
          total: true,
          stampDuty: true,
          remainingAmount: true,
          paidAmount: true,
        },
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
      this.prisma.creditNote.aggregate({
        where: { statut: { not: 'CANCELLED' }, dateAvoir: range },
        _sum: { total: true, stampDuty: true, montantRembourse: true },
        _count: true,
      }),
      this.prisma.sale.count({
        where: {
          documentType: DocumentType.DEVIS,
          deletedAt: null,
          createdAt: range,
        },
      }),
      this.prisma.sale.count({
        where: {
          documentType: DocumentType.BON_COMMANDE,
          deletedAt: null,
          createdAt: range,
        },
      }),
      this.prisma.sale.count({
        where: {
          documentType: DocumentType.BON_LIVRAISON,
          deletedAt: null,
          createdAt: range,
        },
      }),
      this.prisma.sale.count({
        where: {
          documentType: DocumentType.FACTURE,
          deletedAt: null,
          createdAt: range,
        },
      }),
      this.prisma.sale.count({
        where: {
          status: SaleStatus.CANCELLED,
          deletedAt: null,
          createdAt: range,
        },
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
        where: {
          ...salesFilter,
          paymentStatus: PaymentStatus.PAID,
          createdAt: range,
        },
      }),
      this.prisma.sale.count({
        where: {
          ...salesFilter,
          paymentStatus: PaymentStatus.PARTIAL,
          createdAt: range,
        },
      }),
      this.prisma.sale.count({
        where: {
          ...salesFilter,
          paymentStatus: PaymentStatus.UNPAID,
          createdAt: range,
        },
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
          where: {
            ...salesFilter,
            customerId: { not: null },
            createdAt: range,
          },
          _sum: {
            total: true,
            stampDuty: true,
            totalRefunded: true,
            remainingAmount: true,
          },
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

    const [financials, previousFinancials] = await Promise.all([
      this.calculateFinancials(range),
      this.calculateFinancials(prevRange),
    ]);

    // ── Time-series ───────────────────────────────────────────────────────────
    const series = await this.buildTimeSeries(buckets, purchasesFilter);

    // ── Scalar KPIs ───────────────────────────────────────────────────────────
    const caNet = financials.netRevenueHt;
    const prevCaNet = previousFinancials.netRevenueHt;
    const totalAchats =
      num(purchasesAgg._sum.total) + num(purchasesAgg._sum.stampDuty);
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

    const benefice = financials.netProfit;
    const marge = financials.grossMarginRateOnRevenue;

    return {
      period,
      range: { from: range.gte.toISOString(), to: range.lte.toISOString() },

      financier: {
        caNet,
        caGross: financials.grossRevenueHt,
        caTrend: trend(caNet, prevCaNet),
        encaissementsClients: moneyRound(num(customerPaymentsAgg._sum.amount)),
        impayesClients: moneyRound(num(salesAgg._sum.remainingAmount)),
        totalAchats: moneyRound(totalAchats),
        achatsTrend: trend(
          totalAchats,
          num(prevPurchasesAgg._sum.total) +
            num(prevPurchasesAgg._sum.stampDuty),
        ),
        paiementsFournisseurs: moneyRound(num(supplierPaymentsAgg._sum.amount)),
        impayesFournisseurs: moneyRound(num(purchasesAgg._sum.remainingAmount)),
        depenses: financials.expenses,
        coutProduitsVendus: financials.cogsHt,
        margeBruteReelle: financials.grossMarginHt,
        beneficeEstime: benefice,
        margePercent: marge,
        dataQuality: financials.dataQuality,
        soldeCaisse: moneyRound(num(caisseConfig?.solde)),
        soldeBanque: moneyRound(num(caisseConfig?.soldeBanque)),
        soldeGlobal: moneyRound(
          num(caisseConfig?.solde) + num(caisseConfig?.soldeBanque),
        ),
      },

      ventes: {
        count: salesAgg._count,
        prevCount: prevSalesAgg._count,
        countTrend: trend(salesAgg._count, prevSalesAgg._count),
        panierMoyen: moneyRound(panierMoyen),
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
          total: moneyRound(
            num(avoirsAgg._sum.total) + num(avoirsAgg._sum.stampDuty),
          ),
          montantRembourse: moneyRound(num(avoirsAgg._sum.montantRembourse)),
        },
      },

      achats: {
        count: purchasesAgg._count,
        prevCount: prevPurchasesAgg._count,
        countTrend: trend(purchasesAgg._count, prevPurchasesAgg._count),
      },

      stock: {
        valeurAchat: moneyRound(stockValue.purchaseValue),
        valeurVente: moneyRound(stockValue.saleValue),
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
          statut: p.quantity <= 0 ? 'rupture' : 'faible',
        })),
        parCategorie: stockByCategory,
      },

      clients: {
        total: await this.prisma.customer.count({ where: { deletedAt: null } }),
      },

      topProduits: topProductsRaw.map((item) => ({
        product: prodById.get(item.productId) ?? null,
        quantitySold: num(item._sum.quantity),
        revenue: moneyRound(num(item._sum.total)),
      })),

      topClients: topClientSales.map((item) => ({
        customer: clientById.get(item.customerId!) ?? null,
        ca: moneyRound(
          num(item._sum.total) +
            num(item._sum.stampDuty) -
            num(item._sum.totalRefunded),
        ),
        impaye: moneyRound(num(item._sum.remainingAmount)),
      })),

      topFournisseurs: topSuppliersRaw.map((item) => ({
        supplier: supplierById.get(item.supplierId) ?? null,
        totalAchats: moneyRound(
          num(item._sum.total) + num(item._sum.stampDuty),
        ),
        impaye: moneyRound(num(item._sum.remainingAmount)),
      })),

      series,
    };
  }

  private async buildTimeSeries(
    buckets: TimeBucket[],
    purchasesFilter: Record<string, unknown>,
  ) {
    return Promise.all(
      buckets.map(async (bucket) => {
        const range = { gte: bucket.start, lte: bucket.end };
        const [p, enc, financials] = await Promise.all([
          this.prisma.purchase.aggregate({
            where: { ...purchasesFilter, createdAt: range },
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
          this.calculateFinancials(range),
        ]);

        const ca = financials.netRevenueHt;
        const achats = num(p._sum.total) + num(p._sum.stampDuty);
        return {
          label: bucket.label,
          ca,
          achats: new Prisma.Decimal(achats).toDecimalPlaces(3).toNumber(),
          encaissements: new Prisma.Decimal(num(enc._sum.amount))
            .toDecimalPlaces(3)
            .toNumber(),
          depenses: financials.expenses,
          benefice: financials.netProfit,
          margeBrute: financials.grossMarginHt,
          ventes: financials.salesCount,
          achatsCount: p._count,
        };
      }),
    );
  }

  // ─── Legacy endpoints ─────────────────────────────────────────────────────────

  async dashboard(query: ReportOverviewQueryDto = {}) {
    const overview = await this.getOverview(query);
    const range = {
      gte: new Date(overview.range.from),
      lte: new Date(overview.range.to),
    };
    const [pendingCustomerOrders, pendingSupplierReceipts] = await Promise.all([
      this.prisma.sale.count({
        where: {
          documentType: DocumentType.BON_COMMANDE,
          status: SaleStatus.DRAFT,
          deletedAt: null,
          createdAt: range,
        },
      }),
      this.prisma.purchase.count({
        where: {
          documentType: 'BON_COMMANDE',
          status: {
            in: [PurchaseStatus.ORDERED, PurchaseStatus.PARTIALLY_RECEIVED],
          },
          deletedAt: null,
          createdAt: range,
        },
      }),
    ]);
    return {
      period: overview.period,
      range: overview.range,
      ventes: overview.ventes,
      achats: overview.achats,
      stock: overview.stock,
      topProduits: overview.topProduits,
      series: overview.series,
      pendingCustomerOrders,
      pendingSupplierReceipts,
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
