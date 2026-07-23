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
  type ProductSearchMode,
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
    const tva = dto.tva ?? 19;
    const derivedPrices = this.derivePrices(dto.purchasePrice, tva);
    return this.prisma.$transaction(async (tx) => {
      const idProduct = await this.references.generate('PRD', 'product', tx);
      return tx.product.create({
        data: {
          ...dto,
          tva,
          quantity: dto.quantity ?? 0,
          ...derivedPrices,
          idProduct,
          sku: idProduct,
        },
        include: this.includeRelations(),
      });
    });
  }

  async findAll(query: ProductQueryDto) {
    const purchasePriceFilter: Prisma.DecimalFilter<'Product'> = {};
    if (query.purchasePriceMin !== undefined)
      purchasePriceFilter.gte = query.purchasePriceMin;
    if (query.purchasePriceMax !== undefined)
      purchasePriceFilter.lte = query.purchasePriceMax;

    const salePriceFilter: Prisma.DecimalFilter<'Product'> = {};
    if (query.salePriceMin !== undefined)
      salePriceFilter.gte = query.salePriceMin;
    if (query.salePriceMax !== undefined)
      salePriceFilter.lte = query.salePriceMax;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.status === 'active' ? { isActive: true } : {}),
      ...(query.status === 'inactive' ? { isActive: false } : {}),
      ...(query.search
        ? { OR: this.buildSearchOR(query.search, query.searchMode) }
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
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(Object.keys(purchasePriceFilter).length > 0
        ? { purchasePrice: purchasePriceFilter }
        : {}),
      ...(Object.keys(salePriceFilter).length > 0
        ? { salePrice: salePriceFilter }
        : {}),
    };

    if (query.stockStatus === 'out') {
      where.quantity = 0;
    }
    if (query.stockStatus === 'available') {
      where.quantity = { gt: 0 };
    }
    if (query.stockStatus === 'low') {
      where.quantity = {
        gt: 0,
        lte: this.prisma.product.fields.minStock,
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const [products, totalItems] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: this.includeRelations(),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: products,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    };
  }

  findOne(id: string) {
    return this.prisma.product.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: this.includeRelations(),
    });
  }

  async update(id: string, dto: UpdateProductDto) {
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

    let derivedPrices = {};
    if (dto.purchasePrice !== undefined || dto.tva !== undefined) {
      const current = await this.prisma.product.findUniqueOrThrow({
        where: { id },
      });
      const tva = dto.tva ?? Number(current.tva);
      const priceHt = dto.purchasePrice ?? Number(current.purchasePrice);
      derivedPrices = this.derivePrices(priceHt, tva);
    }

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

  private buildSearchOR(
    search: string,
    mode?: 'REFERENCE' | 'DESIGNATION',
  ): Prisma.ProductWhereInput['OR'] {
    if (mode === 'REFERENCE') {
      return [
        { reference: { contains: search, mode: 'insensitive' } },
        { idProduct: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (mode === 'DESIGNATION') {
      return [
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    return [
      { reference: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { idProduct: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
    ];
  }

  private derivePrices(purchasePrice: number, tva: number = 19) {
    return {
      purchasePriceTtc: calcPurchasePriceTtc(purchasePrice, tva),
      salePrice: calcSalePrice(purchasePrice, tva),
    };
  }

  private includeRelations() {
    return {
      category: true,
      brand: true,
      supplier: true,
      lastSaleCustomer: true,
    } as const;
  }
}
