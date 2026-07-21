import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConsolidationStatus, CustomerOrigin, PaymentStatus, PaymentType, Prisma } from '@prisma/client';
import { calculatePaymentAmounts } from '../common/utils/payment-status';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCustomerDto, LockCustomerDto, UpdateCustomerDto, UpdateDebtSettingsDto } from './dto/customer.dto';
import { CustomerSalesQueryDto } from './dto/customer-sales-query.dto';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
    private readonly settings: SettingsService,
  ) {}

  async create(dto: CreateCustomerDto) {
    await this.settings.assertActiveOption('customer_types', dto.type);
    const type = dto.type ?? 'INDIVIDUAL';
    return this.prisma.$transaction(async (tx) =>
      tx.customer.create({
        data: {
          ...dto,
          reference: await this.references.generateForCustomer(type, tx),
        },
      }),
    );
  }

  getNextReference(type: string) {
    return this.references.peekNextCustomerReference(type ?? 'INDIVIDUAL');
  }

  // Calcule la dette totale d'un client : somme des restes à payer sur FACTURE/BL non annulés/supprimés
  async getClientDebt(clientId: string): Promise<{ debtAmount: number; unpaidInvoicesCount: number }> {
    const invoices = await this.prisma.sale.findMany({
      where: {
        customerId: clientId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        consolidationMemberships: { none: { active: true } },
        OR: [
          { documentType: 'FACTURE' },
          { documentType: 'BON_LIVRAISON', transformedToId: null },
        ],
      },
      select: { total: true, paidAmount: true },
    });

    let debtAmount = new Prisma.Decimal(0);
    let unpaidInvoicesCount = 0;

    for (const inv of invoices) {
      const total = new Prisma.Decimal(inv.total ?? 0);
      const paid = new Prisma.Decimal(inv.paidAmount ?? 0);
      const remaining = Prisma.Decimal.max(total.minus(paid), new Prisma.Decimal(0));
      if (remaining.greaterThan(0)) {
        debtAmount = debtAmount.plus(remaining);
        unpaidInvoicesCount++;
      }
    }

    return { debtAmount: debtAmount.toNumber(), unpaidInvoicesCount };
  }

  // Somme de toutes les dettes clients (pour le KPI caisse)
  async getTotalClientDebt(): Promise<number> {
    const invoices = await this.prisma.sale.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CANCELLED' },
        customerId: { not: null },
        consolidationMemberships: { none: { active: true } },
        OR: [
          { documentType: 'FACTURE' },
          { documentType: 'BON_LIVRAISON', transformedToId: null },
        ],
      },
      select: { total: true, paidAmount: true },
    });

    let total = new Prisma.Decimal(0);
    for (const inv of invoices) {
      const remaining = Prisma.Decimal.max(
        new Prisma.Decimal(inv.total ?? 0).minus(new Prisma.Decimal(inv.paidAmount ?? 0)),
        new Prisma.Decimal(0),
      );
      if (remaining.greaterThan(0)) {
        total = total.plus(remaining);
      }
    }
    return total.toNumber();
  }

  async findAll(search?: string) {
    const customers = await this.prisma.customer.findMany({
      where: search
        ? {
            deletedAt: null,
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // Calcul des dettes en une seule requête groupée (FACTURE + BL non transformés, non supprimés, non annulés)
    const invoices = await this.prisma.sale.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CANCELLED' },
        customerId: { in: customers.map((c) => c.id) },
        consolidationMemberships: { none: { active: true } },
        OR: [
          { documentType: 'FACTURE' },
          { documentType: 'BON_LIVRAISON', transformedToId: null },
        ],
      },
      select: { customerId: true, total: true, paidAmount: true },
    });

    const debtMap = new Map<string, { debtAmount: Prisma.Decimal; unpaidInvoicesCount: number }>();
    for (const inv of invoices) {
      if (!inv.customerId) continue;
      const remaining = Prisma.Decimal.max(
        new Prisma.Decimal(inv.total ?? 0).minus(new Prisma.Decimal(inv.paidAmount ?? 0)),
        new Prisma.Decimal(0),
      );
      if (remaining.greaterThan(0)) {
        const entry = debtMap.get(inv.customerId) ?? { debtAmount: new Prisma.Decimal(0), unpaidInvoicesCount: 0 };
        entry.debtAmount = entry.debtAmount.plus(remaining);
        entry.unpaidInvoicesCount++;
        debtMap.set(inv.customerId, entry);
      }
    }

    return customers
      .map((c) => {
        const debt = debtMap.get(c.id);
        return {
          ...c,
          debtAmount: debt ? debt.debtAmount.toNumber() : 0,
          unpaidInvoicesCount: debt ? debt.unpaidInvoicesCount : 0,
        };
      })
      .filter((c) => c.origin === CustomerOrigin.MANUAL || c.debtAmount > 0);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirstOrThrow({
      where: { id, deletedAt: null },
    });
    const debt = await this.getClientDebt(id);
    return { ...customer, ...debt };
  }

  async findSales(clientId: string, query: CustomerSalesQueryDto) {
    await this.prisma.customer.findFirstOrThrow({
      where: { id: clientId, deletedAt: null },
      select: { id: true },
    });

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 10));
    const and: Prisma.SaleWhereInput[] = [];

    if (query.search?.trim()) {
      const search = query.search.trim();
      and.push({
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { items: { some: { designation: { contains: search, mode: 'insensitive' } } } },
          { items: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
          { items: { some: { product: { reference: { contains: search, mode: 'insensitive' } } } } },
        ],
      });
    }

    if (query.paymentStatus === PaymentStatus.PAID) {
      and.push({ remainingAmount: { lte: 0.001 } });
    } else if (query.paymentStatus === PaymentStatus.PARTIAL) {
      and.push({ paidAmount: { gt: 0 }, remainingAmount: { gt: 0.001 } });
    } else if (query.paymentStatus === PaymentStatus.UNPAID) {
      and.push({ paidAmount: { lte: 0 }, remainingAmount: { gt: 0.001 } });
    }

    const where: Prisma.SaleWhereInput = {
      customerId: clientId,
      deletedAt: null,
      NOT: {
        isConsolidated: true,
        consolidationStatus: { in: [ConsolidationStatus.CANCELLED, ConsolidationStatus.REPLACED] },
      },
      ...(query.documentType && { documentType: query.documentType }),
      ...(query.documentStatus && { status: query.documentStatus }),
      ...((query.dateFrom || query.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
      ...(and.length && { AND: and }),
    };

    const sortOrder = query.sortOrder ?? 'desc';
    const sortFields: Record<string, Prisma.SaleOrderByWithRelationInput> = {
      reference: { invoiceNumber: sortOrder },
      documentType: { documentType: sortOrder },
      date: { createdAt: sortOrder },
      totalTtc: { total: sortOrder },
      paidAmount: { paidAmount: sortOrder },
      remainingAmount: { remainingAmount: sortOrder },
      paymentStatus: { paymentStatus: sortOrder },
      documentStatus: { status: sortOrder },
    };
    const orderBy = (query.sortBy && sortFields[query.sortBy]) || { createdAt: sortOrder };

    const financialWhere: Prisma.SaleWhereInput = {
      AND: [where, { consolidationMemberships: { none: { active: true } } }],
    };
    const [sales, total, totals, validPayments, unpaidCount] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          invoiceNumber: true,
          documentType: true,
          status: true,
          createdAt: true,
          subtotal: true,
          tax: true,
          total: true,
          stampDuty: true,
          paidAmount: true,
          remainingAmount: true,
          totalRefunded: true,
          items: { select: { id: true } },
          payments: {
            where: { deletedAt: null, type: PaymentType.CUSTOMER_PAYMENT },
            select: { amount: true },
          },
          isConsolidated: true,
          consolidationStatus: true,
          consolidationMemberships: { where: { active: true }, select: { consolidatedSale: { select: { id: true, invoiceNumber: true } } } },
          _count: { select: { consolidationSources: { where: { active: true } } } },
        },
      }),
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({ where: financialWhere, _sum: { total: true, stampDuty: true } }),
      this.prisma.payment.aggregate({
        where: {
          deletedAt: null,
          type: PaymentType.CUSTOMER_PAYMENT,
          OR: [
            { sale: { is: financialWhere } },
            { sale: { consolidationMemberships: { some: { active: true, consolidatedSale: { is: financialWhere } } } } },
          ],
        },
        _sum: { amount: true },
      }),
      this.prisma.sale.count({ where: { AND: [financialWhere, { remainingAmount: { gt: 0.001 } }] } }),
    ]);

    const data = sales.map(({ payments, items, consolidationMemberships, _count, ...sale }) => {
      const totalPayable = new Prisma.Decimal(sale.total).plus(sale.stampDuty ?? 0);
      const paid = sale.isConsolidated ? new Prisma.Decimal(sale.paidAmount) : payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
      const amounts = calculatePaymentAmounts(totalPayable, paid);
      return {
        ...sale,
        itemCount: items.length,
        totalTtc: new Prisma.Decimal(sale.total),
        paidAmount: amounts.paidAmount,
        remainingAmount: amounts.remainingAmount,
        paymentStatus: amounts.paymentStatus,
        activeConsolidation: consolidationMemberships?.[0]?.consolidatedSale ?? null,
        sourceDocumentsCount: _count?.consolidationSources ?? 0,
      };
    });

    const totalTtc = new Prisma.Decimal(totals._sum.total ?? 0);
    const totalStampDuty = new Prisma.Decimal(totals._sum.stampDuty ?? 0);
    const totalPaid = new Prisma.Decimal(validPayments._sum.amount ?? 0);
    const totalRemaining = Prisma.Decimal.max(
      totalTtc.plus(totalStampDuty).minus(totalPaid),
      new Prisma.Decimal(0),
    );

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: { totalTtc, totalPaid, totalRemaining, unpaidCount },
    };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.settings.assertActiveOption('customer_types', dto.type);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId?: string) {
    this.logger.log(`DELETE /customers/${id} called by ${userId ?? 'unknown'}`);
    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId ?? null },
    });
    this.logger.log(`Customer ${id} moved to trash by ${userId ?? 'unknown'}`);
    return { id };
  }

  // ── Lock / Unlock ────────────────────────────────────────────────────────────

  async lockCustomer(id: string, userId: string, dto: LockCustomerDto) {
    const customer = await this.prisma.customer.findFirstOrThrow({ where: { id, deletedAt: null } });
    if (customer.isLocked) {
      throw new BadRequestException('Le client est déjà verrouillé');
    }
    return this.prisma.customer.update({
      where: { id },
      data: {
        isLocked: true,
        lockedAt: new Date(),
        lockedReason: dto.reason?.trim() || 'Verrouillage manuel',
        lockedByUserId: userId,
      },
    });
  }

  async unlockCustomer(id: string, userId: string) {
    const customer = await this.prisma.customer.findFirstOrThrow({ where: { id, deletedAt: null } });
    if (!customer.isLocked) {
      throw new BadRequestException('Le client est déjà déverrouillé');
    }
    return this.prisma.customer.update({
      where: { id },
      data: {
        isLocked: false,
        lockedAt: null,
        lockedReason: null,
        lockedByUserId: userId,
      },
    });
  }

  async updateDebtSettings(id: string, dto: UpdateDebtSettingsDto) {
    await this.prisma.customer.findFirstOrThrow({ where: { id, deletedAt: null } });
    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        debtDueDate: dto.debtDueDate === null ? null : dto.debtDueDate ? new Date(dto.debtDueDate) : undefined,
        autoLockEnabled: dto.autoLockEnabled,
      },
    });
    // Re-evaluate lock status after changing settings
    await this.recalculateClientLockStatus(id);
    return this.prisma.customer.findFirstOrThrow({ where: { id } });
  }

  /**
   * Recalcule le statut de verrouillage d'un client selon ses dettes et sa date d'échéance.
   * - Auto-lock si dette > 0 ET debtDueDate dépassée ET autoLockEnabled=true
   * - Auto-unlock si dette = 0 ET le lock était automatique (lockedReason = "Dette échue")
   * Appelé après création vente/BL/facture, paiement, avoir, modification impactant la dette.
   */
  async recalculateClientLockStatus(clientId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({ where: { id: clientId, deletedAt: null } });
    if (!customer) return;

    const { debtAmount } = await this.getClientDebt(clientId);
    const now = new Date();

    // Auto-lock: dette > 0, échéance dépassée, autoLock activé, pas déjà verrouillé
    if (
      !customer.isLocked &&
      customer.autoLockEnabled &&
      customer.debtDueDate &&
      customer.debtDueDate < now &&
      debtAmount > 0
    ) {
      await this.prisma.customer.update({
        where: { id: clientId },
        data: {
          isLocked: true,
          lockedAt: now,
          lockedReason: 'Dette échue',
          lockedByUserId: null,
        },
      });
      this.logger.log(`Customer ${clientId} auto-locked: debt=${debtAmount}, dueDate=${customer.debtDueDate}`);
      return;
    }

    // Auto-unlock: dette = 0 ET verrouillage automatique (lockedReason = "Dette échue")
    if (customer.isLocked && customer.lockedReason === 'Dette échue' && debtAmount === 0) {
      await this.prisma.customer.update({
        where: { id: clientId },
        data: {
          isLocked: false,
          lockedAt: null,
          lockedReason: null,
          lockedByUserId: null,
        },
      });
      this.logger.log(`Customer ${clientId} auto-unlocked: debt cleared`);
    }
  }

  /**
   * Vérifie si un client est verrouillé et lève une exception métier si c'est le cas.
   * À appeler avant toute création de document engageant une dette ou une livraison.
   */
  async assertClientNotLocked(clientId: string | null | undefined): Promise<void> {
    if (!clientId) return;
    const customer = await this.prisma.customer.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { isLocked: true, lockedReason: true },
    });
    if (!customer) return;
    if (customer.isLocked) {
      const reason = customer.lockedReason ? ` (${customer.lockedReason})` : '';
      throw new ForbiddenException(
        `Client verrouillé${reason}. Impossible de créer une facture ou un bon de livraison avant régularisation.`,
      );
    }
  }
}
