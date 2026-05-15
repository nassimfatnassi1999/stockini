import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CaisseMovementType,
  PaymentStatus,
  Prisma,
  PurchaseStatus,
  StockMovementType,
} from '@prisma/client';
import { CaisseService } from '../caisse/caisse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import {
  CreatePurchaseDto,
  PurchasePaginationDto,
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
    private readonly caisseService: CaisseService,
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

    // All purchases start UNPAID — payments go through /payments/purchases/:id/pay
    return this.prisma.$transaction(async (tx) =>
      tx.purchase.create({
        data: {
          orderNumber: await this.references.generate('ACH', 'purchase', tx),
          supplierId: dto.supplierId,
          subtotal,
          discount,
          tax,
          total,
          paidAmount: 0,
          remainingAmount: total,
          paymentStatus: PaymentStatus.UNPAID,
          status: PurchaseStatus.ORDERED,
          createdById,
          items: { create: items },
        },
        include: { supplier: true, items: true },
      }),
    );
  }

  async findAll(query?: PurchasePaginationDto) {
    const page = query?.page ?? 1;
    const limit = Math.min(query?.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {
      deletedAt: null,
      ...(query?.status && { status: query.status }),
      ...(query?.paymentStatus && { paymentStatus: query.paymentStatus }),
      ...(query?.supplierId && { supplierId: query.supplierId }),
      ...((query?.dateFrom || query?.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
      ...(query?.search && {
        OR: [
          { orderNumber: { contains: query.search, mode: 'insensitive' } },
          {
            supplier: { name: { contains: query.search, mode: 'insensitive' } },
          },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        include: { supplier: true, items: true, payments: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
          reason: `Réception achat ${purchase.orderNumber}`,
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

  cancel(id: string, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id },
        include: {
          items: true,
          payments: { where: { deletedAt: null } },
        },
      });

      if (purchase.status === PurchaseStatus.CANCELLED) {
        throw new BadRequestException('Achat déjà annulé');
      }

      // Reverse stock for all received items
      for (const item of purchase.items) {
        if (item.receivedQuantity > 0) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.SUPPLIER_RETURN,
            quantity: item.receivedQuantity,
            reason: `Annulation achat ${purchase.orderNumber}`,
            userId,
          });
        }
      }

      // Reverse caisse per payment and soft-delete each payment
      for (const payment of purchase.payments) {
        if (payment.cashImpactDone) {
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_ACHAT,
            montant: Number(payment.amount),
            motif: `Annulation achat ${purchase.orderNumber} — paiement ${payment.reference}`,
            referenceDoc: purchase.orderNumber,
            userId,
          });
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { deletedAt: new Date(), deletedBy: userId },
        });
      }

      return tx.purchase.update({
        where: { id },
        data: {
          status: PurchaseStatus.CANCELLED,
          paidAmount: 0,
          remainingAmount: purchase.total,
          paymentStatus: PaymentStatus.UNPAID,
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
          payments: true,
        },
      });
    });
  }

  async update(id: string, dto: UpdatePurchaseDto) {
    if (dto.status === PurchaseStatus.CANCELLED) {
      return this.cancel(id);
    }
    await this.settings.assertActiveOption('purchase_statuses', dto.status);
    return this.prisma.purchase.update({
      where: { id },
      data: { status: dto.status },
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
      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id },
        include: {
          items: true,
          payments: { where: { deletedAt: null } },
        },
      });

      // Reverse stock for items already received
      for (const item of purchase.items) {
        if (item.receivedQuantity > 0) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.SUPPLIER_RETURN,
            quantity: item.receivedQuantity,
            reason: `Suppression achat ${purchase.orderNumber}`,
            userId,
          });
        }
      }

      // Reverse caisse per active payment
      if (purchase.status !== PurchaseStatus.CANCELLED) {
        for (const payment of purchase.payments) {
          if (payment.cashImpactDone) {
            await this.caisseService.recordMovement(tx, {
              type: CaisseMovementType.ANNULATION_ACHAT,
              montant: Number(payment.amount),
              motif: `Suppression achat ${purchase.orderNumber} — paiement ${payment.reference}`,
              referenceDoc: purchase.orderNumber,
              userId,
            });
          }
        }
      }

      await tx.payment.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.delete({ where: { id } });
    });
    this.logger.log(
      `Purchase ${id} permanently deleted by ${userId ?? 'unknown'}`,
    );
    return { id };
  }

  private paymentStatus(total: number, paidAmount: number) {
    if (paidAmount <= 0) return PaymentStatus.UNPAID;
    if (paidAmount < total) return PaymentStatus.PARTIAL;
    return PaymentStatus.PAID;
  }
}
