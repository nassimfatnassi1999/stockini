import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CaisseMovementType,
  CashDirection,
  PaymentType,
  Prisma,
  TreasuryAccount,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { CustomersService } from '../customers/customers.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ReportsService } from '../reports/reports.service';
import { buildPagination } from '../common/utils/pagination.util';
import {
  CASH_IN_MOVEMENT_TYPES,
  CASH_OUT_MOVEMENT_TYPES,
  CashMovementClassifier,
} from '../common/utils/cash-movement-classifier';
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

const DIRECTLY_DELETABLE_TYPES = new Set<CaisseMovementType>([
  CaisseMovementType.DEPOT_MANUEL,
  CaisseMovementType.RETRAIT_MANUEL,
]);

const BUSINESS_MOVEMENT_ERROR =
  'Ce mouvement est généré par une opération métier. Corrigez ou annulez l’opération d’origine afin de préserver la cohérence financière.';

// ─── Account routing ──────────────────────────────────────────────────────────

/** Derive the treasury account from the payment method string.
 *  CREDIT must never reach this function — callers must guard upstream. */
export function resolveAccount(
  paymentMethod?: string | null,
  explicit?: TreasuryAccount,
): TreasuryAccount {
  if (explicit) return explicit;
  if (!paymentMethod || paymentMethod === 'CASH')
    return TreasuryAccount.PHYSICAL_CASH;
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
  now = new Date(),
): { gte: Date; lte: Date } {
  const localNow = new Date(now.getTime() + TZ_OFFSET_MS);
  const today = new Date(
    Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
    ) - TZ_OFFSET_MS,
  );

  if (period === 'custom' && startDate && endDate) {
    const start = new Date(new Date(startDate).getTime() - TZ_OFFSET_MS);
    const end = new Date(
      new Date(endDate).getTime() - TZ_OFFSET_MS + 86_400_000 - 1,
    );
    if (start > end) {
      throw new BadRequestException(
        'La date de début doit précéder ou être égale à la date de fin.',
      );
    }
    return { gte: start, lte: end };
  }

  switch (period) {
    case 'today':
      return { gte: today, lte: now };
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
        Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1) -
          TZ_OFFSET_MS,
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
      return { gte: today, lte: now };
  }
}

function cashPeriodLabel(
  period: CashPeriod,
  startDate?: string,
  endDate?: string,
): string {
  const labels: Record<Exclude<CashPeriod, 'custom'>, string> = {
    today: "Aujourd'hui",
    yesterday: 'Hier',
    week: 'Cette semaine',
    month: 'Ce mois',
    year: 'Cette année',
  };
  if (period !== 'custom') return labels[period];
  const display = (value?: string) => {
    if (!value) return '';
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  };
  return `Du ${display(startDate)} au ${display(endDate)}`;
}

function tunisIso(date: Date): string {
  return new Date(date.getTime() + TZ_OFFSET_MS)
    .toISOString()
    .replace('Z', '+01:00');
}

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
      soldeGlobal:
        Number(config?.solde ?? 0) + Number(config?.soldeBanque ?? 0),
      allowNegative: config?.allowNegative ?? false,
      allowNegativeBanque: config?.allowNegativeBanque ?? false,
    };
  }

  async setAllowNegative(allow: boolean, account?: TreasuryAccount) {
    const config = await this.prisma.caisseConfig.findFirst();
    const field =
      account === TreasuryAccount.BANK_TREASURY
        ? 'allowNegativeBanque'
        : 'allowNegative';
    if (config) {
      return this.prisma.caisseConfig.update({
        where: { id: config.id },
        data: { [field]: allow },
      });
    }
    return this.prisma.caisseConfig.create({ data: { [field]: allow } });
  }

  // ─── Manual operations ────────────────────────────────────────────────────────

  async retrait(
    montant: number,
    motif?: string,
    userId?: string,
    account?: TreasuryAccount,
  ) {
    return this.prisma.$transaction((tx) =>
      this.recordMovement(tx, {
        type: CaisseMovementType.RETRAIT_MANUEL,
        montant: -montant,
        motif,
        userId,
        treasuryAccount: account ?? TreasuryAccount.PHYSICAL_CASH,
        isManualAdjustment: true,
      }),
    );
  }

  async depot(
    montant: number,
    motif?: string,
    userId?: string,
    account?: TreasuryAccount,
  ) {
    return this.prisma.$transaction((tx) =>
      this.recordMovement(tx, {
        type: CaisseMovementType.DEPOT_MANUEL,
        montant,
        motif,
        userId,
        treasuryAccount: account ?? TreasuryAccount.PHYSICAL_CASH,
        isManualAdjustment: true,
      }),
    );
  }

  historique(type?: CaisseMovementType, account?: TreasuryAccount) {
    return this.prisma.caisseMovement.findMany({
      where: {
        clearedAt: null,
        deletedAt: null,
        ...(type ? { type } : {}),
        ...(account ? { treasuryAccount: account } : {}),
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Summary KPIs ─────────────────────────────────────────────────────────────

  async getSummary(query: CashSummaryQueryDto) {
    const D = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
    const money = (value: Prisma.Decimal.Value) =>
      D(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP).toFixed(3);
    const period = query.period ?? 'today';
    const range = resolveCashDateRange(period, query.startDate, query.endDate);

    const [config, totalClientDebt] = await Promise.all([
      this.prisma.caisseConfig.findFirst(),
      this.customers.getTotalClientDebt(),
    ]);

    const soldeCaisseDecimal = D(config?.solde ?? 0);
    const soldeBanqueDecimal = D(config?.soldeBanque ?? 0);
    const soldeCaisse = soldeCaisseDecimal.toNumber();
    const soldeBanque = soldeBanqueDecimal.toNumber();

    // Both Caisse and Rapports use the exact same type-based classifier.
    const movements = await this.prisma.caisseMovement.findMany({
      where: {
        createdAt: range,
        deletedAt: null,
        type: {
          in: [...CASH_IN_MOVEMENT_TYPES, ...CASH_OUT_MOVEMENT_TYPES],
        },
      },
      select: { type: true, montant: true, treasuryAccount: true },
    });
    const cashFlow = CashMovementClassifier.summarize(
      movements.filter(
        (movement) =>
          movement.treasuryAccount === TreasuryAccount.PHYSICAL_CASH,
      ),
    );
    const bankFlow = CashMovementClassifier.summarize(
      movements.filter(
        (movement) =>
          movement.treasuryAccount === TreasuryAccount.BANK_TREASURY,
      ),
    );

    const entreesCaisseDecimal = cashFlow.inflows;
    const sortiesCaisseDecimal = cashFlow.outflows;
    const entreesBanqueDecimal = bankFlow.inflows;
    const sortiesBanqueDecimal = bankFlow.outflows;
    const entreesDecimal = entreesCaisseDecimal.plus(entreesBanqueDecimal);
    const sortiesDecimal = sortiesCaisseDecimal.plus(sortiesBanqueDecimal);
    const entreesCaisse = entreesCaisseDecimal.toNumber();
    const sortiesCaisse = sortiesCaisseDecimal.toNumber();
    const entreesBanque = entreesBanqueDecimal.toNumber();
    const sortiesBanque = sortiesBanqueDecimal.toNumber();
    const entrees = entreesDecimal.toNumber();
    const sorties = sortiesDecimal.toNumber();
    const retainedSurplus = cashFlow.retainedSurplus.plus(
      bankFlow.retainedSurplus,
    );

    // La marge commerciale est indépendante du compte de trésorerie et réutilise
    // exactement le calcul financier des rapports (snapshots + avoirs).
    const selectedSales = await this.reports.getSalesProfitForPeriod(range);
    const selectedProfit = selectedSales.netProfit;
    const periodLabel = cashPeriodLabel(period, query.startDate, query.endDate);
    const cashBalanceDecimal = soldeCaisseDecimal.plus(soldeBanqueDecimal);

    return {
      // Backward-compat flat fields
      soldeGlobal: soldeCaisse + soldeBanque,
      entrees,
      sorties,
      totalClientDebt,
      retainedSurplus: retainedSurplus.toNumber(),
      profitPeriode: selectedProfit,
      period,
      label: periodLabel,
      startDate: tunisIso(range.gte),
      endDate: tunisIso(range.lte),
      timezone: 'Africa/Tunis',
      currency: 'TND',
      grossSalesHt: money(selectedSales.grossRevenueHt),
      creditsAndReturnsHt: money(selectedSales.creditNoteImpact),
      netSalesHt: money(selectedSales.netRevenueHt),
      historicalCost: money(selectedSales.costOfGoodsSold),
      grossProfit: money(selectedSales.grossProfit),
      expenses: money(selectedSales.expenses),
      netProfit: money(selectedSales.netProfit),
      cashIn: money(entreesDecimal),
      cashOut: money(sortiesDecimal),
      cashBalance: money(cashBalanceDecimal),

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
        grossProfit: selectedSales.grossProfit,
        grossMargin: selectedSales.grossProfit,
        expenses: selectedSales.expenses,
        netProfit: selectedSales.netProfit,
        creditNoteImpact: selectedSales.creditNoteImpact,
        saleCount: selectedSales.saleCount,
        dataQuality: selectedSales.dataQuality,
      },

      // Per-account detail
      soldeCaisse,
      soldeBanque,
      caisse: {
        solde: soldeCaisse,
        entrees: entreesCaisse,
        sorties: sortiesCaisse,
        profit: selectedProfit,
      },
      banque: {
        solde: soldeBanque,
        entrees: entreesBanque,
        sorties: sortiesBanque,
        profit: selectedProfit,
      },
    };
  }

  // ─── Transactions list ────────────────────────────────────────────────────────

  async getTransactions(query: CashTransactionsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = query.limit ?? 10;
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
      deletedAt: null,
      ...(range ? { createdAt: range } : {}),
      ...(query.type && { type: query.type }),
      ...(query.account && { treasuryAccount: query.account }),
      ...(query.search && {
        OR: [
          { referenceDoc: { contains: query.search, mode: 'insensitive' } },
          { motif: { contains: query.search, mode: 'insensitive' } },
          {
            user: { fullName: { contains: query.search, mode: 'insensitive' } },
          },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const sortOrder = query.sortOrder ?? 'desc';
    const allowedSortFields: Record<
      string,
      Prisma.CaisseMovementOrderByWithRelationInput
    > = {
      createdAt: { createdAt: sortOrder },
      date: { createdAt: sortOrder },
      totalTtc: { montant: sortOrder },
      amount: { montant: sortOrder },
      montant: { montant: sortOrder },
      reference: { referenceDoc: sortOrder },
      status: { type: sortOrder },
      account: { treasuryAccount: sortOrder },
    };
    const orderBy: Prisma.CaisseMovementOrderByWithRelationInput[] =
      query.sortBy && allowedSortFields[query.sortBy]
        ? [allowedSortFields[query.sortBy], { id: sortOrder }]
        : [{ createdAt: 'desc' }, { id: 'desc' }];

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
        CashMovementClassifier.direction(m.type) ??
        (Number(m.nouveauSolde) >= Number(m.ancienSolde) ? 'IN' : 'OUT'),
      reference: m.referenceDoc ?? null,
      montant: Number(m.montant),
      ancienSolde: Number(m.ancienSolde),
      nouveauSolde: Number(m.nouveauSolde),
      motif: m.motif ?? null,
      user: m.user,
      isManualAdjustment: m.isManualAdjustment,
    }));

    return {
      data: rows,
      pagination: {
        ...buildPagination(page, limit, total),
        total,
      },
    };
  }

  // ─── Analytics ────────────────────────────────────────────────────────────────

  async getAnalytics(query: CashAnalyticsQueryDto) {
    const account: TreasuryAccount | undefined = query.account;
    const period = query.period ?? 'month';
    const analyticsRange = resolveCashDateRange(
      period,
      query.startDate,
      query.endDate,
    );
    const days: Date[] = [];

    if (period === 'today' || period === 'yesterday') {
      for (let h = 0; h < 24; h += 4) {
        days.push(new Date(analyticsRange.gte.getTime() + h * 3_600_000));
      }
    } else if (period === 'year') {
      const localStart = new Date(analyticsRange.gte.getTime() + TZ_OFFSET_MS);
      for (let month = 0; month < 12; month++) {
        days.push(
          new Date(
            Date.UTC(localStart.getUTCFullYear(), month, 1) - TZ_OFFSET_MS,
          ),
        );
      }
    } else {
      const totalDays =
        Math.floor(
          (analyticsRange.lte.getTime() - analyticsRange.gte.getTime()) /
            86_400_000,
        ) + 1;
      const step = Math.max(1, Math.ceil(totalDays / 31));
      for (
        let d = new Date(analyticsRange.gte);
        d <= analyticsRange.lte;
        d = new Date(d.getTime() + step * 86_400_000)
      ) {
        days.push(d);
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
          const localBucket = new Date(bucketStart.getTime() + TZ_OFFSET_MS);
          bucketEnd = new Date(
            Date.UTC(
              localBucket.getUTCFullYear(),
              localBucket.getUTCMonth() + 1,
              1,
            ) -
              TZ_OFFSET_MS -
              1,
          );
        } else if (isHourly) {
          bucketEnd = new Date(bucketStart.getTime() + 4 * 3_600_000 - 1);
        } else {
          const totalDays =
            Math.floor(
              (analyticsRange.lte.getTime() - analyticsRange.gte.getTime()) /
                86_400_000,
            ) + 1;
          const step = Math.max(1, Math.ceil(totalDays / 31));
          bucketEnd = new Date(bucketStart.getTime() + step * 86_400_000 - 1);
        }
        if (bucketEnd > analyticsRange.lte) bucketEnd = analyticsRange.lte;

        const range = { gte: bucketStart, lte: bucketEnd };

        const [inMvt, outMvt] = await Promise.all([
          this.prisma.caisseMovement.aggregate({
            _sum: { montant: true },
            where: {
              deletedAt: null,
              type: { in: CASH_IN_MOVEMENT_TYPES },
              createdAt: range,
              ...accountFilter,
            },
          }),
          this.prisma.caisseMovement.aggregate({
            _sum: { montant: true },
            where: {
              deletedAt: null,
              type: { in: CASH_OUT_MOVEMENT_TYPES },
              createdAt: range,
              ...accountFilter,
            },
          }),
        ]);

        const entrees = Number(inMvt._sum.montant ?? 0);
        const sorties = Math.abs(Number(outMvt._sum.montant ?? 0));

        let label: string;
        if (isYearly) {
          label = bucketStart.toLocaleDateString('fr-FR', {
            month: 'short',
            year: '2-digit',
            timeZone: 'Africa/Tunis',
          });
        } else if (isHourly) {
          const tunisHour = new Date(
            bucketStart.getTime() + TZ_OFFSET_MS,
          ).getUTCHours();
          label = `${String(tunisHour).padStart(2, '0')}h`;
        } else {
          label = bucketStart.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            timeZone: 'Africa/Tunis',
          });
        }

        return { label, entrees, sorties, netCashFlow: entrees - sorties };
      }),
    );

    const topClients = await this.prisma.payment.groupBy({
      by: ['customerId'],
      _sum: { amount: true },
      where: {
        type: PaymentType.CUSTOMER_PAYMENT,
        deletedAt: null,
        cashImpactDone: true,
        customerId: { not: null },
        createdAt: analyticsRange,
        ...(account === TreasuryAccount.PHYSICAL_CASH
          ? { method: 'CASH' }
          : {}),
        // CREDIT excluded: it is not a real cash/bank receipt
        ...(account === TreasuryAccount.BANK_TREASURY
          ? { method: { notIn: ['CASH', 'CREDIT'] } }
          : {}),
      },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    });

    const clientIds = topClients
      .map((c) => c.customerId)
      .filter(Boolean) as string[];
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
        ...(account === TreasuryAccount.PHYSICAL_CASH
          ? { method: 'CASH' }
          : {}),
        // CREDIT excluded: it is not a real cash/bank payment
        ...(account === TreasuryAccount.BANK_TREASURY
          ? { method: { notIn: ['CASH', 'CREDIT'] } }
          : {}),
      },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    });

    const supplierIds = topSuppliers
      .map((s) => s.supplierId)
      .filter(Boolean) as string[];
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

  async resetBalance(
    motif: string,
    userId?: string,
    account?: TreasuryAccount,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCashLedger(tx);
      const config = await tx.caisseConfig.findFirst();

      const isCash = !account || account === TreasuryAccount.PHYSICAL_CASH;
      const isBank = account === TreasuryAccount.BANK_TREASURY;

      const currentCash = Number(config?.solde ?? 0);
      const currentBank = Number(config?.soldeBanque ?? 0);
      const currentBalance = isCash ? currentCash : currentBank;

      if (currentBalance === 0) {
        const label = isBank ? 'trésorerie bancaire' : 'caisse physique';
        throw new BadRequestException(
          `Le solde de la ${label} est déjà à zéro.`,
        );
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
        await tx.caisseConfig.update({
          where: { id: configId },
          data: updateData,
        });
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

      await this.auditLogs.audit(
        {
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
        },
        tx,
      );

      return {
        movement,
        reference,
        ancienSolde: currentBalance,
        nouveauSolde: 0,
        account: account ?? TreasuryAccount.PHYSICAL_CASH,
      };
    });
  }

  // ─── Administrative movement deletion ───────────────────────────────────────

  async deleteMovement(
    movementId: string,
    reason: string,
    adminId: string,
    request?: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const deletionReason = reason.trim();
    if (!deletionReason) {
      throw new BadRequestException('Le motif de suppression est obligatoire.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Every ledger writer locks this singleton row. This serializes deposits,
        // withdrawals, resets and deletions while a chronological chain is rebuilt.
        await this.lockCashLedger(tx);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "CaisseMovement" WHERE "id" = ${movementId} FOR UPDATE`,
        );

        const movement = await tx.caisseMovement.findUnique({
          where: { id: movementId },
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        });
        if (!movement) {
          throw new NotFoundException('Mouvement de caisse introuvable.');
        }
        if (movement.deletedAt) {
          throw new ConflictException(
            'Ce mouvement de caisse a déjà été supprimé.',
          );
        }

        const isBusinessMovement =
          Boolean(movement.expenseId || movement.creditNoteId) ||
          !movement.isManualAdjustment ||
          !DIRECTLY_DELETABLE_TYPES.has(movement.type);
        if (isBusinessMovement) {
          throw new BadRequestException(BUSINESS_MOVEMENT_ERROR);
        }

        const admin = await tx.user.findUnique({
          where: { id: adminId },
          select: { id: true, fullName: true, email: true },
        });
        if (!admin) {
          throw new ConflictException(
            "Le compte administrateur n'existe plus.",
          );
        }

        const following = await tx.caisseMovement.findMany({
          where: {
            treasuryAccount: movement.treasuryAccount,
            deletedAt: null,
            OR: [
              { createdAt: { gt: movement.createdAt } },
              { createdAt: movement.createdAt, id: { gt: movement.id } },
            ],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });

        const snapshot = {
          id: movement.id,
          type: movement.type,
          treasuryAccount: movement.treasuryAccount,
          montant: movement.montant.toString(),
          ancienSolde: movement.ancienSolde.toString(),
          nouveauSolde: movement.nouveauSolde.toString(),
          motif: movement.motif,
          referenceDoc: movement.referenceDoc,
          expenseId: movement.expenseId,
          creditNoteId: movement.creditNoteId,
          paymentMethod: movement.paymentMethod,
          userId: movement.userId,
          user: movement.user,
          createdAt: movement.createdAt.toISOString(),
          clearedAt: movement.clearedAt?.toISOString() ?? null,
          clearedBy: movement.clearedBy,
          isManualAdjustment: movement.isManualAdjustment,
          deletedAt: null,
          deletedById: null,
          deletionReason: null,
        };

        const deletedAt = new Date();
        await tx.caisseMovement.update({
          where: { id: movement.id },
          data: {
            deletedAt,
            deletedById: admin.id,
            deletionReason,
          },
        });

        let balance = new Prisma.Decimal(movement.ancienSolde);
        for (const next of following) {
          const direction = CashMovementClassifier.direction(next.type);
          let nextBalance: Prisma.Decimal;
          let nextAmount = new Prisma.Decimal(next.montant).abs();

          if (next.type === CaisseMovementType.CASH_RESET) {
            nextAmount = balance.abs();
            nextBalance = new Prisma.Decimal(0);
          } else if (direction === CashDirection.IN) {
            nextBalance = balance.plus(nextAmount);
          } else if (direction === CashDirection.OUT) {
            nextBalance = balance.minus(nextAmount);
          } else {
            throw new ConflictException(
              `Le mouvement ${next.id} possède un type financier incompatible avec le recalcul.`,
            );
          }

          await tx.caisseMovement.update({
            where: { id: next.id },
            data: {
              montant: nextAmount,
              ancienSolde: balance,
              nouveauSolde: nextBalance,
            },
          });
          balance = nextBalance;
        }

        const config = await tx.caisseConfig.findFirst();
        const configData =
          movement.treasuryAccount === TreasuryAccount.PHYSICAL_CASH
            ? { solde: balance }
            : { soldeBanque: balance };
        if (config) {
          await tx.caisseConfig.update({
            where: { id: config.id },
            data: configData,
          });
        } else {
          await tx.caisseConfig.create({ data: configData });
        }

        await this.auditLogs.audit(
          {
            action: 'CASH_MOVEMENT_DELETED',
            entity: 'CaisseMovement',
            entityId: movement.id,
            userId: admin.id,
            userName: admin.fullName || admin.email,
            oldValue: snapshot,
            newValue: {
              deletedAt: deletedAt.toISOString(),
              deletedById: admin.id,
              deletionReason,
            },
            metadata: {
              movementId: movement.id,
              montant: movement.montant.toString(),
              type: movement.type,
              reference: movement.referenceDoc,
              ancienSoldeAvant: movement.ancienSolde.toString(),
              ancienSoldeApres: movement.nouveauSolde.toString(),
              deletionReason,
              administratorId: admin.id,
              administratorName: admin.fullName || admin.email,
              recalculatedMovementCount: following.length,
              newAccountBalance: balance.toString(),
            },
            ipAddress: request?.ipAddress,
            userAgent: request?.userAgent,
          },
          tx,
        );

        const currentConfig = await tx.caisseConfig.findFirst();
        const soldeCaisse = Number(currentConfig?.solde ?? 0);
        const soldeBanque = Number(currentConfig?.soldeBanque ?? 0);
        return {
          movementId: movement.id,
          recalculatedMovementCount: following.length,
          soldeCaisse,
          soldeBanque,
          soldeGlobal: soldeCaisse + soldeBanque,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 30_000,
      },
    );
  }

  // ─── Clear history ────────────────────────────────────────────────────────────

  async clearHistory(dto: ClearCaisseHistoryDto, userId: string) {
    const where: Prisma.CaisseMovementWhereInput = {
      clearedAt: null,
      deletedAt: null,
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
        filtersJson: {
          dateFrom: dto.dateFrom,
          dateTo: dto.dateTo,
          type: dto.type,
          account: dto.account,
        } as Prisma.InputJsonValue,
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

    this.logger.log(
      `Caisse movement history cleared by ${userId}: ${count} records`,
    );
    return { count };
  }

  // ─── Backfill ─────────────────────────────────────────────────────────────────

  async backfillPayments() {
    const payments = await this.prisma.payment.findMany({
      where: { deletedAt: null, cashImpactDone: true },
      select: {
        id: true,
        reference: true,
        amount: true,
        type: true,
        method: true,
        createdAt: true,
        note: true,
        saleId: true,
        sale: { select: { invoiceNumber: true } },
      },
    });

    const existing = await this.prisma.caisseMovement.findMany({
      where: {
        deletedAt: null,
        referenceDoc: { in: payments.map((p) => p.reference) },
      },
      select: { referenceDoc: true },
    });
    const existingRefs = new Set(existing.map((m) => m.referenceDoc));

    // CREDIT payments never create CaisseMovements — skip them.
    const missing = payments.filter(
      (p) => !existingRefs.has(p.reference) && p.method !== 'CREDIT',
    );
    if (missing.length === 0)
      return { created: 0, message: 'No missing CaisseMovements.' };

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

    return {
      created,
      message: `Created ${created} missing CaisseMovement(s).`,
    };
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
      creditNoteId?: string;
      isManualAdjustment?: boolean;
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

    await this.lockCashLedger(client);
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
        creditNoteId: input.creditNoteId,
        paymentMethod: input.paymentMethod,
        userId: input.userId,
        isManualAdjustment: input.isManualAdjustment ?? false,
      },
    });

    const actionMap: Partial<Record<CaisseMovementType, string>> = {
      [CaisseMovementType.ENCAISSEMENT_VENTE]: 'caisse.encaissement_vente',
      [CaisseMovementType.DECAISSEMENT_ACHAT]: 'caisse.decaissement_achat',
      [CaisseMovementType.DEPENSE_GENERALE]: 'caisse.depense_generale',
      [CaisseMovementType.DEPOT_MANUEL]: 'caisse.depot',
      [CaisseMovementType.RETRAIT_MANUEL]: 'caisse.retrait',
      [CaisseMovementType.ANNULATION_VENTE]: 'caisse.annulation_vente',
      [CaisseMovementType.REFUND_OUT]: 'caisse.refund_out',
      [CaisseMovementType.ANNULATION_ACHAT]: 'caisse.annulation_achat',
      [CaisseMovementType.ANNULATION_DEPENSE]: 'caisse.annulation_depense',
      [CaisseMovementType.CASH_RESET]: 'caisse.reset',
    };

    await this.auditLogs.audit(
      {
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
      },
      client as Prisma.TransactionClient,
    );

    return movement;
  }

  private async lockCashLedger(client: DbClient): Promise<void> {
    // Unit-test doubles created before ledger locking do not expose $queryRaw.
    // Real Prisma clients always do.
    const queryRaw = (
      client as DbClient & {
        $queryRaw?: (query: Prisma.Sql) => Promise<unknown>;
      }
    ).$queryRaw;
    if (queryRaw) {
      await queryRaw.call(
        client,
        Prisma.sql`SELECT "id" FROM "CaisseConfig" ORDER BY "id" FOR UPDATE`,
      );
    }
  }
}
