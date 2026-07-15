import { BadRequestException, Injectable } from '@nestjs/common';
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
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type {
  ReportFilterOption,
  ReportFilterQueryDto,
} from './dto/report-filter-query.dto';
import {
  financialRates,
  revenueRecognizedSaleWhere,
} from './reports-financial.utils';

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
    if (start > end)
      throw new BadRequestException(
        'La date de début doit précéder la date de fin',
      );
    if (end.getTime() - start.getTime() > 2 * 366 * 86_400_000)
      throw new BadRequestException(
        'La période personnalisée est limitée à deux ans',
      );
    return { gte: start, lte: end };
  }

  switch (period) {
    case 'today':
      return { gte: today, lte: new Date(today.getTime() + 86_400_000 - 1) };
    case 'yesterday': {
      const yesterday = new Date(today.getTime() - 86_400_000);
      return { gte: yesterday, lte: new Date(today.getTime() - 1) };
    }
    case 'last7':
      return { gte: new Date(today.getTime() - 6 * 86_400_000), lte: now };
    case 'week':
      return {
        gte: new Date(
          today.getTime() - ((localNow.getUTCDay() + 6) % 7) * 86_400_000,
        ),
        lte: now,
      };
    case 'last30':
      return { gte: new Date(today.getTime() - 29 * 86_400_000), lte: now };
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
    case 'quarter': {
      const quarterMonth = Math.floor(localNow.getUTCMonth() / 3) * 3;
      return {
        gte: new Date(
          Date.UTC(localNow.getUTCFullYear(), quarterMonth, 1) - TZ_OFFSET_MS,
        ),
        lte: now,
      };
    }
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
  const lte = new Date(range.gte.getTime() - 1);
  return {
    gte: new Date(lte.getTime() - durationMs),
    lte,
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

  async filterProducts(
    query: ReportFilterQueryDto,
  ): Promise<ReportFilterOption[]> {
    const search = query.search?.trim();
    if (!search || search.length < 2) return [];
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(query.categoryId && { categoryId: query.categoryId }),
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
          { idProduct: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, reference: true, categoryId: true },
      orderBy: [{ name: 'asc' }, { reference: 'asc' }],
      take: query.limit,
    });
    return products.map((product) => ({
      id: product.id,
      label: product.name,
      secondaryLabel: `Réf. ${product.reference}`,
      categoryId: product.categoryId,
    }));
  }

  async filterClients(
    query: ReportFilterQueryDto,
  ): Promise<ReportFilterOption[]> {
    const search = query.search?.trim();
    if (!search || search.length < 2) return [];
    const clients = await this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { taxNumber: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        taxNumber: true,
        reference: true,
      },
      orderBy: { name: 'asc' },
      take: query.limit,
    });
    return clients.map((client) => ({
      id: client.id,
      label: client.name,
      secondaryLabel: [
        client.phone,
        client.taxNumber && `MF ${client.taxNumber}`,
        client.reference,
      ]
        .filter(Boolean)
        .join(' · '),
    }));
  }

  async filterCategories(
    query: ReportFilterQueryDto,
  ): Promise<ReportFilterOption[]> {
    const search = query.search?.trim();
    const categories = await this.prisma.category.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: query.limit,
    });
    return categories.map((category) => ({
      id: category.id,
      label: category.name,
    }));
  }

  async filterSellers(
    query: ReportFilterQueryDto,
  ): Promise<ReportFilterOption[]> {
    const search = query.search?.trim();
    if (!search || search.length < 2) return [];
    const sellers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { name: { in: ['SELLER', 'CASHIER'] } },
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
      take: query.limit,
    });
    return sellers.map((seller) => ({
      id: seller.id,
      label: seller.fullName,
      secondaryLabel: `${seller.email} · ${seller.role.name === 'CASHIER' ? 'Caissier' : 'Vendeur'}`,
    }));
  }

  private saleFilter(query: ReportOverviewQueryDto): Prisma.SaleWhereInput {
    return {
      ...revenueRecognizedSaleWhere(),
      ...(query.sellerId && { sellerId: query.sellerId }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.documentType && { documentType: query.documentType }),
      ...(query.paymentStatus && { paymentStatus: query.paymentStatus }),
      ...((query.productId || query.categoryId) && {
        items: {
          some: {
            ...(query.productId && { productId: query.productId }),
            ...(query.categoryId && {
              product: { categoryId: query.categoryId },
            }),
          },
        },
      }),
    };
  }

  private customerPaymentFilter(
    query: ReportOverviewQueryDto,
  ): Prisma.PaymentWhereInput {
    const hasSaleFilter = !!(
      query.sellerId ||
      query.customerId ||
      query.productId ||
      query.categoryId ||
      query.documentType ||
      query.paymentStatus
    );
    return {
      type: PaymentType.CUSTOMER_PAYMENT,
      cashImpactDone: true,
      deletedAt: null,
      ...(hasSaleFilter && { sale: this.saleFilter(query) }),
    };
  }

  /**
   * Source unique de vérité pour la marge commerciale reconnue.
   *
   * Les ventes sont reconnues à leur date de création et les avoirs à leur
   * date d'avoir. Les coûts proviennent exclusivement du snapshot de la ligne
   * de vente (`unitPurchaseCostHt`) : le prix d'achat courant du produit n'est
   * jamais utilisé pour réécrire l'historique.
   */
  async getSalesProfitForPeriod(
    range: { gte: Date; lte: Date },
    query: ReportOverviewQueryDto = {},
  ) {
    const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
    const round = (value: Prisma.Decimal.Value) =>
      D(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    const where: Prisma.SaleWhereInput = {
      ...this.saleFilter(query),
      createdAt: range,
    };
    const [sales, creditNotes, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        select: {
          subtotal: true,
          discount: true,
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
        where: {
          dateAvoir: range,
          statut: { not: 'CANCELLED' },
          sale: this.saleFilter(query),
        },
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
    let discountsHt = D(0);
    let quantitySold = 0;
    let unknownCostLines = 0;
    let estimatedCostLines = 0;
    for (const sale of sales) {
      grossRevenueHt = grossRevenueHt.plus(sale.subtotal);
      discountsHt = discountsHt.plus(sale.discount ?? 0);
      for (const item of sale.items) {
        quantitySold += item.quantity;
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
    const netCogsHt = cogsHt.minus(returnedCogsHt);
    const grossMarginHt = netRevenueHt.minus(netCogsHt);
    const expenseTotal = D(expenses._sum.amount ?? 0);
    const netProfit = grossMarginHt.minus(expenseTotal);
    const rates = financialRates(netRevenueHt, netCogsHt, grossMarginHt);
    return {
      // Noms explicites utilisés par les consommateurs hors rapports.
      netRevenueHt: round(netRevenueHt),
      costOfGoodsSold: round(netCogsHt),
      grossProfit: round(grossMarginHt),
      creditNoteImpact: round(creditsHt),
      saleCount: sales.length,

      // Champs historiques du rapport, alimentés par les mêmes décimaux.
      salesCount: sales.length,
      quantitySold,
      discountsHt: round(discountsHt),
      grossRevenueHt: round(grossRevenueHt),
      creditNotesHt: round(creditsHt),
      cogsHt: round(netCogsHt),
      returnedCogsHt: round(returnedCogsHt),
      grossMarginHt: round(grossMarginHt),
      expenses: round(expenseTotal),
      netProfit: round(netProfit),
      grossMarginRateOnRevenue: netRevenueHt.gt(0)
        ? round(rates.markupRateOnRevenue)
        : 0,
      marginRateOnCost: netCogsHt.isZero() ? 0 : round(rates.marginRateOnCost),
      dataQuality: {
        unknownCostLines,
        estimatedCostLines,
        complete: unknownCostLines === 0,
      },
    };
  }

  /** @deprecated Utiliser getSalesProfitForPeriod. */
  private calculateFinancials(
    range: { gte: Date; lte: Date },
    query: ReportOverviewQueryDto = {},
  ) {
    return this.getSalesProfitForPeriod(range, query);
  }

  private async productPerformance(
    range: { gte: Date; lte: Date },
    query: ReportOverviewQueryDto,
  ) {
    const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
    const [lines, returns] = await Promise.all([
      this.prisma.saleItem.findMany({
        where: { sale: { ...this.saleFilter(query), createdAt: range } },
        select: {
          productId: true,
          quantity: true,
          total: true,
          unitPurchaseCostHt: true,
          product: {
            select: {
              name: true,
              reference: true,
              category: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.creditNoteItem.findMany({
        where: {
          creditNote: {
            dateAvoir: range,
            statut: { not: 'CANCELLED' },
            sale: this.saleFilter(query),
          },
        },
        select: {
          productId: true,
          quantiteRetournee: true,
          totalHt: true,
          saleItem: { select: { unitPurchaseCostHt: true } },
        },
      }),
    ]);
    const map = new Map<
      string,
      {
        product: (typeof lines)[number]['product'];
        quantity: number;
        revenue: Prisma.Decimal;
        cost: Prisma.Decimal;
      }
    >();
    for (const line of lines) {
      const entry = map.get(line.productId) ?? {
        product: line.product,
        quantity: 0,
        revenue: D(0),
        cost: D(0),
      };
      entry.quantity += line.quantity;
      entry.revenue = entry.revenue.plus(line.total);
      entry.cost = entry.cost.plus(
        D(line.unitPurchaseCostHt ?? 0).mul(line.quantity),
      );
      map.set(line.productId, entry);
    }
    for (const item of returns) {
      const entry = map.get(item.productId);
      if (!entry) continue;
      entry.quantity -= item.quantiteRetournee;
      entry.revenue = entry.revenue.minus(item.totalHt);
      entry.cost = entry.cost.minus(
        D(item.saleItem?.unitPurchaseCostHt ?? 0).mul(item.quantiteRetournee),
      );
    }
    return [...map.entries()]
      .map(([productId, entry]) => {
        const profit = entry.revenue.minus(entry.cost);
        return {
          productId,
          product: entry.product,
          quantitySold: entry.quantity,
          revenue: moneyRound(entry.revenue),
          cost: moneyRound(entry.cost),
          profit: moneyRound(profit),
          markupRate: entry.revenue.isZero()
            ? 0
            : moneyRound(profit.div(entry.revenue).mul(100)),
        };
      })
      .sort((a, b) => b.profit - a.profit);
  }

  async getOverview(query: ReportOverviewQueryDto) {
    const period = query.period ?? 'month';
    const range = resolveReportDateRange(period, query.dateFrom, query.dateTo);
    const prevRange = getPrevRange(range);
    const buckets = buildTimeBuckets(period, range);

    const salesFilter: Prisma.SaleWhereInput = this.saleFilter(query);

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
          ...this.customerPaymentFilter(query),
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

    const [financials, previousFinancials, productPerformance] =
      await Promise.all([
        this.calculateFinancials(range, query),
        this.calculateFinancials(prevRange, query),
        this.productPerformance(range, query),
      ]);

    // ── Time-series ───────────────────────────────────────────────────────────
    const series = await this.buildTimeSeries(buckets, purchasesFilter, query);

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
        beneficeBrut: financials.grossMarginHt,
        beneficeEstime: benefice,
        margePercent: marge,
        tauxMarque: financials.grossMarginRateOnRevenue,
        tauxMargeSurCout: financials.marginRateOnCost,
        remisesAccordees: financials.discountsHt,
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
        quantiteVendue: financials.quantitySold,
        beneficeMoyen:
          salesAgg._count > 0
            ? moneyRound(financials.grossMarginHt / salesAgg._count)
            : 0,
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
      topProduitsBenefice: productPerformance.slice(0, 10),
      produitsFaibleMarge: productPerformance
        .filter((item) => item.profit <= 0 || item.markupRate < 10)
        .slice(0, 20),

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
    query: ReportOverviewQueryDto,
  ) {
    if (!buckets.length) return [];
    const fullRange = {
      gte: buckets[0].start,
      lte: buckets[buckets.length - 1].end,
    };
    const [sales, credits, purchases, payments, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where: { ...this.saleFilter(query), createdAt: fullRange },
        select: {
          createdAt: true,
          subtotal: true,
          items: { select: { quantity: true, unitPurchaseCostHt: true } },
        },
      }),
      this.prisma.creditNote.findMany({
        where: {
          dateAvoir: fullRange,
          statut: { not: 'CANCELLED' },
          sale: this.saleFilter(query),
        },
        select: {
          dateAvoir: true,
          subtotal: true,
          items: {
            select: {
              quantiteRetournee: true,
              saleItem: { select: { unitPurchaseCostHt: true } },
            },
          },
        },
      }),
      this.prisma.purchase.findMany({
        where: { ...purchasesFilter, createdAt: fullRange },
        select: { createdAt: true, total: true, stampDuty: true },
      }),
      this.prisma.payment.findMany({
        where: { ...this.customerPaymentFilter(query), createdAt: fullRange },
        select: { createdAt: true, amount: true },
      }),
      this.prisma.expense.findMany({
        where: { expenseDate: fullRange, status: ExpenseStatus.ACTIVE },
        select: { expenseDate: true, amount: true },
      }),
    ]);
    const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
    const bucketFor = (date: Date) =>
      buckets.findIndex((bucket) => date >= bucket.start && date <= bucket.end);
    const values = buckets.map((bucket) => ({
      label: bucket.label,
      revenue: D(0),
      cost: D(0),
      purchases: D(0),
      payments: D(0),
      expenses: D(0),
      sales: 0,
      purchaseCount: 0,
    }));
    for (const sale of sales) {
      const index = bucketFor(sale.createdAt);
      if (index < 0) continue;
      values[index].revenue = values[index].revenue.plus(sale.subtotal);
      values[index].sales++;
      for (const item of sale.items)
        values[index].cost = values[index].cost.plus(
          D(item.unitPurchaseCostHt ?? 0).mul(item.quantity),
        );
    }
    for (const credit of credits) {
      const index = bucketFor(credit.dateAvoir);
      if (index < 0) continue;
      values[index].revenue = values[index].revenue.minus(credit.subtotal);
      for (const item of credit.items)
        values[index].cost = values[index].cost.minus(
          D(item.saleItem?.unitPurchaseCostHt ?? 0).mul(item.quantiteRetournee),
        );
    }
    for (const purchase of purchases) {
      const index = bucketFor(purchase.createdAt);
      if (index >= 0) {
        values[index].purchases = values[index].purchases
          .plus(purchase.total)
          .plus(purchase.stampDuty);
        values[index].purchaseCount++;
      }
    }
    for (const payment of payments) {
      const index = bucketFor(payment.createdAt);
      if (index >= 0)
        values[index].payments = values[index].payments.plus(payment.amount);
    }
    for (const expense of expenses) {
      const index = bucketFor(expense.expenseDate);
      if (index >= 0)
        values[index].expenses = values[index].expenses.plus(expense.amount);
    }
    return values.map((value) => {
      const grossProfit = value.revenue.minus(value.cost);
      return {
        label: value.label,
        ca: moneyRound(value.revenue),
        achats: moneyRound(value.purchases),
        encaissements: moneyRound(value.payments),
        depenses: moneyRound(value.expenses),
        benefice: moneyRound(grossProfit.minus(value.expenses)),
        margeBrute: moneyRound(grossProfit),
        coutVendu: moneyRound(value.cost),
        ventes: value.sales,
        achatsCount: value.purchaseCount,
      };
    });
  }

  // ─── Legacy endpoints ─────────────────────────────────────────────────────────

  async dashboard(query: ReportOverviewQueryDto = {}, user?: AuthUser) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin'].includes(
      user?.role ?? '',
    );
    const canSeeFinancials =
      isAdmin ||
      !!user?.permissions?.some((permission) =>
        [
          '*',
          'reports.*',
          'reports.financial.view',
          'reports.margins',
        ].includes(permission),
      );
    const scopedQuery = canSeeFinancials
      ? query
      : { ...query, sellerId: user?.id };
    const overview = await this.getOverview(scopedQuery);
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
          ...(!canSeeFinancials && user?.id ? { sellerId: user.id } : {}),
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
    const dashboardSeries = canSeeFinancials
      ? overview.series
      : overview.series.map(({ label, ca, encaissements, ventes }) => ({
          label,
          ca,
          encaissements,
          ventes,
        }));
    const operationalStock = canSeeFinancials
      ? overview.stock
      : {
          totalProduits: overview.stock.totalProduits,
          ruptureCount: overview.stock.ruptureCount,
          lowStockCount: overview.stock.lowStockCount,
          totalQuantite: overview.stock.totalQuantite,
          mouvements: overview.stock.mouvements,
          produitsCritiques: overview.stock.produitsCritiques,
          parCategorie: overview.stock.parCategorie.map(({ name, count }) => ({
            name,
            count,
          })),
        };
    return {
      period: overview.period,
      range: overview.range,
      ventes: overview.ventes,
      achats: overview.achats,
      stock: operationalStock,
      topProduits: overview.topProduits,
      series: dashboardSeries,
      operationnel: {
        caNet: overview.financier.caNet,
        encaissements: overview.financier.encaissementsClients,
        resteAEncaisser: overview.financier.impayesClients,
        panierMoyen: overview.ventes.panierMoyen,
      },
      ...(canSeeFinancials && {
        financier: {
          beneficeBrut: overview.financier.beneficeBrut,
          coutProduitsVendus: overview.financier.coutProduitsVendus,
          tauxMarque: overview.financier.tauxMarque,
          tauxMargeSurCout: overview.financier.tauxMargeSurCout,
          remisesAccordees: overview.financier.remisesAccordees,
          dataQuality: overview.financier.dataQuality,
        },
      }),
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
