import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CaisseMovementType, PaymentType, Prisma, TreasuryAccount } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { CustomersService } from '../customers/customers.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ReportsService } from '../reports/reports.service';
import type {
  CashPeriod,
  CashQueryDto,
  CashSummaryQueryDto,
  CashTransactionsQueryDto,
  CashAnalyticsQueryDto,
  ClearCaisseHistoryDto,
} from './dto/caisse.dto';

type DbClient = PrismaService | Prisma.TransactionClient;

// Africa/Tunis is permanently UTC+1 (no DST)
const TZ_OFFSET_MS = 60 * 60_000;

// ─── Account routing ──────────────────────────────────────────────────────────

/** Derive the treasury account from the payment method string.
 *  CREDIT must never reach this function — callers must guard upstream. */
export function resolveAccount(
  paymentMethod?: string | null,
  explicit?: TreasuryAccount,
): TreasuryAccount {
  if (explicit) return explicit;
  if (!paymentMethod || paymentMethod === 'CASH') return TreasuryAccount.PHYSICAL_CASH;
  // CREDIT is not a treasury event; treat as PHYSICAL_CASH fallback.
  // The central guard in recordMovement() prevents this path in practice.
  if (paymentMethod === 'CREDIT') return TreasuryAccount.PHYSICAL_CASH;
  return TreasuryAccount.BANK_TREASURY;
}

// ─── Centralized date-range resolver ──────────────────────────────────────────

export function resolveCashDateRange(
  period: CashPeriod | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
): { gte: Date; lte: Date } {
  const now = new Date();
  const localNow = new Date(now.getTime() + TZ_OFFSET_MS);
  const today = new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - TZ_OFFSET_MS,
  );

  if (period === 'custom' && startDate && endDate) {
    const start = new Date(new Date(startDate).getTime() - TZ_OFFSET_MS);
    const end   = new Date(new Date(endDate).getTime() - TZ_OFFSET_MS + 86_400_000 - 1);
    return { gte: start, lte: end };
  }

  switch (period) {
    case 'today':
      return { gte: today, lte: new Date(today.getTime() + 86_400_000 - 1) };
    case 'yesterday': {
      const yd = new Date(today.getTime() - 86_400_000);
      return { gte: yd, lte: new Date(today.getTime() - 1) };
    }
    case 'week': {
      const monday = new Date(
        today.getTime() - ((localNow.getUTCDay() + 6) % 7) * 86_400_000,
      );
      return { gte: monday, lte: now };
    }
    case 'month': {
      const monthStart = new Date(
        Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1) - TZ_OFFSET_MS,
      );
      return { gte: monthStart, lte: now };
    }
    case 'year': {
      const yearStart = new Date(
        Date.UTC(localNow.getUTCFullYear(), 0, 1) - TZ_OFFSET_MS,
      );
      return { gte: yearStart, lte: now };
    }
    default:
      return { gte: today, lte: new Date(today.getTime() + 86_400_000 - 1) };
  }
}

// ─── Shared IN/OUT type lists ─────────────────────────────────────────────────

const IN_TYPES = [
  CaisseMovementType.ENCAISSEMENT_VENTE,
  CaisseMovementType.DEPOT_MANUEL,
  CaisseMovementType.ANNULATION_ACHAT,
  CaisseMovementType.ANNULATION_DEPENSE,
];
const OUT_TYPES = [
  CaisseMovementType.DECAISSEMENT_ACHAT,
  CaisseMovementType.DEPENSE_GENERALE,
  CaisseMovementType.RETRAIT_MANUEL,
  CaisseMovementType.ANNULATION_VENTE,
];

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CaisseService {
  private readonly logger = new Logger(CaisseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
    private readonly customers: CustomersService,
    private readonly auditLogs: AuditLogsService,
    private readonly reports: ReportsService,
  ) {}

  // ─── Balance ─────────────────────────────────────────────────────────────────

  async getBalance() {
    const config = await this.prisma.caisseConfig.findFirst();
    return {
      soldeCaisse: Number(config?.solde ?? 0),
      soldeBanque: Number(config?.soldeBanque ?? 0),
      soldeGlobal: Number(config?.solde ?? 0) + Number(config?.soldeBanque ?? 0),
      allowNegative: config?.allowNegative ?? false,
      allowNegativeBanque: config?.allowNegativeBanque ?? false,
    };
  }

  async setAllowNegative(allow: boolean, account?: TreasuryAccount) {
    const config = await this.prisma.caisseConfig.findFirst();
    const field = account === TreasuryAccount.BANK_TREASURY ? 'allowNegativeBanque' : 'allowNegative';
    if (config) {
      return this.prisma.caisseConfig.update({
        where: { id: config.id },
        data: { [field]: allow },
      });
    }
    return this.prisma.caisseConfig.create({ data: { [field]: allow } });
  }

  // ─── Manual operations ────────────────────────────────────────────────────────

  async retrait(montant: number, motif?: string, userId?: string, account?: TreasuryAccount) {
    return this.prisma.$transaction((tx) =>
      this.recordMovement(tx, {
        type: CaisseMovementType.RETRAIT_MANUEL,
        montant: -montant,
        motif,
        userId,
        treasuryAccount: account ?? TreasuryAccount.PHYSICAL_CASH,
      }),
    );
  }

  async depot(montant: number, motif?: string, userId?: string, account?: TreasuryAccount) {
    return this.prisma.$transaction((tx) =>
      this.recordMovement(tx, {
        type: CaisseMovementType.DEPOT_MANUEL,
        montant,
        motif,
        userId,
        treasuryAccount: account ?? TreasuryAccount.PHYSICAL_CASH,
      }),
    );
  }

  historique(type?: CaisseMovementType, account?: TreasuryAccount) {
    return this.prisma.caisseMovement.findMany({
      where: {
        clearedAt: null,
        ...(type ? { type } : {}),
        ...(account ? { treasuryAccount: account } : {}),
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Summary KPIs ─────────────────────────────────────────────────────────────

  async getSummary(query: CashSummaryQueryDto) {
    const range = resolveCashDateRange(
      query.period ?? 'today',
      query.startDate,
      query.endDate,
    );

    const buildFilter = (account?: TreasuryAccount) => ({
      ...(account ? { treasuryAccount: account } : {}),
    });

    const [config, totalClientDebt] = await Promise.all([
      this.prisma.caisseConfig.findFirst(),
      this.customers.getTotalClientDebt(),
    ]);

    const soldeCaisse = Number(config?.solde ?? 0);
    const soldeBanque = Number(config?.soldeBanque ?? 0);

    // Per-account + global aggregations for the selected period
    const [
      cashIn, cashOut,
      bankIn, bankOut,
    ] = await Promise.all([
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: { in: IN_TYPES }, createdAt: range, ...buildFilter(TreasuryAccount.PHYSICAL_CASH) },
      }),
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: { in: OUT_TYPES }, createdAt: range, ...buildFilter(TreasuryAccount.PHYSICAL_CASH) },
      }),
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: { in: IN_TYPES }, createdAt: range, ...buildFilter(TreasuryAccount.BANK_TREASURY) },
      }),
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: { in: OUT_TYPES }, createdAt: range, ...buildFilter(TreasuryAccount.BANK_TREASURY) },
      }),
    ]);

    const entreesCaisse = Number(cashIn._sum.montant ?? 0);
    const sortiesCaisse = Math.abs(Number(cashOut._sum.montant ?? 0));
    const entreesBanque = Number(bankIn._sum.montant ?? 0);
    const sortiesBanque = Math.abs(Number(bankOut._sum.montant ?? 0));
    const entrees = entreesCaisse + entreesBanque;
    const sorties = sortiesCaisse + sortiesBanque;

    // La marge commerciale est indépendante du compte de trésorerie et réutilise
    // exactement le calcul financier des rapports (snapshots + avoirs).
    const [selectedSales, weekSales, monthSales, yearSales] = await Promise.all([
      this.reports.getSalesProfitForPeriod(range),
      this.reports.getSalesProfitForPeriod(
        resolveCashDateRange('week', undefined, undefined),
      ),
      this.reports.getSalesProfitForPeriod(
        resolveCashDateRange('month', undefined, undefined),
      ),
      this.reports.getSalesProfitForPeriod(
        resolveCashDateRange('year', undefined, undefined),
      ),
    ]);

    const selectedProfit = selectedSales.grossProfit;
    const weekProfit = weekSales.grossProfit;
    const monthProfit = monthSales.grossProfit;
    const yearProfit = yearSales.grossProfit;

    return {
      // Backward-compat flat fields
      soldeGlobal: soldeCaisse + soldeBanque,
      entrees,
      sorties,
      totalClientDebt,
      profitPeriode: selectedProfit,
      profitSemaine: weekProfit,
      profitMois: monthProfit,
      profitAnnee: yearProfit,
      period: query.period ?? 'today',

      cash: {
        physicalBalance: soldeCaisse,
        cashInflows: entreesCaisse,
        cashOutflows: sortiesCaisse,
      },
      bank: {
        balance: soldeBanque,
        inflows: entreesBanque,
        outflows: sortiesBanque,
      },
      treasury: {
        totalBalance: soldeCaisse + soldeBanque,
        inflows: entrees,
        outflows: sorties,
      },
      sales: {
        netRevenueHt: selectedSales.netRevenueHt,
        costOfGoodsSold: selectedSales.costOfGoodsSold,
        grossProfit: selectedProfit,
        creditNoteImpact: selectedSales.creditNoteImpact,
        saleCount: selectedSales.saleCount,
        dataQuality: selectedSales.dataQuality,
      },
      salesPeriods: {
        week: weekSales,
        month: monthSales,
        year: yearSales,
      },

      // Per-account detail
      soldeCaisse,
      soldeBanque,
      caisse: {
        solde: soldeCaisse,
        entrees: entreesCaisse,
        sorties: sortiesCaisse,
        profit: selectedProfit,
        profitSemaine: weekProfit,
        profitMois: monthProfit,
        profitAnnee: yearProfit,
      },
      banque: {
        solde: soldeBanque,
        entrees: entreesBanque,
        sorties: sortiesBanque,
        profit: selectedProfit,
        profitSemaine: weekProfit,
        profitMois: monthProfit,
        profitAnnee: yearProfit,
      },
    };
  }

  // ─── Transactions list ────────────────────────────────────────────────────────

  async getTransactions(query: CashTransactionsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const hasDateFilter =
      query.period ||
      (query.startDate && query.endDate) ||
      (query.dateFrom && query.dateTo);
    const range = hasDateFilter
      ? resolveCashDateRange(
          query.period,
          query.startDate ?? query.dateFrom,
          query.endDate ?? query.dateTo,
        )
      : undefined;

    const where: Prisma.CaisseMovementWhereInput = {
      clearedAt: null,
      ...(range ? { createdAt: range } : {}),
      ...(query.type && { type: query.type }),
      ...(query.account && { treasuryAccount: query.account }),
      ...(query.search && {
        OR: [
          { referenceDoc: { contains: query.search, mode: 'insensitive' } },
          { motif: { contains: query.search, mode: 'insensitive' } },
          { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const sortOrder = query.sortOrder ?? 'desc';
    const allowedSortFields: Record<string, Prisma.CaisseMovementOrderByWithRelationInput> = {
      createdAt:   { createdAt: sortOrder },
      date:        { createdAt: sortOrder },
      totalTtc:    { montant: sortOrder },
      amount:      { montant: sortOrder },
      montant:     { montant: sortOrder },
      reference:   { referenceDoc: sortOrder },
      status:      { type: sortOrder },
      account:     { treasuryAccount: sortOrder },
    };
    const orderBy: Prisma.CaisseMovementOrderByWithRelationInput =
      (query.sortBy && allowedSortFields[query.sortBy]) || { createdAt: 'desc' };

    const [movements, total] = await Promise.all([
      this.prisma.caisseMovement.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.caisseMovement.count({ where }),
    ]);

    const rows = movements.map((m) => ({
      id: m.id,
      date: m.createdAt,
      type: m.type,
      account: m.treasuryAccount,
      direction:
        m.type === CaisseMovementType.CASH_RESET
          ? Number(m.ancienSolde) < 0 ? 'IN' : 'OUT'
          : (['ENCAISSEMENT_VENTE', 'DEPOT_MANUEL', 'ANNULATION_ACHAT', 'ANNULATION_DEPENSE'] as string[]).includes(m.type)
            ? 'IN'
            : 'OUT',
      reference: m.referenceDoc ?? null,
      montant: Number(m.montant),
      ancienSolde: Number(m.ancienSolde),
      nouveauSolde: Number(m.nouveauSolde),
      motif: m.motif ?? null,
      user: m.user,
    }));

    return {
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Analytics ────────────────────────────────────────────────────────────────

  async getAnalytics(query: CashAnalyticsQueryDto) {
    const account: TreasuryAccount | undefined = query.account;
    const period = query.period ?? 'month';
    const now = new Date();
    const localNow = new Date(now.getTime() + TZ_OFFSET_MS);
    const todayStart = new Date(
      Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - TZ_OFFSET_MS,
    );
    const days: Date[] = [];

    if (period === 'today') {
      for (let h = 0; h < 24; h += 4) {
        days.push(new Date(todayStart.getTime() + h * 3_600_000));
      }
    } else if (period === 'yesterday') {
      const ydStart = new Date(todayStart.getTime() - 86_400_000);
      for (let h = 0; h < 24; h += 4) {
        days.push(new Date(ydStart.getTime() + h * 3_600_000));
      }
    } else if (period === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        days.push(d);
      }
    } else if (period === 'month') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        days.push(d);
      }
    } else if (period === 'year') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        days.push(d);
      }
    } else if (period === 'custom' && query.startDate && query.endDate) {
      const from = new Date(query.startDate);
      const to = new Date(query.endDate);
      const msDay = 86_400_000;
      const diff = Math.ceil((to.getTime() - from.getTime()) / msDay);
      const step = Math.max(1, Math.ceil(diff / 30));
      for (
        let d = new Date(from);
        d <= to;
        d = new Date(d.getTime() + step * msDay)
      ) {
        days.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      }
    }

    const isYearly = period === 'year';
    const isHourly = period === 'today' || period === 'yesterday';
    const isCustom = period === 'custom';

    const accountFilter = account ? { treasuryAccount: account } : {};

    const chartData = await Promise.all(
      days.map(async (bucketStart) => {
        let bucketEnd: Date;
        if (isYearly) {
          bucketEnd = new Date(
            bucketStart.getFullYear(),
            bucketStart.getMonth() + 1,
            0, 23, 59, 59, 999,
          );
        } else if (isHourly) {
          bucketEnd = new Date(bucketStart.getTime() + 4 * 3_600_000 - 1);
        } else {
          bucketEnd = new Date(bucketStart.getTime() + 86_400_000 - 1);
        }

        const range = { gte: bucketStart, lte: bucketEnd };

        const [inMvt, outMvt] = await Promise.all([
          this.prisma.caisseMovement.aggregate({
            _sum: { montant: true },
            where: { type: { in: IN_TYPES }, createdAt: range, ...accountFilter },
          }),
          this.prisma.caisseMovement.aggregate({
            _sum: { montant: true },
            where: { type: { in: OUT_TYPES }, createdAt: range, ...accountFilter },
          }),
        ]);

        const entrees = Number(inMvt._sum.montant ?? 0);
        const sorties = Math.abs(Number(outMvt._sum.montant ?? 0));

        let label: string;
        if (isYearly) {
          label = bucketStart.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        } else if (isHourly) {
          label = `${String(bucketStart.getHours()).padStart(2, '0')}h`;
        } else {
          label = bucketStart.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        }

        return { label, entrees, sorties, netCashFlow: entrees - sorties };
      }),
    );

    const analyticsRange = resolveCashDateRange(query.period, query.startDate, query.endDate);

    const topClients = await this.prisma.payment.groupBy({
      by: ['customerId'],
      _sum: { amount: true },
      where: {
        type: PaymentType.CUSTOMER_PAYMENT,
        deletedAt: null,
        cashImpactDone: true,
        customerId: { not: null },
        createdAt: analyticsRange,
        ...(account === TreasuryAccount.PHYSICAL_CASH ? { method: 'CASH' } : {}),
        // CREDIT excluded: it is not a real cash/bank receipt
        ...(account === TreasuryAccount.BANK_TREASURY ? { method: { notIn: ['CASH', 'CREDIT'] } } : {}),
      },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    });

    const clientIds = topClients.map((c) => c.customerId).filter(Boolean) as string[];
    const clients = await this.prisma.customer.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, name: true },
    });
    const clientMap = new Map(clients.map((c) => [c.id, c.name]));

    const topSuppliers = await this.prisma.payment.groupBy({
      by: ['supplierId'],
      _sum: { amount: true },
      where: {
        type: PaymentType.SUPPLIER_PAYMENT,
        deletedAt: null,
        cashImpactDone: true,
        supplierId: { not: null },
        createdAt: analyticsRange,
        ...(account === TreasuryAccount.PHYSICAL_CASH ? { method: 'CASH' } : {}),
        // CREDIT excluded: it is not a real cash/bank payment
        ...(account === TreasuryAccount.BANK_TREASURY ? { method: { notIn: ['CASH', 'CREDIT'] } } : {}),
      },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    });

    const supplierIds = topSuppliers.map((s) => s.supplierId).filter(Boolean) as string[];
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true },
    });
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

    return {
      cashflow: chartData,
      topClients: topClients.map((c) => ({
        name: clientMap.get(c.customerId!) ?? 'Inconnu',
        montant: Number(c._sum.amount ?? 0),
      })),
      topFournisseurs: topSuppliers.map((s) => ({
        name: supplierMap.get(s.supplierId!) ?? 'Inconnu',
        montant: Number(s._sum.amount ?? 0),
      })),
    };
  }

  // ─── Reset balance ────────────────────────────────────────────────────────────

  async resetBalance(motif: string, userId?: string, account?: TreasuryAccount) {
    return this.prisma.$transaction(async (tx) => {
      const config = await tx.caisseConfig.findFirst();

      const isCash = !account || account === TreasuryAccount.PHYSICAL_CASH;
      const isBank = account === TreasuryAccount.BANK_TREASURY;

      const currentCash = Number(config?.solde ?? 0);
      const currentBank = Number(config?.soldeBanque ?? 0);
      const currentBalance = isCash ? currentCash : currentBank;

      if (currentBalance === 0) {
        const label = isBank ? 'trésorerie bancaire' : 'caisse physique';
        throw new BadRequestException(`Le solde de la ${label} est déjà à zéro.`);
      }

      const dateStr = new Date().toISOString().split('T')[0]!.replace(/-/g, '');
      const prefix = `RESET-${dateStr}`;
      const counter = await tx.referenceCounter.upsert({
        where: { prefix_year: { prefix, year: 0 } },
        update: { sequence: { increment: 1 } },
        create: { prefix, year: 0, sequence: 1 },
      });
      const reference = `${prefix}-${String(counter.sequence).padStart(4, '0')}`;

      const adjustment = -currentBalance;
      const nouveauSolde = 0;

      const configId = config?.id;
      const updateData = isCash
        ? { solde: nouveauSolde }
        : { soldeBanque: nouveauSolde };

      if (configId) {
        await tx.caisseConfig.update({ where: { id: configId }, data: updateData });
      } else {
        await tx.caisseConfig.create({ data: updateData });
      }

      const movement = await tx.caisseMovement.create({
        data: {
          type: CaisseMovementType.CASH_RESET,
          treasuryAccount: account ?? TreasuryAccount.PHYSICAL_CASH,
          montant: Math.abs(adjustment),
          ancienSolde: currentBalance,
          nouveauSolde,
          motif,
          referenceDoc: reference,
          userId,
        },
      });

      await this.auditLogs.audit({
        action: 'caisse.reset',
        entity: 'CaisseMovement',
        entityId: movement.id,
        userId,
        oldValue: { solde: currentBalance },
        newValue: { solde: nouveauSolde },
        metadata: {
          account: account ?? TreasuryAccount.PHYSICAL_CASH,
          ancienSolde: currentBalance,
          nouveauSolde: 0,
          motif,
          reference,
          cashMovementId: movement.id,
        },
      }, tx);

      return { movement, reference, ancienSolde: currentBalance, nouveauSolde: 0, account: account ?? TreasuryAccount.PHYSICAL_CASH };
    });
  }

  // ─── Clear history ────────────────────────────────────────────────────────────

  async clearHistory(dto: ClearCaisseHistoryDto, userId: string) {
    const where: Prisma.CaisseMovementWhereInput = {
      clearedAt: null,
      ...((dto.dateFrom || dto.dateTo) && {
        createdAt: {
          ...(dto.dateFrom && { gte: new Date(dto.dateFrom) }),
          ...(dto.dateTo && { lte: new Date(dto.dateTo) }),
        },
      }),
      ...(dto.type && { type: dto.type }),
      ...(dto.account && { treasuryAccount: dto.account }),
    };

    const count = await this.prisma.caisseMovement.count({ where });
    if (count > 0) {
      await this.prisma.caisseMovement.updateMany({
        where,
        data: { clearedAt: new Date(), clearedBy: userId },
      });
    }

    await this.prisma.historyClearLog.create({
      data: {
        module: 'caisse_movements',
        userId,
        count,
        filtersJson: { dateFrom: dto.dateFrom, dateTo: dto.dateTo, type: dto.type, account: dto.account } as Prisma.InputJsonValue,
      },
    });

    await this.auditLogs.audit({
      action: 'caisse.history_cleared',
      entity: 'CaisseMovement',
      userId,
      metadata: {
        count,
        dateFrom: dto.dateFrom ?? null,
        dateTo: dto.dateTo ?? null,
        type: dto.type ?? null,
        account: dto.account ?? null,
      },
    });

    this.logger.log(`Caisse movement history cleared by ${userId}: ${count} records`);
    return { count };
  }

  // ─── Backfill ─────────────────────────────────────────────────────────────────

  async backfillPayments() {
    const payments = await this.prisma.payment.findMany({
      where: { deletedAt: null, cashImpactDone: true },
      select: { id: true, reference: true, amount: true, type: true, method: true, createdAt: true, note: true, saleId: true, sale: { select: { invoiceNumber: true } } },
    });

    const existing = await this.prisma.caisseMovement.findMany({
      where: { referenceDoc: { in: payments.map((p) => p.reference) } },
      select: { referenceDoc: true },
    });
    const existingRefs = new Set(existing.map((m) => m.referenceDoc));

    // CREDIT payments never create CaisseMovements — skip them.
    const missing = payments.filter(
      (p) => !existingRefs.has(p.reference) && p.method !== 'CREDIT',
    );
    if (missing.length === 0) return { created: 0, message: 'No missing CaisseMovements.' };

    let created = 0;
    for (const payment of missing) {
      const movementType =
        payment.type === 'CUSTOMER_PAYMENT'
          ? CaisseMovementType.ENCAISSEMENT_VENTE
          : CaisseMovementType.DECAISSEMENT_ACHAT;
      const montant = Number(payment.amount);
      const motif =
        payment.type === 'CUSTOMER_PAYMENT'
          ? `Encaissement vente ${payment.sale?.invoiceNumber ?? payment.saleId ?? ''}`
          : `Paiement fournisseur ${payment.note ?? payment.reference}`;

      await this.prisma.$transaction((tx) =>
        this.recordMovement(tx, {
          type: movementType,
          montant: payment.type === 'CUSTOMER_PAYMENT' ? montant : -montant,
          motif,
          referenceDoc: payment.reference,
          paymentMethod: payment.method,
        }),
      );
      created++;
    }

    return { created, message: `Created ${created} missing CaisseMovement(s).` };
  }

  // ─── Internal helper ──────────────────────────────────────────────────────────

  async recordMovement(
    client: DbClient,
    input: {
      type: CaisseMovementType;
      montant: number;
      motif?: string;
      referenceDoc?: string;
      expenseId?: string;
      userId?: string;
      paymentMethod?: string | null;
      treasuryAccount?: TreasuryAccount;
    },
  ) {
    // Central protection: CREDIT is never a cash/bank event.
    if (input.paymentMethod === 'CREDIT') {
      throw new BadRequestException(
        'Le mode de paiement CREDIT ne génère aucun mouvement de trésorerie.',
      );
    }

    const account = resolveAccount(input.paymentMethod, input.treasuryAccount);
    const isCash = account === TreasuryAccount.PHYSICAL_CASH;

    const config = await client.caisseConfig.findFirst();
    const ancienSolde = isCash
      ? Number(config?.solde ?? 0)
      : Number(config?.soldeBanque ?? 0);
    const nouveauSolde = ancienSolde + input.montant;

    const allowNegative = isCash
      ? (config?.allowNegative ?? false)
      : (config?.allowNegativeBanque ?? false);

    if (nouveauSolde < 0 && !allowNegative) {
      const label = isCash ? 'caisse physique' : 'trésorerie bancaire';
      throw new BadRequestException(
        `Solde ${label} insuffisant. Solde actuel : ${ancienSolde.toFixed(3)} DT`,
      );
    }

    const updateData = isCash
      ? { solde: nouveauSolde }
      : { soldeBanque: nouveauSolde };

    if (config) {
      await client.caisseConfig.update({
        where: { id: config.id },
        data: updateData,
      });
    } else {
      await client.caisseConfig.create({ data: updateData });
    }

    const movement = await client.caisseMovement.create({
      data: {
        type: input.type,
        treasuryAccount: account,
        montant: Math.abs(input.montant),
        ancienSolde,
        nouveauSolde,
        motif: input.motif,
        referenceDoc: input.referenceDoc,
        expenseId: input.expenseId,
        userId: input.userId,
      },
    });

    const actionMap: Partial<Record<CaisseMovementType, string>> = {
      [CaisseMovementType.ENCAISSEMENT_VENTE]: 'caisse.encaissement_vente',
      [CaisseMovementType.DECAISSEMENT_ACHAT]: 'caisse.decaissement_achat',
      [CaisseMovementType.DEPENSE_GENERALE]: 'caisse.depense_generale',
      [CaisseMovementType.DEPOT_MANUEL]: 'caisse.depot',
      [CaisseMovementType.RETRAIT_MANUEL]: 'caisse.retrait',
      [CaisseMovementType.ANNULATION_VENTE]: 'caisse.annulation_vente',
      [CaisseMovementType.ANNULATION_ACHAT]: 'caisse.annulation_achat',
      [CaisseMovementType.ANNULATION_DEPENSE]: 'caisse.annulation_depense',
      [CaisseMovementType.CASH_RESET]: 'caisse.reset',
    };

    await this.auditLogs.audit({
      action: actionMap[input.type] ?? `caisse.${input.type.toLowerCase()}`,
      entity: 'CaisseMovement',
      entityId: movement.id,
      userId: input.userId ?? null,
      oldValue: { solde: ancienSolde },
      newValue: { solde: nouveauSolde },
      metadata: {
        cashMovementId: movement.id,
        type: input.type,
        account,
        montant: Math.abs(input.montant),
        referenceDoc: input.referenceDoc ?? null,
        expenseId: input.expenseId ?? null,
        motif: input.motif ?? null,
      },
    }, client as Prisma.TransactionClient);

    return movement;
  }
}
