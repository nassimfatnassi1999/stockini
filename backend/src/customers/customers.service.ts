import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

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

  // Calcule la dette totale d'un client : somme des restes à payer sur FACTURE non annulées
  async getClientDebt(clientId: string): Promise<{ debtAmount: number; unpaidInvoicesCount: number }> {
    const invoices = await this.prisma.sale.findMany({
      where: {
        customerId: clientId,
        documentType: 'FACTURE',
        status: { not: 'CANCELLED' },
      },
      select: { total: true, paidAmount: true },
    });

    let debtAmount = new Prisma.Decimal(0);
    let unpaidInvoicesCount = 0;

    for (const inv of invoices) {
      const total = new Prisma.Decimal(inv.total ?? 0);
      const paid = new Prisma.Decimal(inv.paidAmount ?? 0);
      const remaining = total.minus(paid);
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
        documentType: 'FACTURE',
        status: { not: 'CANCELLED' },
        customerId: { not: null },
      },
      select: { total: true, paidAmount: true },
    });

    let total = new Prisma.Decimal(0);
    for (const inv of invoices) {
      const remaining = new Prisma.Decimal(inv.total ?? 0).minus(new Prisma.Decimal(inv.paidAmount ?? 0));
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

    // Calcul des dettes en une seule requête groupée
    const invoices = await this.prisma.sale.findMany({
      where: {
        documentType: 'FACTURE',
        status: { not: 'CANCELLED' },
        customerId: { in: customers.map((c) => c.id) },
      },
      select: { customerId: true, total: true, paidAmount: true },
    });

    const debtMap = new Map<string, { debtAmount: Prisma.Decimal; unpaidInvoicesCount: number }>();
    for (const inv of invoices) {
      if (!inv.customerId) continue;
      const remaining = new Prisma.Decimal(inv.total ?? 0).minus(new Prisma.Decimal(inv.paidAmount ?? 0));
      if (remaining.greaterThan(0)) {
        const entry = debtMap.get(inv.customerId) ?? { debtAmount: new Prisma.Decimal(0), unpaidInvoicesCount: 0 };
        entry.debtAmount = entry.debtAmount.plus(remaining);
        entry.unpaidInvoicesCount++;
        debtMap.set(inv.customerId, entry);
      }
    }

    return customers.map((c) => {
      const debt = debtMap.get(c.id);
      return {
        ...c,
        debtAmount: debt ? debt.debtAmount.toNumber() : 0,
        unpaidInvoicesCount: debt ? debt.unpaidInvoicesCount : 0,
      };
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirstOrThrow({
      where: { id, deletedAt: null },
    });
    const debt = await this.getClientDebt(id);
    return { ...customer, ...debt };
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
}
