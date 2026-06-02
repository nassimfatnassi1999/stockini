import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CaisseMovementType, PaymentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { CustomersService } from '../customers/customers.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
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

// ─── Centralized date-range resolver ──────────────────────────────────────────

export function resolveCashDateRange(
  period: CashPeriod | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
): { gte: Date; lte: Date } {
  const now = new Date();
  // Shift now into Tunisia local time so we can extract the correct calendar date
  const localNow = new Date(now.getTime() + TZ_OFFSET_MS);
  // Start of today in Tunisia time, expressed as a UTC timestamp
  const today = new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - TZ_OFFSET_MS,
  );

  if (period === 'custom' && startDate && endDate) {
    // YYYY-MM-DD parsed by new Date() is UTC midnight; shift left by offset to get local midnight as UTC
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
      const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
      return { gte: weekAgo, lte: now };
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

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CaisseService {
  private readonly logger = new Logger(CaisseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
    private readonly customers: CustomersService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ─── Balance ─────────────────────────────────────────────────────────────────

  async getBalance() {
    const config = await this.prisma.caisseConfig.findFirst();
    return {
      solde: Number(config?.solde ?? 0),
      allowNegative: config?.allowNegative ?? false,
    };
  }

  async setAllowNegative(allow: boolean) {
    const config = await this.prisma.caisseConfig.findFirst();
    if (config) {
      return this.prisma.caisseConfig.update({
        where: { id: config.id },
        data: { allowNegative: allow },
      });
    }
    return this.prisma.caisseConfig.create({ data: { allowNegative: allow } });
  }

  // ─── Manual operations ────────────────────────────────────────────────────────

  async retrait(montant: number, motif?: string, userId?: string) {
    return this.prisma.$transaction((tx) =>
      this.recordMovement(tx, {
        type: CaisseMovementType.RETRAIT_MANUEL,
        montant: -montant,
        motif,
        userId,
      }),
    );
  }

  async depot(montant: number, motif?: string, userId?: string) {
    return this.prisma.$transaction((tx) =>
      this.recordMovement(tx, {
        type: CaisseMovementType.DEPOT_MANUEL,
        montant,
        motif,
        userId,
      }),
    );
  }

  historique(type?: CaisseMovementType) {
    return this.prisma.caisseMovement.findMany({
      where: { clearedAt: null, ...(type ? { type } : {}) },
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

    const [
      balance,
      entreesTotal,
      sortiesAchatsTotal,
      sortiesDepensesTotal,
      totalClientDebt,
    ] = await Promise.all([
      this.prisma.caisseConfig.findFirst(),

      // Entrées : encaissements ventes (date du paiement, pas de la vente)
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.ENCAISSEMENT_VENTE, createdAt: range },
      }),

      // Sorties : décaissements fournisseurs
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.DECAISSEMENT_ACHAT, createdAt: range },
      }),

      // Sorties : retraits manuels
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.RETRAIT_MANUEL, createdAt: range },
      }),

      // KPI dettes clients : somme des restes à payer sur FACTURE non soldées
      this.customers.getTotalClientDebt(),
    ]);

    const soldeGlobal = Number(balance?.solde ?? 0);
    const entrees = Number(entreesTotal._sum.montant ?? 0);
    const sortiesAchats = Number(sortiesAchatsTotal._sum.montant ?? 0);
    const sortiesDepenses = Number(sortiesDepensesTotal._sum.montant ?? 0);
    const sorties = sortiesAchats + sortiesDepenses;

    const [
      weekIn, monthIn, yearIn,
      weekOut, monthOut, yearOut,
    ] = await Promise.all([
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.ENCAISSEMENT_VENTE, createdAt: resolveCashDateRange('week', undefined, undefined) },
      }),
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.ENCAISSEMENT_VENTE, createdAt: resolveCashDateRange('month', undefined, undefined) },
      }),
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.ENCAISSEMENT_VENTE, createdAt: resolveCashDateRange('year', undefined, undefined) },
      }),
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.DECAISSEMENT_ACHAT, createdAt: resolveCashDateRange('week', undefined, undefined) },
      }),
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.DECAISSEMENT_ACHAT, createdAt: resolveCashDateRange('month', undefined, undefined) },
      }),
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.DECAISSEMENT_ACHAT, createdAt: resolveCashDateRange('year', undefined, undefined) },
      }),
    ]);

    return {
      soldeGlobal,
      entrees,
      sorties,
      totalClientDebt,
      profitPeriode: entrees - sorties,
      profitSemaine:
        Number(weekIn._sum.montant ?? 0) - Number(weekOut._sum.montant ?? 0),
      profitMois:
        Number(monthIn._sum.montant ?? 0) - Number(monthOut._sum.montant ?? 0),
      profitAnnee:
        Number(yearIn._sum.montant ?? 0) - Number(yearOut._sum.montant ?? 0),
      period: query.period ?? 'today',
    };
  }

  // ─── Transactions list ────────────────────────────────────────────────────────

  async getTransactions(query: CashTransactionsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    // Only apply a date range filter when at least one param is present
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
      createdAt: { createdAt: sortOrder },
      date: { createdAt: sortOrder },
      totalTtc: { montant: sortOrder },
      amount: { montant: sortOrder },
      montant: { montant: sortOrder },
      reference: { referenceDoc: sortOrder },
      status: { type: sortOrder },
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
      direction:
        m.type === CaisseMovementType.CASH_RESET
          ? Number(m.ancienSolde) < 0 ? 'IN' : 'OUT'
          : ['ENCAISSEMENT_VENTE', 'DEPOT_MANUEL'].includes(m.type)
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
    const period = query.period ?? 'month';
    const now = new Date();
    // Tunisia-aware start of today (UTC timestamp)
    const localNow = new Date(now.getTime() + TZ_OFFSET_MS);
    const todayStart = new Date(
      Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - TZ_OFFSET_MS,
    );
    const days: Date[] = [];

    if (period === 'today') {
      // 6 four-hour buckets for today (in Tunisia local time)
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

    const chartData = await Promise.all(
      days.map(async (bucketStart) => {
        let bucketEnd: Date;
        if (isYearly) {
          bucketEnd = new Date(
            bucketStart.getFullYear(),
            bucketStart.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
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
            where: { type: CaisseMovementType.ENCAISSEMENT_VENTE, createdAt: range },
          }),
          this.prisma.caisseMovement.aggregate({
            _sum: { montant: true },
            where: { type: CaisseMovementType.DECAISSEMENT_ACHAT, createdAt: range },
          }),
        ]);

        const entrees = Number(inMvt._sum.montant ?? 0);
        const sorties = Number(outMvt._sum.montant ?? 0);

        let label: string;
        if (isYearly) {
          label = bucketStart.toLocaleDateString('fr-FR', {
            month: 'short',
            year: '2-digit',
          });
        } else if (isHourly) {
          label = `${String(bucketStart.getHours()).padStart(2, '0')}h`;
        } else if (isCustom) {
          label = bucketStart.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
          });
        } else {
          label = bucketStart.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
          });
        }

        return { label, entrees, sorties, profit: entrees - sorties };
      }),
    );

    // Top clients + fournisseurs — use payment date (not sale/purchase creation date)
    const analyticsRange = resolveCashDateRange(
      query.period,
      query.startDate,
      query.endDate,
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

  async resetBalance(motif: string, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const config = await tx.caisseConfig.findFirst();
      const currentBalance = Number(config?.solde ?? 0);

      if (currentBalance === 0) {
        throw new BadRequestException('La caisse est déjà à zéro.');
      }

      // Generate RESET-YYYYMMDD-XXXX reference
      const dateStr = new Date().toISOString().split('T')[0]!.replace(/-/g, '');
      const counterPrefix = `RESET-${dateStr}`;
      const counter = await tx.referenceCounter.upsert({
        where: { prefix_year: { prefix: counterPrefix, year: 0 } },
        update: { sequence: { increment: 1 } },
        create: { prefix: counterPrefix, year: 0, sequence: 1 },
      });
      const reference = `${counterPrefix}-${String(counter.sequence).padStart(4, '0')}`;

      // montant = -currentBalance so that ancienSolde + montant = 0
      const adjustment = -currentBalance;

      const configId = config?.id;
      const nouveauSolde = 0;

      if (configId) {
        await tx.caisseConfig.update({
          where: { id: configId },
          data: { solde: nouveauSolde },
        });
      } else {
        await tx.caisseConfig.create({ data: { solde: nouveauSolde } });
      }

      const movement = await tx.caisseMovement.create({
        data: {
          type: CaisseMovementType.CASH_RESET,
          montant: Math.abs(adjustment),
          ancienSolde: currentBalance,
          nouveauSolde,
          motif,
          referenceDoc: reference,
          userId,
        },
      });

      await this.auditLogs.create({
        userId,
        action: 'cash.reset',
        entity: 'CaisseMovement',
        entityId: movement.id,
        metadata: {
          ancienSolde: currentBalance,
          nouveauSolde: 0,
          motif,
          reference,
        },
      });

      return { movement, reference, ancienSolde: currentBalance, nouveauSolde: 0 };
    });
  }

  // ─── Clear history (soft-clear, display only) ─────────────────────────────────

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
        filtersJson: { dateFrom: dto.dateFrom, dateTo: dto.dateTo, type: dto.type } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Caisse movement history cleared by ${userId}: ${count} records`);
    return { count };
  }

  // ─── Backfill ─────────────────────────────────────────────────────────────────

  async backfillPayments() {
    // Find all active customer payments that have cashImpactDone=true
    const payments = await this.prisma.payment.findMany({
      where: { deletedAt: null, cashImpactDone: true },
      select: { id: true, reference: true, amount: true, type: true, createdAt: true, note: true, saleId: true, sale: { select: { invoiceNumber: true } } },
    });

    // Index existing CaisseMovements by referenceDoc to avoid duplicates
    const existing = await this.prisma.caisseMovement.findMany({
      where: { referenceDoc: { in: payments.map((p) => p.reference) } },
      select: { referenceDoc: true },
    });
    const existingRefs = new Set(existing.map((m) => m.referenceDoc));

    const missing = payments.filter((p) => !existingRefs.has(p.reference));
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
      userId?: string;
    },
  ) {
    const config = await client.caisseConfig.findFirst();
    const ancienSolde = Number(config?.solde ?? 0);
    const nouveauSolde = ancienSolde + input.montant;

    const allowNegative = config?.allowNegative ?? false;
    if (nouveauSolde < 0 && !allowNegative) {
      throw new BadRequestException(
        `Solde caisse insuffisant. Solde actuel : ${ancienSolde.toFixed(3)} DT`,
      );
    }

    if (config) {
      await client.caisseConfig.update({
        where: { id: config.id },
        data: { solde: nouveauSolde },
      });
    } else {
      await client.caisseConfig.create({ data: { solde: nouveauSolde } });
    }

    return client.caisseMovement.create({
      data: {
        type: input.type,
        montant: Math.abs(input.montant),
        ancienSolde,
        nouveauSolde,
        motif: input.motif,
        referenceDoc: input.referenceDoc,
        userId: input.userId,
      },
    });
  }
}
