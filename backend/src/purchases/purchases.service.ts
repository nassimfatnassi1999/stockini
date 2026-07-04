import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CaisseMovementType,
  PaymentStatus,
  Prisma,
  PurchaseDocumentType,
  PurchaseStatus,
  StockMovementType,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CaisseService } from '../caisse/caisse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import { commercialTotalFinal, DEFAULT_STAMP_DUTY } from '../common/utils/commercial-document';
import { PdfService } from '../documents/pdf.service';
import {
  CreatePurchaseDto,
  PayablePurchaseQueryDto,
  PurchasePaginationDto,
  ReceivePurchaseDto,
  TransformPurchaseDto,
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
    private readonly auditLogs: AuditLogsService,
    private readonly pdf: PdfService,
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
    const stampDuty = DEFAULT_STAMP_DUTY;
    const totalFinal = commercialTotalFinal(total, stampDuty);

    // All purchases start UNPAID — payments go through /payments/purchases/:id/pay
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          orderNumber: await this.references.generate('ACH', 'purchase', tx),
          supplierId: dto.supplierId,
          subtotal,
          discount,
          tax,
          total,
          stampDuty,
          paidAmount: 0,
          remainingAmount: totalFinal,
          paymentStatus: PaymentStatus.UNPAID,
          status: PurchaseStatus.ORDERED,
          documentType: PurchaseDocumentType.BON_COMMANDE,
          createdById,
          items: { create: items },
        },
        include: { supplier: true, items: true },
      });

      await this.auditLogs.audit({
        action: 'purchase.created',
        entity: 'Purchase',
        entityId: purchase.id,
        userId: createdById,
        newValue: {
          id: purchase.id,
          orderNumber: purchase.orderNumber,
          status: purchase.status,
          total: Number(purchase.total),
          supplierId: purchase.supplierId,
        },
        metadata: {
          orderNumber: purchase.orderNumber,
          supplierId: purchase.supplierId,
          supplierName: purchase.supplier?.name ?? null,
          total: Number(purchase.total),
          itemCount: purchase.items.length,
        },
      }, tx);

      return purchase;
    });
  }

  async findAll(query?: PurchasePaginationDto) {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(100, Math.max(1, query?.limit ?? 20));
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

    const sortOrder = query?.sortOrder ?? 'desc';
    const allowedSortFields: Record<string, Prisma.PurchaseOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder },
      date: { createdAt: sortOrder },
      totalTtc: { total: sortOrder },
      total: { total: sortOrder },
      paidAmount: { paidAmount: sortOrder },
      remainingAmount: { remainingAmount: sortOrder },
      clientName: { supplier: { name: sortOrder } },
      supplierName: { supplier: { name: sortOrder } },
      supplier: { supplier: { name: sortOrder } },
      reference: { orderNumber: sortOrder },
      orderNumber: { orderNumber: sortOrder },
      status: { status: sortOrder },
      paymentStatus: { paymentStatus: sortOrder },
    };
    const orderBy: Prisma.PurchaseOrderByWithRelationInput =
      (query?.sortBy && allowedSortFields[query.sortBy]) || { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        include: { supplier: true, items: true, payments: true },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Factures fournisseurs « à payer » : uniquement BON_RECEPTION et FACTURE_FOURNISSEUR
   * avec un reste à payer > 0. Les BON_COMMANDE sont exclus : ils ne créent pas de dette.
   */
  async findPayable(query?: PayablePurchaseQueryDto) {
    const where: Prisma.PurchaseWhereInput = {
      deletedAt: null,
      status: { not: PurchaseStatus.CANCELLED },
      remainingAmount: { gt: 0 },
      // Règle métier : un BC ne crée pas de dette — exclure explicitement
      documentType: { not: PurchaseDocumentType.BON_COMMANDE },
      ...(query?.paymentStatus && { paymentStatus: query.paymentStatus }),
      ...(query?.supplierId && { supplierId: query.supplierId }),
      ...(query?.search && {
        OR: [
          { orderNumber: { contains: query.search, mode: 'insensitive' } },
          {
            supplier: { name: { contains: query.search, mode: 'insensitive' } },
          },
        ],
      }),
    };

    const [data, aggregate] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        include: { supplier: true, payments: { where: { deletedAt: null } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchase.aggregate({
        where,
        _sum: { remainingAmount: true },
      }),
    ]);

    const totalRemaining = (
      aggregate._sum.remainingAmount ?? new Prisma.Decimal(0)
    ).toFixed(3);

    return { data, count: data.length, totalRemaining };
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

  async generatePdf(id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const purchase = await this.findOne(id);
    const buffer = await this.pdf.generateSaleDocument(
      {
        invoiceNumber: purchase.orderNumber,
        createdAt: purchase.createdAt,
        subtotal: Number(purchase.subtotal),
        discount: Number(purchase.discount),
        tax: Number(purchase.tax),
        total: Number(purchase.total),
        timbreFiscal: Number(purchase.stampDuty),
        customerName: purchase.supplier?.name ?? 'Fournisseur',
        customerAddress: purchase.supplier?.address,
        customerPhone: purchase.supplier?.phone,
        customerEmail: purchase.supplier?.email,
        items: purchase.items.map((item) => ({
          reference: item.product?.reference ?? '—',
          name: item.product?.name ?? '—',
          quantity: item.quantity,
          unitPrice: Number(item.unitCost),
          tvaPercent: Number(purchase.tax) > 0 && Number(purchase.subtotal) > 0
            ? (Number(purchase.tax) / Math.max(Number(purchase.subtotal) - Number(purchase.discount), 0.001)) * 100
            : 0,
          total: Number(item.total),
        })),
      },
      purchase.documentType,
    );
    return { buffer, fileName: `${purchase.orderNumber}.pdf` };
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

      let batchTotal = 0;
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

        batchTotal += item.quantity * Number(purchaseItem.unitCost);

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

      // Stock is updated above; caisse is NOT touched here.
      // Payment happens via POST /payments/purchases/:id/pay.
      const newStatus = allReceived
        ? PurchaseStatus.RECEIVED
        : someReceived
          ? PurchaseStatus.PARTIALLY_RECEIVED
          : PurchaseStatus.ORDERED;

      // Règle métier : dès qu'un article est réceptionné sur un BC,
      // le document devient un BR (dette fournisseur activée).
      // On ne touche pas au documentType si c'est déjà un BR ou FACTURE.
      const docActivation =
        someReceived && purchase.documentType === PurchaseDocumentType.BON_COMMANDE
          ? {
              documentType: PurchaseDocumentType.BON_RECEPTION,
              paymentStatus: PaymentStatus.UNPAID,
              paidAmount: 0,
              remainingAmount: commercialTotalFinal(purchase.total, purchase.stampDuty),
            }
          : {};

      const updated = await tx.purchase.update({
        where: { id },
        data: { status: newStatus, ...docActivation },
        include: { supplier: true, items: { include: { product: true } } },
      });

      await this.auditLogs.audit({
        action: 'purchase.received',
        entity: 'Purchase',
        entityId: id,
        userId,
        oldValue: { documentType: purchase.documentType, status: purchase.status },
        newValue: {
          documentType: updated.documentType,
          status: newStatus,
          ...(Object.keys(docActivation).length > 0 && { paymentStatus: PaymentStatus.UNPAID }),
        },
        metadata: {
          orderNumber: purchase.orderNumber,
          purchaseId: id,
          totalTtc: Number(purchase.total),
          paymentStatus: updated.paymentStatus,
          documentTypeChanged: purchase.documentType !== updated.documentType,
          receivedItems: dto.items.map((i) => ({
            purchaseItemId: i.purchaseItemId,
            quantity: i.quantity,
          })),
        },
      }, tx);

      return updated;
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

      // Reverse caisse per payment and soft-delete each payment.
      // Pass the original payment method so the reversal goes to the correct account.
      for (const payment of purchase.payments) {
        if (payment.cashImpactDone) {
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_ACHAT,
            montant: Number(payment.amount),
            motif: `Annulation achat ${purchase.orderNumber} — paiement ${payment.reference}`,
            referenceDoc: purchase.orderNumber,
            userId,
            paymentMethod: payment.method as string,
          });
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { deletedAt: new Date(), deletedBy: userId },
        });
      }

      const cancelled = await tx.purchase.update({
        where: { id },
        data: {
          status: PurchaseStatus.CANCELLED,
          paidAmount: 0,
          remainingAmount: commercialTotalFinal(purchase.total, purchase.stampDuty),
          paymentStatus: PaymentStatus.UNPAID,
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
          payments: true,
        },
      });

      await this.auditLogs.audit({
        action: 'purchase.cancelled',
        entity: 'Purchase',
        entityId: id,
        userId,
        oldValue: {
          status: purchase.status,
          paidAmount: Number(purchase.paidAmount),
          remainingAmount: Number(purchase.remainingAmount),
        },
        newValue: {
          status: PurchaseStatus.CANCELLED,
          paidAmount: 0,
          remainingAmount: Number(purchase.total),
        },
        metadata: { orderNumber: purchase.orderNumber },
      }, tx);

      return cancelled;
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

    const purchase = await this.prisma.purchase.findFirstOrThrow({
      where: { id, deletedAt: null },
      select: { id: true, orderNumber: true, status: true, total: true, supplierId: true },
    });

    await this.prisma.purchase.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId ?? null },
    });

    await this.auditLogs.audit({
      action: 'purchase.deleted',
      entity: 'Purchase',
      entityId: purchase.id,
      userId,
      oldValue: {
        id: purchase.id,
        orderNumber: purchase.orderNumber,
        status: purchase.status,
        total: Number(purchase.total),
        supplierId: purchase.supplierId,
        deletedAt: null,
      },
      newValue: { deletedAt: new Date().toISOString(), deletedBy: userId ?? null },
      metadata: { orderNumber: purchase.orderNumber },
    });

    this.logger.log(`Purchase ${id} moved to trash by ${userId ?? 'unknown'}`);
    return { id };
  }

  /**
   * Transforme un Bon de commande en Bon de réception ou Facture fournisseur.
   * C'est à ce moment que la dette fournisseur est « activée » (document devient payable).
   * Pour BON_RECEPTION, le stock est mis à jour pour tous les articles.
   */
  async transform(id: string, dto: TransformPurchaseDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirstOrThrow({
        where: { id, deletedAt: null },
        include: { supplier: true, items: true },
      });

      if (purchase.documentType !== PurchaseDocumentType.BON_COMMANDE) {
        throw new BadRequestException(
          `Ce document est déjà un ${purchase.documentType === PurchaseDocumentType.BON_RECEPTION ? 'Bon de réception' : 'Facture fournisseur'} et ne peut plus être transformé.`,
        );
      }

      if (purchase.status === PurchaseStatus.CANCELLED) {
        throw new BadRequestException('Un achat annulé ne peut pas être transformé.');
      }

      const targetType =
        dto.targetType === 'BON_RECEPTION'
          ? PurchaseDocumentType.BON_RECEPTION
          : PurchaseDocumentType.FACTURE_FOURNISSEUR;

      // Pour un Bon de réception, mettre à jour le stock
      if (targetType === PurchaseDocumentType.BON_RECEPTION) {
        for (const item of purchase.items) {
          const qty = item.quantity - item.receivedQuantity;
          if (qty > 0) {
            await tx.purchaseItem.update({
              where: { id: item.id },
              data: { receivedQuantity: item.quantity },
            });
            await this.stockService.applyMovement(tx, {
              productId: item.productId,
              type: StockMovementType.PURCHASE_RECEPTION,
              quantity: qty,
              reason: `Transformation BC→BR ${purchase.orderNumber}`,
              userId,
            });
          }
        }
      }

      const newStatus =
        targetType === PurchaseDocumentType.BON_RECEPTION
          ? PurchaseStatus.RECEIVED
          : purchase.status;

      // Activation de la dette fournisseur : le document devient payable.
      // On réasserte explicitement les champs financiers même s'ils étaient déjà
      // corrects depuis la création, pour éviter toute ambiguïté en cas de
      // données historiques ou de future évolution de la logique de création.
      const updated = await tx.purchase.update({
        where: { id },
        data: {
          documentType: targetType,
          status: newStatus,
          paymentStatus: PaymentStatus.UNPAID,
          paidAmount: 0,
          remainingAmount: commercialTotalFinal(purchase.total, purchase.stampDuty),
        },
        include: { supplier: true, items: { include: { product: true } } },
      });

      await this.auditLogs.audit({
        action: 'purchase.transformed',
        entity: 'Purchase',
        entityId: id,
        userId,
        oldValue: { documentType: PurchaseDocumentType.BON_COMMANDE, status: purchase.status },
        newValue: { documentType: targetType, status: newStatus, paymentStatus: PaymentStatus.UNPAID },
        metadata: {
          fromType: PurchaseDocumentType.BON_COMMANDE,
          toType: targetType,
          purchaseId: id,
          purchaseNumber: purchase.orderNumber,
          totalTtc: Number(purchase.total),
          paymentStatus: PaymentStatus.UNPAID,
          supplierId: purchase.supplierId,
          supplierName: purchase.supplier?.name ?? null,
        },
      }, tx);

      return updated;
    });
  }

  /**
   * Rapport d'intégrité : détecte les Bons de commande qui auraient des paiements liés.
   * Doit être consulté avant toute migration de données.
   */
  async integrityCheck() {
    const bcWithPayments = await this.prisma.purchase.findMany({
      where: {
        deletedAt: null,
        documentType: PurchaseDocumentType.BON_COMMANDE,
        payments: { some: { deletedAt: null } },
      },
      include: {
        supplier: true,
        payments: { where: { deletedAt: null } },
      },
    });

    return {
      count: bcWithPayments.length,
      anomalies: bcWithPayments.map((p) => ({
        id: p.id,
        orderNumber: p.orderNumber,
        supplier: p.supplier?.name,
        total: Number(p.total),
        paidAmount: Number(p.paidAmount),
        remainingAmount: Number(p.remainingAmount),
        paymentsCount: p.payments.length,
        payments: p.payments.map((pay) => ({
          id: pay.id,
          reference: pay.reference,
          amount: Number(pay.amount),
          method: pay.method,
          createdAt: pay.createdAt,
        })),
      })),
      message:
        bcWithPayments.length === 0
          ? 'Aucune anomalie : aucun Bon de commande ne possède de paiement lié.'
          : `ANOMALIE : ${bcWithPayments.length} Bon(s) de commande possède(nt) des paiements. À corriger manuellement.`,
    };
  }

  private paymentStatus(total: number, paidAmount: number) {
    if (paidAmount <= 0) return PaymentStatus.UNPAID;
    if (paidAmount < total) return PaymentStatus.PARTIAL;
    return PaymentStatus.PAID;
  }
}
