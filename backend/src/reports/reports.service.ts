import { Injectable } from '@nestjs/common';
import { DocumentType, PaymentStatus, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [
      productsCount,
      lowStockCount,
      customersCount,
      salesAggregate,
      unpaidSales,
    ] = await Promise.all([
      this.prisma.product.count({ where: { deletedAt: null, isActive: true } }),
      this.lowStockProducts(),
      this.prisma.customer.count(),
      this.prisma.sale.aggregate({
        where: { documentType: DocumentType.FACTURE, status: SaleStatus.COMPLETED, deletedAt: null },
        _sum: { total: true, paidAmount: true },
        _count: true,
      }),
      this.prisma.sale.count({
        where: {
          documentType: DocumentType.FACTURE,
          paymentStatus: { not: PaymentStatus.PAID },
          status: { not: SaleStatus.CANCELLED },
          deletedAt: null,
        },
      }),
    ]);

    return {
      productsCount,
      lowStockCount: lowStockCount.length,
      customersCount,
      salesCount: salesAggregate._count,
      salesTotal: salesAggregate._sum.total ?? 0,
      paidTotal: salesAggregate._sum.paidAmount ?? 0,
      unpaidSales,
    };
  }

  async stockValue() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { quantity: true, purchasePrice: true, salePrice: true },
    });

    return products.reduce(
      (totals, product) => ({
        purchaseValue:
          totals.purchaseValue +
          product.quantity * Number(product.purchasePrice),
        saleValue:
          totals.saleValue + product.quantity * Number(product.salePrice),
      }),
      { purchaseValue: 0, saleValue: 0 },
    );
  }

  async lowStockProducts() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      include: { category: true, brand: true },
      orderBy: { quantity: 'asc' },
    });
    return products.filter((product) => product.quantity <= product.minStock);
  }

  async topSellingProducts(limit = 10) {
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((item) => item.productId) } },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    return grouped.map((item) => ({
      product: productsById.get(item.productId),
      quantity: item._sum.quantity ?? 0,
      total: item._sum.total ?? 0,
    }));
  }

  salesSummary() {
    return this.prisma.sale.aggregate({
      where: { status: SaleStatus.COMPLETED },
      _sum: {
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        paidAmount: true,
        remainingAmount: true,
      },
      _count: true,
    });
  }
}
