import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import {
  calcPurchasePriceTtc,
  calcSalePrice,
} from '../common/utils/pricing.util';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
  ) {}

  async create(dto: CreateProductDto) {
    const derivedPrices = this.derivePrices(dto.purchasePrice);
    return this.prisma.$transaction(async (tx) => {
      const reference = await this.references.generate('PRD', 'product', tx);
      return tx.product.create({
        data: { ...dto, ...derivedPrices, reference, sku: reference },
        include: this.includeRelations(),
      });
    });
  }

  async findAll(query: ProductQueryDto) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { sku: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.sku
        ? { sku: { contains: query.sku, mode: 'insensitive' } }
        : {}),
      ...(query.barcode
        ? { barcode: { contains: query.barcode, mode: 'insensitive' } }
        : {}),
      ...(query.name
        ? { name: { contains: query.name, mode: 'insensitive' } }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
    };

    if (query.stockStatus === 'out') {
      where.quantity = 0;
    }
    if (query.stockStatus === 'available') {
      where.quantity = { gt: 0 };
    }
    const products = await this.prisma.product.findMany({
      where,
      include: this.includeRelations(),
      orderBy: { createdAt: 'desc' },
    });

    if (query.stockStatus === 'low') {
      return products.filter(
        (product) =>
          product.quantity > 0 && product.quantity <= product.minStock,
      );
    }

    return products;
  }

  findOne(id: string) {
    return this.prisma.product.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: this.includeRelations(),
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    if (dto.sku !== undefined) {
      throw new BadRequestException('Product reference cannot be edited');
    }
    if (dto.quantity !== undefined) {
      const current = await this.prisma.product.findUniqueOrThrow({
        where: { id },
      });
      if (dto.quantity < 0) {
        throw new BadRequestException('Product quantity cannot be negative');
      }
      if (dto.quantity !== current.quantity) {
        throw new BadRequestException('Use stock endpoints to update quantity');
      }
    }

    const derivedPrices =
      dto.purchasePrice !== undefined
        ? this.derivePrices(dto.purchasePrice)
        : {};

    return this.prisma.product.update({
      where: { id },
      data: { ...dto, ...derivedPrices },
      include: this.includeRelations(),
    });
  }

  async remove(id: string, userId?: string) {
    this.logger.log(`DELETE /products/${id} called by ${userId ?? 'unknown'}`);
    await this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        isActive: false,
      },
    });
    this.logger.log(`Product ${id} archived by ${userId ?? 'unknown'}`);
    return { id };
  }

  private derivePrices(purchasePrice: number) {
    return {
      purchasePriceTtc: calcPurchasePriceTtc(purchasePrice),
      salePrice: calcSalePrice(purchasePrice),
    };
  }

  private includeRelations() {
    return {
      category: true,
      brand: true,
      supplier: true,
    } as const;
  }
}
