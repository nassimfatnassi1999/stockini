import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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

  findAll(search?: string) {
    return this.prisma.supplier.findMany({
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
    const [purchasesCount, productsCount] = await Promise.all([
      this.prisma.purchase.count({ where: { supplierId: id } }),
      this.prisma.product.count({ where: { supplierId: id } }),
    ]);
    if (purchasesCount > 0 || productsCount > 0) {
      throw new BadRequestException(
        'Ce fournisseur est lié à des achats ou produits. Suppression refusée.',
      );
    }
    await this.prisma.supplier.delete({ where: { id } });
    this.logger.log(
      `Supplier ${id} permanently deleted by ${userId ?? 'unknown'}`,
    );
    return { id };
  }
}
