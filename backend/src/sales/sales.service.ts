import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentStatus, PaymentType, SaleStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { CreateSaleDto } from './dto/sale.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  async create(dto: CreateSaleDto, sellerId?: string) {
    if (!dto.items.length) {
      throw new BadRequestException('Sale must include at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.nextInvoiceNumber();
      const productIds = dto.items.map((item) => item.productId);
      const products = await tx.product.findMany({ where: { id: { in: productIds }, deletedAt: null } });
      const productsById = new Map(products.map((product) => [product.id, product]));

      const items = dto.items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) {
          throw new BadRequestException(`Product ${item.productId} not found`);
        }
        if (product.quantity < item.quantity) {
          throw new BadRequestException(`Insufficient stock for ${product.name}`);
        }
        const unitPrice = item.unitPrice ?? Number(product.salePrice);
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          total: unitPrice * item.quantity,
        };
      });

      const subtotal = items.reduce((sum, item) => sum + item.total, 0);
      const discount = dto.discount ?? 0;
      const tax = dto.tax ?? 0;
      const total = subtotal - discount + tax;
      const paidAmount = dto.paidAmount ?? 0;
      const remainingAmount = Math.max(total - paidAmount, 0);
      const paymentStatus = this.paymentStatus(total, paidAmount);

      const sale = await tx.sale.create({
        data: {
          invoiceNumber,
          customerId: dto.customerId,
          subtotal,
          discount,
          tax,
          total,
          paidAmount,
          remainingAmount,
          paymentStatus,
          status: SaleStatus.COMPLETED,
          sellerId,
          items: {
            create: items,
          },
        },
        include: { items: true, customer: true, seller: true, payments: true },
      });

      for (const item of items) {
        await this.stockService.applyMovement(tx, {
          productId: item.productId,
          type: StockMovementType.SALE,
          quantity: item.quantity,
          reference: invoiceNumber,
          reason: 'Sale',
          userId: sellerId,
        });
      }

      if (paidAmount > 0 && dto.paymentMethod) {
        await tx.payment.create({
          data: {
            type: PaymentType.CUSTOMER_PAYMENT,
            method: dto.paymentMethod,
            amount: paidAmount,
            saleId: sale.id,
            customerId: dto.customerId,
          },
        });
      }

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { items: { include: { product: true } }, customer: true, seller: true, payments: true },
      });
    });
  }

  findAll() {
    return this.prisma.sale.findMany({
      include: { customer: true, items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.sale.findUniqueOrThrow({
      where: { id },
      include: { customer: true, items: { include: { product: true } }, payments: true },
    });
  }

  cancel(id: string, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Sale is already cancelled');
      }

      for (const item of sale.items) {
        await this.stockService.applyMovement(tx, {
          productId: item.productId,
          type: StockMovementType.CUSTOMER_RETURN,
          quantity: item.quantity,
          reason: 'Sale cancellation',
          reference: sale.invoiceNumber,
          userId,
        });
      }

      return tx.sale.update({
        where: { id },
        data: { status: SaleStatus.CANCELLED },
        include: { items: true, payments: true },
      });
    });
  }

  private paymentStatus(total: number, paidAmount: number) {
    if (paidAmount <= 0) {
      return PaymentStatus.UNPAID;
    }
    if (paidAmount < total) {
      return PaymentStatus.PARTIAL;
    }
    return PaymentStatus.PAID;
  }

  private async nextInvoiceNumber() {
    const count = await this.prisma.sale.count();
    return `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
  }
}
