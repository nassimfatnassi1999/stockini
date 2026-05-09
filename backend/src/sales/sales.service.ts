import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  PaymentStatus,
  PaymentType,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateSaleDto, UpdateSaleDto } from './dto/sale.dto';

const MIN_MARGIN_PERCENT = 20;

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly references: ReferenceGeneratorService,
    private readonly settings: SettingsService,
  ) {}

  async create(dto: CreateSaleDto, user?: AuthUser) {
    if (!dto.items.length) {
      throw new BadRequestException('Sale must include at least one item');
    }
    await this.settings.assertActiveOption(
      'payment_methods',
      dto.paymentMethod,
    );

    const allowLowMargin = this.hasPermission(user, 'sales.allow_low_margin');

    return this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.references.generate('INV', 'sale', tx);
      const productIds = dto.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
      });
      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );

      const items = dto.items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) {
          throw new BadRequestException(`Product ${item.productId} not found`);
        }
        if (product.quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${product.name}`,
          );
        }

        const unitPrice = item.unitPrice ?? Number(product.salePrice);
        const discountPercent = item.discountPercent ?? 0;
        const netUnitPrice = unitPrice * (1 - discountPercent / 100);

        // Server-side margin check (uses net price after per-line discount)
        const purchasePriceHt = Number(product.purchasePrice);
        if (purchasePriceHt <= 0) {
          throw new BadRequestException(
            `Le produit "${product.name}" n'a pas de prix d'achat défini. Vente refusée.`,
          );
        }
        const marginPercent =
          ((netUnitPrice - purchasePriceHt) / purchasePriceHt) * 100;
        if (marginPercent < MIN_MARGIN_PERCENT && !allowLowMargin) {
          throw new BadRequestException(
            `Vente refusée : vous n'avez pas le droit de vendre avec une marge inférieure à 20% (produit "${product.name}", marge actuelle ${marginPercent.toFixed(2)}%).`,
          );
        }

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

      const sellerId = user?.id;
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
          reason: 'Sale',
          userId: sellerId,
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { lastSellingPrice: item.unitPrice },
        });
      }

      if (paidAmount > 0 && dto.paymentMethod) {
        await tx.payment.create({
          data: {
            reference: await this.references.generate('PAY', 'payment', tx),
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
        include: {
          items: { include: { product: true } },
          customer: true,
          seller: true,
          payments: true,
        },
      });
    });
  }

  findAll() {
    return this.prisma.sale.findMany({
      where: { deletedAt: null },
      include: { customer: true, items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string, user?: AuthUser) {
    if (!this.hasPermission(user, 'sales.view_details')) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission de voir les détails d'une vente",
      );
    }
    return this.prisma.sale.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        items: { include: { product: true } },
        payments: true,
      },
    });
  }

  cancel(id: string, user?: AuthUser) {
    if (!this.hasPermission(user, 'sales.delete')) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission d'annuler une vente",
      );
    }
    const userId = user?.id;
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

  async update(id: string, dto: UpdateSaleDto) {
    await this.settings.assertActiveOption('sale_statuses', dto.status);
    await this.settings.assertActiveOption(
      'payment_statuses',
      dto.paymentStatus,
    );
    const sale = await this.prisma.sale.findUniqueOrThrow({ where: { id } });
    const paidAmount = dto.paidAmount ?? Number(sale.paidAmount);
    return this.prisma.sale.update({
      where: { id },
      data: {
        status: dto.status,
        paymentStatus: dto.paymentStatus,
        paidAmount,
        remainingAmount: Math.max(Number(sale.total) - paidAmount, 0),
      },
      include: {
        customer: true,
        items: { include: { product: true } },
        payments: true,
      },
    });
  }

  remove(id: string, user?: AuthUser) {
    if (!this.hasPermission(user, 'sales.delete')) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission de supprimer une vente",
      );
    }
    const userId = user?.id;
    this.logger.log(`DELETE /sales/${id} called by ${userId ?? 'unknown'}`);
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      if (sale.status !== SaleStatus.CANCELLED) {
        for (const item of sale.items) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.CUSTOMER_RETURN,
            quantity: item.quantity,
            reason: 'Sale deleted',
            userId,
          });
        }
      }
      await tx.payment.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });
      this.logger.log(`Sale ${id} permanently deleted by ${userId ?? 'unknown'}`);
      return { id };
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

  /** Returns true when the user holds a specific permission or the wildcard '*'. */
  private hasPermission(user: AuthUser | undefined, permission: string): boolean {
    if (!user) return false;
    const perms = user.permissions ?? [];
    return perms.includes('*') || perms.includes(permission);
  }
}
