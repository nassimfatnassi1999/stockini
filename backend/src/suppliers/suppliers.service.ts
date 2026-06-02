import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PurchaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
  ) {}

  create(dto: CreateSupplierDto) {
    return this.prisma.$transaction(async (tx) =>
      tx.supplier.create({
        data: {
          ...dto,
          reference: await this.references.generate('FOU', 'supplier', tx),
        },
      }),
    );
  }

  async findAll(search?: string) {
    const suppliers = await this.prisma.supplier.findMany({
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

    const debts = await this.getDebtMap();
    return suppliers.map((supplier) => ({
      ...supplier,
      // « Notre dette » : ce que NOUS devons au fournisseur (somme des restes à payer).
      totalDebt: (debts.get(supplier.id) ?? new Prisma.Decimal(0)).toFixed(3),
    }));
  }

  /**
   * Dette totale par fournisseur = SUM(remainingAmount) des achats non totalement
   * payés (reste à payer > 0), hors achats annulés ou supprimés.
   * Agrégé en une seule requête groupBy (Decimal, sans erreur d'arrondi).
   */
  private async getDebtMap(): Promise<Map<string, Prisma.Decimal>> {
    const grouped = await this.prisma.purchase.groupBy({
      by: ['supplierId'],
      where: {
        deletedAt: null,
        status: { not: PurchaseStatus.CANCELLED },
        remainingAmount: { gt: 0 },
      },
      _sum: { remainingAmount: true },
    });
    return new Map(
      grouped.map((row) => [
        row.supplierId,
        row._sum.remainingAmount ?? new Prisma.Decimal(0),
      ]),
    );
  }

  /** Dette d'un fournisseur précis (reste à payer cumulé). */
  async getDebt(id: string) {
    const aggregate = await this.prisma.purchase.aggregate({
      where: {
        supplierId: id,
        deletedAt: null,
        status: { not: PurchaseStatus.CANCELLED },
        remainingAmount: { gt: 0 },
      },
      _sum: { remainingAmount: true },
    });
    return {
      supplierId: id,
      totalDebt: (aggregate._sum.remainingAmount ?? new Prisma.Decimal(0)).toFixed(3),
    };
  }

  findOne(id: string) {
    return this.prisma.supplier.findFirstOrThrow({
      where: { id, deletedAt: null },
    });
  }

  update(id: string, dto: UpdateSupplierDto) {
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId?: string) {
    this.logger.log(`DELETE /suppliers/${id} called by ${userId ?? 'unknown'}`);
    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId ?? null },
    });
    this.logger.log(`Supplier ${id} moved to trash by ${userId ?? 'unknown'}`);
    return { id };
  }
}
