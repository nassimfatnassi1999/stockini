import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getSupplierDebtMap } from '../common/services/purchase-payment-state';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { buildPaginatedResponse } from '../common/utils/pagination.util';

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

  async findAll(query: SupplierQueryDto = new SupplierQueryDto()) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.SupplierWhereInput = query.search
        ? {
            deletedAt: null,
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { reference: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : { deletedAt: null };
    const [suppliers, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    const debts = await getSupplierDebtMap(
      this.prisma,
      suppliers.map((supplier) => supplier.id),
    );
    const data = suppliers.map((supplier) => ({
      ...supplier,
      // « Notre dette » : ce que NOUS devons au fournisseur (somme des restes à payer).
      totalDebt: (debts.get(supplier.id) ?? new Prisma.Decimal(0)).toFixed(3),
    }));
    return buildPaginatedResponse(data, page, limit, total);
  }

  /** Dette dynamique d'un fournisseur précis. */
  async getDebt(id: string) {
    const debts = await getSupplierDebtMap(this.prisma, [id]);
    return {
      supplierId: id,
      totalDebt: (debts.get(id) ?? new Prisma.Decimal(0)).toFixed(3),
    };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findFirstOrThrow({
      where: { id, deletedAt: null },
    });
    const debts = await getSupplierDebtMap(this.prisma, [id]);
    return {
      ...supplier,
      totalDebt: (debts.get(id) ?? new Prisma.Decimal(0)).toFixed(3),
    };
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
