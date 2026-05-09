import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  PaymentStatus,
  PurchaseStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import {
  CreatePurchaseDto,
  ReceivePurchaseDto,
  UpdatePurchaseDto,
} from './dto/purchase.dto';

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly references: ReferenceGeneratorService,
    private readonly settings: SettingsService,
  ) {}

  async create(dto: CreatePurchaseDto, createdById?: string) {
    if (!dto.items.length) {
      throw new BadRequestException('Purchase must include at least one item');
    }

    const items = dto.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitCost: item.unitCost,
      total: item.quantity * item.unitCost,
    }));
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = dto.discount ?? 0;
    const tax = dto.tax ?? 0;
    const total = subtotal - discount + tax;
    const paidAmount = dto.paidAmount ?? 0;

    return this.prisma.$transaction(async (tx) =>
      tx.purchase.create({
        data: {
          orderNumber: await this.references.generate('ACH', 'purchase', tx),
          supplierId: dto.supplierId,
          subtotal,
          discount,
          tax,
          total,
          paidAmount,
          remainingAmount: Math.max(total - paidAmount, 0),
          paymentStatus: this.paymentStatus(total, paidAmount),
          status: PurchaseStatus.ORDERED,
          createdById,
          items: { create: items },
        },
        include: { supplier: true, items: true },
      }),
    );
  }

  findAll() {
    return this.prisma.purchase.findMany({
      where: { deletedAt: null },
      include: { supplier: true, items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.purchase.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        items: { include: { product: true } },
        payments: true,
      },
    });
  }

  receive(id: string, dto: ReceivePurchaseDto, userId?: string) {
    if (!dto.items.length) {
      throw new BadRequestException('Reception must include at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      if (purchase.status === PurchaseStatus.CANCELLED) {
        throw new BadRequestException('Cancelled purchase cannot be received');
      }

      const purchaseItemsById = new Map(
        purchase.items.map((item) => [item.id, item]),
      );
      for (const item of dto.items) {
        const purchaseItem = purchaseItemsById.get(item.purchaseItemId);
        if (!purchaseItem) {
          throw new BadRequestException(
            `Purchase item ${item.purchaseItemId} not found`,
          );
        }
        const nextReceivedQuantity =
          purchaseItem.receivedQuantity + item.quantity;
        if (nextReceivedQuantity > purchaseItem.quantity) {
          throw new BadRequestException(
            'Received quantity exceeds ordered quantity',
          );
        }

        await tx.purchaseItem.update({
          where: { id: purchaseItem.id },
          data: { receivedQuantity: nextReceivedQuantity },
        });
        await this.stockService.applyMovement(tx, {
          productId: purchaseItem.productId,
          type: StockMovementType.PURCHASE_RECEPTION,
          quantity: item.quantity,
          reason: 'Purchase reception',
          userId,
        });
      }

      const updatedItems = await tx.purchaseItem.findMany({
        where: { purchaseId: id },
      });
      const allReceived = updatedItems.every(
        (item) => item.receivedQuantity >= item.quantity,
      );
      const someReceived = updatedItems.some(
        (item) => item.receivedQuantity > 0,
      );

      return tx.purchase.update({
        where: { id },
        data: {
          status: allReceived
            ? PurchaseStatus.RECEIVED
            : someReceived
              ? PurchaseStatus.PARTIALLY_RECEIVED
              : PurchaseStatus.ORDERED,
        },
        include: { supplier: true, items: { include: { product: true } } },
      });
    });
  }

  cancel(id: string) {
    return this.prisma.purchase.update({
      where: { id },
      data: { status: PurchaseStatus.CANCELLED },
    });
  }

  async update(id: string, dto: UpdatePurchaseDto) {
    await this.settings.assertActiveOption('purchase_statuses', dto.status);
    await this.settings.assertActiveOption(
      'payment_statuses',
      dto.paymentStatus,
    );
    const purchase = await this.prisma.purchase.findUniqueOrThrow({
      where: { id },
    });
    const paidAmount = dto.paidAmount ?? Number(purchase.paidAmount);
    return this.prisma.purchase.update({
      where: { id },
      data: {
        status: dto.status,
        paymentStatus: dto.paymentStatus,
        paidAmount,
        remainingAmount: Math.max(Number(purchase.total) - paidAmount, 0),
      },
      include: {
        supplier: true,
        items: { include: { product: true } },
        payments: true,
      },
    });
  }

  async remove(id: string, userId?: string) {
    this.logger.log(`DELETE /purchases/${id} called by ${userId ?? 'unknown'}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.delete({ where: { id } });
    });
    this.logger.log(`Purchase ${id} permanently deleted by ${userId ?? 'unknown'}`);
    return { id };
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
}
