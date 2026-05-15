import { BadRequestException, Injectable } from '@nestjs/common';
import { CaisseMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import type {
  CashPeriod,
  CashQueryDto,
  CashSummaryQueryDto,
  CashTransactionsQueryDto,
  CashAnalyticsQueryDto,
} from './dto/caisse.dto';

type DbClient = PrismaService | Prisma.TransactionClient;

// ─── Centralized date-range resolver ──────────────────────────────────────────

export function resolveCashDateRange(
  period: CashPeriod | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
): { gte: Date; lte: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'custom' && startDate && endDate) {
    return {
      gte: new Date(startDate),
      lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
    };
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
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { gte: monthStart, lte: now };
    }
    case 'year': {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { gte: yearStart, lte: now };
    }
    default:
      // Fallback: today
      return { gte: today, lte: new Date(today.getTime() + 86_400_000 - 1) };
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CaisseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
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
      where: type ? { type } : undefined,
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
      salesTotal,
      purchasesTotal,
      expensesTotal,
      creditNotesTotal,
    ] = await Promise.all([
      this.prisma.caisseConfig.findFirst(),

      // Entrées : ventes COMPLETED payées dans la période
      this.prisma.sale.aggregate({
        _sum: { paidAmount: true },
        where: { status: 'COMPLETED', createdAt: range },
      }),

      // Sorties : achats RECEIVED payés
      this.prisma.purchase.aggregate({
        _sum: { paidAmount: true },
        where: { status: 'RECEIVED', createdAt: range },
      }),

      // Sorties : dépenses
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: { type: CaisseMovementType.RETRAIT_MANUEL, createdAt: range },
      }),

      // Sorties : avoirs remboursés
      this.prisma.caisseMovement.aggregate({
        _sum: { montant: true },
        where: {
          type: CaisseMovementType.DECAISSEMENT_ACHAT,
          createdAt: range,
        },
      }),
    ]);

    const soldeGlobal = Number(balance?.solde ?? 0);
    const entrees = Number(salesTotal._sum.paidAmount ?? 0);
    const sortiesAchats = Number(purchasesTotal._sum.paidAmount ?? 0);
    const sortiesDepenses = Number(expensesTotal._sum.montant ?? 0);
    const sortiesAvoirs = Number(creditNotesTotal._sum.montant ?? 0);
    const sorties = sortiesAchats + sortiesDepenses + sortiesAvoirs;

    const [
      weekSales,
      monthSales,
      yearSales,
      weekPurchases,
      monthPurchases,
      yearPurchases,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        _sum: { paidAmount: true },
        where: {
          status: 'COMPLETED',
          createdAt: resolveCashDateRange('week', undefined, undefined),
        },
      }),
      this.prisma.sale.aggregate({
        _sum: { paidAmount: true },
        where: {
          status: 'COMPLETED',
          createdAt: resolveCashDateRange('month', undefined, undefined),
        },
      }),
      this.prisma.sale.aggregate({
        _sum: { paidAmount: true },
        where: {
          status: 'COMPLETED',
          createdAt: resolveCashDateRange('year', undefined, undefined),
        },
      }),
      this.prisma.purchase.aggregate({
        _sum: { paidAmount: true },
        where: {
          status: 'RECEIVED',
          createdAt: resolveCashDateRange('week', undefined, undefined),
        },
      }),
      this.prisma.purchase.aggregate({
        _sum: { paidAmount: true },
        where: {
          status: 'RECEIVED',
          createdAt: resolveCashDateRange('month', undefined, undefined),
        },
      }),
      this.prisma.purchase.aggregate({
        _sum: { paidAmount: true },
        where: {
          status: 'RECEIVED',
          createdAt: resolveCashDateRange('year', undefined, undefined),
        },
      }),
    ]);

    return {
      soldeGlobal,
      entrees,
      sorties,
      profitPeriode: entrees - sorties,
      profitSemaine:
        Number(weekSales._sum.paidAmount ?? 0) -
        Number(weekPurchases._sum.paidAmount ?? 0),
      profitMois:
        Number(monthSales._sum.paidAmount ?? 0) -
        Number(monthPurchases._sum.paidAmount ?? 0),
      profitAnnee:
        Number(yearSales._sum.paidAmount ?? 0) -
        Number(yearPurchases._sum.paidAmount ?? 0),
      period: query.period ?? 'today',
    };
  }

  // ─── Transactions list ────────────────────────────────────────────────────────

  async getTransactions(query: CashTransactionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    // Only apply a date range filter when at least one param is present
    const hasDateFilter = query.period || (query.startDate && query.endDate);
    const range = hasDateFilter
      ? resolveCashDateRange(query.period, query.startDate, query.endDate)
      : undefined;

    const where: Prisma.CaisseMovementWhereInput = {
      ...(range ? { createdAt: range } : {}),
    };

    const [movements, total] = await Promise.all([
      this.prisma.caisseMovement.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.caisseMovement.count({ where }),
    ]);

    const rows = movements.map((m) => ({
      id: m.id,
      date: m.createdAt,
      type: m.type,
      direction: ['ENCAISSEMENT_VENTE', 'DEPOT_MANUEL'].includes(m.type)
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
    const days: Date[] = [];

    if (period === 'today') {
      // 6 four-hour buckets for today
      const dayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      for (let h = 0; h < 24; h += 4) {
        const d = new Date(dayStart);
        d.setHours(h, 0, 0, 0);
        days.push(d);
      }
    } else if (period === 'yesterday') {
      const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      for (let h = 0; h < 24; h += 4) {
        const d = new Date(yd);
        d.setHours(h, 0, 0, 0);
        days.push(d);
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

        const [sales, purchases] = await Promise.all([
          this.prisma.sale.aggregate({
            _sum: { paidAmount: true },
            where: { status: 'COMPLETED', createdAt: range },
          }),
          this.prisma.purchase.aggregate({
            _sum: { paidAmount: true },
            where: { status: 'RECEIVED', createdAt: range },
          }),
        ]);

        const entrees = Number(sales._sum.paidAmount ?? 0);
        const sorties = Number(purchases._sum.paidAmount ?? 0);

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

    // Top clients + fournisseurs always use the resolved date range
    const analyticsRange = resolveCashDateRange(
      query.period,
      query.startDate,
      query.endDate,
    );

    const topClients = await this.prisma.sale.groupBy({
      by: ['customerId'],
      _sum: { paidAmount: true },
      where: {
        status: 'COMPLETED',
        customerId: { not: null },
        createdAt: analyticsRange,
      },
      orderBy: { _sum: { paidAmount: 'desc' } },
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

    const topSuppliers = await this.prisma.purchase.groupBy({
      by: ['supplierId'],
      _sum: { paidAmount: true },
      where: { status: 'RECEIVED', createdAt: analyticsRange },
      orderBy: { _sum: { paidAmount: 'desc' } },
      take: 5,
    });

    const supplierIds = topSuppliers.map((s) => s.supplierId);
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true },
    });
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

    return {
      cashflow: chartData,
      topClients: topClients.map((c) => ({
        name: clientMap.get(c.customerId!) ?? 'Inconnu',
        montant: Number(c._sum.paidAmount ?? 0),
      })),
      topFournisseurs: topSuppliers.map((s) => ({
        name: supplierMap.get(s.supplierId) ?? 'Inconnu',
        montant: Number(s._sum.paidAmount ?? 0),
      })),
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
