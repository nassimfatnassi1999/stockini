import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto, include: this.includeRelations() });
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
      ...(query.sku ? { sku: { contains: query.sku, mode: 'insensitive' } } : {}),
      ...(query.barcode ? { barcode: { contains: query.barcode, mode: 'insensitive' } } : {}),
      ...(query.name ? { name: { contains: query.name, mode: 'insensitive' } } : {}),
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
      return products.filter((product) => product.quantity > 0 && product.quantity <= product.minStock);
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
    if (dto.quantity !== undefined) {
      const current = await this.prisma.product.findUniqueOrThrow({ where: { id } });
      if (dto.quantity < 0) {
        throw new BadRequestException('Product quantity cannot be negative');
      }
      if (dto.quantity !== current.quantity) {
        throw new BadRequestException('Use stock endpoints to update quantity');
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: this.includeRelations(),
    });
  }

  remove(id: string) {
    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
      include: this.includeRelations(),
    });
  }

  private includeRelations() {
    return {
      category: true,
      brand: true,
      supplier: true,
    } as const;
  }
}
