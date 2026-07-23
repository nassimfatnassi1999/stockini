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
import {
  commercialTotalFinal,
  DEFAULT_STAMP_DUTY,
} from '../common/utils/commercial-document';
import {
  calculatePurchaseLine,
  calculatePurchaseTotals,
  purchaseRound3,
} from '../common/utils/purchase-calculations';
import { PdfService } from '../documents/pdf.service';
import {
  getPurchasePaymentSummary,
  serializePaymentSummary,
  VALID_SUPPLIER_PAYMENT_WHERE,
} from '../common/services/purchase-payment-state';
import { calculatePaymentAmounts } from '../common/utils/payment-status';
import { buildPaginatedResponse } from '../common/utils/pagination.util';
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

    const items = dto.items.map((item) => {
      const calculation = calculatePurchaseLine(item);
      return {
        productId: item.productId,
        designation: item.designation?.trim(),
        quantity: item.quantity,
        unitCost: purchaseRound3(item.unitCost),
        discountPercent: item.discountPercent ?? 0,
        tvaPercent: item.tvaPercent ?? 0,
        total: calculation.netHt,
        discountAmount: calculation.discountAmount,
        taxAmount: calculation.taxAmount,
        grossHt: calculation.grossHt,
      };
    });
    const hasLinePricing = dto.items.some(
      (item) =>
        item.discountPercent !== undefined || item.tvaPercent !== undefined,
    );
    const stampDuty = dto.stampDuty ?? DEFAULT_STAMP_DUTY;
    const lineTotals = calculatePurchaseTotals(
      items.map((item) => ({
        grossHt: item.grossHt,
        discountAmount: item.discountAmount,
        netHt: item.total,
        taxAmount: item.taxAmount,
        totalTtc: purchaseRound3(item.total + item.taxAmount),
      })),
      stampDuty,
    );
    const grossSubtotal = lineTotals.grossSubtotal;
    const subtotal = hasLinePricing
      ? lineTotals.subtotal
      : purchaseRound3(grossSubtotal - (dto.discount ?? 0));
    const discount = hasLinePricing
      ? lineTotals.discount
      : purchaseRound3(dto.discount ?? 0);
    const tax = hasLinePricing ? lineTotals.tax : purchaseRound3(dto.tax ?? 0);
    const total = purchaseRound3(subtotal + tax);
    const totalFinal = purchaseRound3(total + stampDuty);

    // All purchases start UNPAID — payments go through /payments/purchases/:id/pay
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          orderNumber: await this.references.generate('ACH', 'purchase', tx),
          supplierId: dto.supplierId,
          supplierReference: this.optionalReference(dto.supplierReference),
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
          ...(dto.date && { createdAt: new Date(dto.date) }),
          items: {
            create: items.map(
              ({
                discountAmount: _discountAmount,
                taxAmount: _taxAmount,
                grossHt: _grossHt,
                ...item
              }) => item,
            ),
          },
        },
        include: { supplier: true, items: true },
      });

      await this.auditLogs.audit(
        {
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
            supplierReference: purchase.supplierReference,
          },
          metadata: {
            orderNumber: purchase.orderNumber,
            supplierId: purchase.supplierId,
            supplierName: purchase.supplier?.name ?? null,
            total: Number(purchase.total),
            itemCount: purchase.items.length,
          },
        },
        tx,
      );

      return purchase;
    });
  }

  async findAll(query?: PurchasePaginationDto) {
    const page = Math.max(1, query?.page ?? 1);
    const limit = query?.limit ?? 10;
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
            supplierReference: { contains: query.search, mode: 'insensitive' },
          },
          {
            supplier: { name: { contains: query.search, mode: 'insensitive' } },
          },
        ],
      }),
    };

    const sortOrder = query?.sortOrder ?? 'desc';
    const allowedSortFields: Record<
      string,
      Prisma.PurchaseOrderByWithRelationInput
    > = {
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
    const orderBy: Prisma.PurchaseOrderByWithRelationInput = (query?.sortBy &&
      allowedSortFields[query.sortBy]) || { createdAt: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        include: {
          supplier: true,
          items: true,
          payments: { where: VALID_SUPPLIER_PAYMENT_WHERE },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.purchase.count({ where }),
    ]);
    const data = rows.map((purchase) => this.withPaymentState(purchase));

    return buildPaginatedResponse(data, page, limit, total);
  }

  /**
   * Factures fournisseurs « à payer » : uniquement BON_RECEPTION et FACTURE_FOURNISSEUR
   * avec un reste à payer > 0. Les BON_COMMANDE sont exclus : ils ne créent pas de dette.
   */
  async findPayable(query?: PayablePurchaseQueryDto) {
    const where: Prisma.PurchaseWhereInput = {
      deletedAt: null,
      status: { not: PurchaseStatus.CANCELLED },
      // Règle métier : un BC ne crée pas de dette — exclure explicitement
      documentType: { not: PurchaseDocumentType.BON_COMMANDE },
      ...(query?.supplierId && { supplierId: query.supplierId }),
      ...(query?.search && {
        OR: [
          { orderNumber: { contains: query.search, mode: 'insensitive' } },
          {
            supplierReference: { contains: query.search, mode: 'insensitive' },
          },
          {
            supplier: { name: { contains: query.search, mode: 'insensitive' } },
          },
        ],
      }),
    };

    const purchases = await this.prisma.purchase.findMany({
      where,
      include: {
        supplier: true,
        payments: { where: VALID_SUPPLIER_PAYMENT_WHERE },
      },
      orderBy: { createdAt: 'desc' },
    });
    const data = purchases
      .map((purchase) => this.withPaymentState(purchase))
      .filter(
        (purchase) =>
          new Prisma.Decimal(purchase.remainingAmount).gt(0) &&
          (!query?.paymentStatus ||
            purchase.paymentStatus === query.paymentStatus),
      );
    const totalRemaining = data
      .reduce(
        (sum, purchase) => sum.plus(purchase.remainingAmount),
        new Prisma.Decimal(0),
      )
      .toFixed(3);

    return { data, count: data.length, totalRemaining };
  }

  async findOne(id: string) {
    const purchase = await this.prisma.purchase.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        items: { include: { product: true } },
        payments: { where: VALID_SUPPLIER_PAYMENT_WHERE },
      },
    });
    return this.withPaymentState(purchase);
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
        supplierReference: purchase.supplierReference,
        items: purchase.items.map((item) => ({
          reference: item.product?.reference ?? '—',
          name: item.designation ?? item.product?.name ?? '—',
          quantity: item.quantity,
          unitPrice: Number(item.unitCost),
          tvaPercent: Number(item.tvaPercent ?? 0),
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
        someReceived &&
        purchase.documentType === PurchaseDocumentType.BON_COMMANDE
          ? {
              documentType: PurchaseDocumentType.BON_RECEPTION,
              paymentStatus: PaymentStatus.UNPAID,
              paidAmount: 0,
              remainingAmount: commercialTotalFinal(
                purchase.total,
                purchase.stampDuty,
              ),
            }
          : {};

      const supplierReferenceUpdate = {
        ...(dto.supplierReference !== undefined && {
          supplierReference: this.optionalReference(dto.supplierReference),
        }),
      };

      const updated = await tx.purchase.update({
        where: { id },
        data: {
          status: newStatus,
          ...docActivation,
          ...supplierReferenceUpdate,
        },
        include: { supplier: true, items: { include: { product: true } } },
      });

      await this.auditLogs.audit(
        {
          action: 'purchase.received',
          entity: 'Purchase',
          entityId: id,
          userId,
          oldValue: {
            documentType: purchase.documentType,
            status: purchase.status,
          },
          newValue: {
            documentType: updated.documentType,
            status: newStatus,
            supplierReference: updated.supplierReference,
            ...(Object.keys(docActivation).length > 0 && {
              paymentStatus: PaymentStatus.UNPAID,
            }),
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
        },
        tx,
      );

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
            paymentMethod: payment.method,
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
          remainingAmount: commercialTotalFinal(
            purchase.total,
            purchase.stampDuty,
          ),
          paymentStatus: PaymentStatus.UNPAID,
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
          payments: true,
        },
      });

      await this.auditLogs.audit(
        {
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
        },
        tx,
      );

      return cancelled;
    });
  }

  async update(id: string, dto: UpdatePurchaseDto, userId?: string) {
    if (dto.status === PurchaseStatus.CANCELLED) {
      return this.cancel(id);
    }
    if (dto.status) {
      await this.settings.assertActiveOption('purchase_statuses', dto.status);
    }
    if (dto.items) {
      if (!dto.items.length)
        throw new BadRequestException(
          'L’achat doit contenir au moins une ligne',
        );
      const requestedItems = dto.items;
      return this.prisma.$transaction(async (tx) => {
        const previous = await tx.purchase.findFirst({
          where: { id, deletedAt: null },
          include: { items: true, payments: { where: { deletedAt: null } } },
        });
        if (!previous)
          throw new BadRequestException(
            'Achat introuvable ou placé dans la corbeille',
          );
        if (previous.status === PurchaseStatus.CANCELLED)
          throw new BadRequestException(
            'Impossible de modifier un achat annulé',
          );
        if (dto.documentType && dto.documentType !== previous.documentType)
          throw new BadRequestException(
            'Le type d’un achat existant ne peut pas être changé',
          );
        const oldById = new Map(previous.items.map((item) => [item.id, item]));
        for (const item of requestedItems) {
          if (item.id && !oldById.has(item.id))
            throw new BadRequestException(
              `Ligne d’achat ${item.id} introuvable`,
            );
        }
        const products = await tx.product.findMany({
          where: {
            id: {
              in: [...new Set(requestedItems.map((item) => item.productId))],
            },
            deletedAt: null,
          },
        });
        const productsById = new Map(
          products.map((product) => [product.id, product]),
        );
        const calculated = requestedItems.map((item) => {
          const product = productsById.get(item.productId);
          if (!product)
            throw new BadRequestException(
              `Produit ${item.productId} introuvable`,
            );
          const tvaPercent = item.tvaPercent ?? Number(product.tva ?? 0);
          const values = calculatePurchaseLine({ ...item, tvaPercent });
          const old = item.id ? oldById.get(item.id) : undefined;
          const receivedQuantity =
            previous.documentType === PurchaseDocumentType.BON_RECEPTION &&
            previous.status === PurchaseStatus.RECEIVED
              ? item.quantity
              : Math.min(old?.receivedQuantity ?? 0, item.quantity);
          return {
            id: item.id,
            productId: item.productId,
            designation: item.designation?.trim() || product.name,
            quantity: item.quantity,
            receivedQuantity,
            unitCost: purchaseRound3(item.unitCost),
            discountPercent: item.discountPercent ?? 0,
            tvaPercent,
            total: values.netHt,
            discountAmount: values.discountAmount,
            taxAmount: values.taxAmount,
            grossHt: values.grossHt,
          };
        });

        const desiredByOldId = new Map(
          calculated.filter((item) => item.id).map((item) => [item.id!, item]),
        );
        for (const old of previous.items) {
          const desired = desiredByOldId.get(old.id);
          const nextReceived = desired?.receivedQuantity ?? 0;
          const delta = nextReceived - old.receivedQuantity;
          if (
            desired &&
            desired.productId !== old.productId &&
            old.receivedQuantity > 0
          ) {
            await this.stockService.applyMovement(tx, {
              productId: old.productId,
              type: StockMovementType.SUPPLIER_RETURN,
              quantity: old.receivedQuantity,
              reason: `Modification achat ${previous.orderNumber}`,
              userId,
            });
            if (desired.receivedQuantity > 0)
              await this.stockService.applyMovement(tx, {
                productId: desired.productId,
                type: StockMovementType.PURCHASE_RECEPTION,
                quantity: desired.receivedQuantity,
                reason: `Modification achat ${previous.orderNumber}`,
                userId,
              });
          } else {
            if (delta > 0)
              await this.stockService.applyMovement(tx, {
                productId: desired!.productId,
                type: StockMovementType.PURCHASE_RECEPTION,
                quantity: delta,
                reason: `Modification achat ${previous.orderNumber}`,
                userId,
              });
            if (delta < 0)
              await this.stockService.applyMovement(tx, {
                productId: old.productId,
                type: StockMovementType.SUPPLIER_RETURN,
                quantity: -delta,
                reason: `Modification achat ${previous.orderNumber}`,
                userId,
              });
          }
        }
        for (const item of calculated.filter(
          (entry) => !entry.id && entry.receivedQuantity > 0,
        )) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.PURCHASE_RECEPTION,
            quantity: item.receivedQuantity,
            reason: `Modification achat ${previous.orderNumber}`,
            userId,
          });
        }

        const stampDuty = dto.stampDuty ?? Number(previous.stampDuty);
        const nextTotals = calculatePurchaseTotals(
          calculated.map((item) => ({
            grossHt: item.grossHt,
            discountAmount: item.discountAmount,
            netHt: item.total,
            taxAmount: item.taxAmount,
            totalTtc: purchaseRound3(item.total + item.taxAmount),
          })),
          stampDuty,
        );
        const subtotal = nextTotals.subtotal;
        const discount = nextTotals.discount;
        const tax = nextTotals.tax;
        const total = nextTotals.total;
        const totalFinal = nextTotals.totalFinal;
        const currentPaymentState = await getPurchasePaymentSummary(
          tx,
          previous,
        );
        const paidAmount = currentPaymentState.paidAmount.toNumber();
        if (
          dto.paidAmount !== undefined &&
          Math.abs(dto.paidAmount - paidAmount) > 0.001
        )
          throw new BadRequestException(
            'Modifiez les paiements depuis l’action Payer',
          );
        if (paidAmount > totalFinal + 0.001)
          throw new BadRequestException(
            'Le nouveau total ne peut pas être inférieur au montant déjà payé',
          );
        const nextStatus =
          previous.documentType === PurchaseDocumentType.BON_RECEPTION
            ? calculated.every((item) => item.receivedQuantity >= item.quantity)
              ? PurchaseStatus.RECEIVED
              : calculated.some((item) => item.receivedQuantity > 0)
                ? PurchaseStatus.PARTIALLY_RECEIVED
                : PurchaseStatus.ORDERED
            : previous.status;

        const keptIds = calculated.flatMap((item) =>
          item.id ? [item.id] : [],
        );
        await tx.purchaseItem.deleteMany({
          where: {
            purchaseId: id,
            ...(keptIds.length ? { id: { notIn: keptIds } } : {}),
          },
        });
        for (const item of calculated) {
          const data = {
            productId: item.productId,
            designation: item.designation,
            quantity: item.quantity,
            receivedQuantity: item.receivedQuantity,
            unitCost: item.unitCost,
            discountPercent: item.discountPercent,
            tvaPercent: item.tvaPercent,
            total: item.total,
          };
          if (item.id)
            await tx.purchaseItem.update({ where: { id: item.id }, data });
          else
            await tx.purchaseItem.create({ data: { purchaseId: id, ...data } });
        }
        const updated = await tx.purchase.update({
          where: { id },
          data: {
            supplierId: dto.supplierId ?? previous.supplierId,
            supplierReference:
              dto.supplierReference === undefined
                ? previous.supplierReference
                : this.optionalReference(dto.supplierReference),
            ...(dto.date && { createdAt: new Date(dto.date) }),
            subtotal,
            discount,
            tax,
            total,
            stampDuty,
            ...serializePaymentSummary(
              calculatePaymentAmounts(
                totalFinal,
                currentPaymentState.paidAmount,
              ),
            ),
            status: nextStatus,
            isEdited: true,
            editedAt: new Date(),
          },
          include: {
            supplier: true,
            items: { include: { product: true } },
            payments: true,
          },
        });
        await this.auditLogs.audit(
          {
            action: 'purchase.updated',
            entity: 'Purchase',
            entityId: id,
            userId,
            oldValue: {
              total: Number(previous.total),
              itemCount: previous.items.length,
            },
            newValue: { total, itemCount: calculated.length },
            metadata: { orderNumber: previous.orderNumber },
          },
          tx,
        );
        return updated;
      });
    }
    const previous = await this.prisma.purchase.findFirstOrThrow({
      where: { id, deletedAt: null },
    });
    const updated = await this.prisma.purchase.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.supplierReference !== undefined && {
          supplierReference: this.optionalReference(dto.supplierReference),
        }),
      },
      include: {
        supplier: true,
        items: { include: { product: true } },
        payments: true,
      },
    });
    await this.auditLogs.audit({
      action: 'purchase.updated',
      entity: 'Purchase',
      entityId: id,
      userId,
      oldValue: {
        status: previous.status,
        supplierReference: previous.supplierReference,
      },
      newValue: {
        status: updated.status,
        supplierReference: updated.supplierReference,
      },
      metadata: { orderNumber: updated.orderNumber },
    });
    return updated;
  }

  async remove(id: string, userId?: string) {
    this.logger.log(`DELETE /purchases/${id} called by ${userId ?? 'unknown'}`);

    const purchase = await this.prisma.purchase.findFirstOrThrow({
      where: { id, deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        supplierId: true,
      },
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
      newValue: {
        deletedAt: new Date().toISOString(),
        deletedBy: userId ?? null,
      },
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
        throw new BadRequestException(
          'Un achat annulé ne peut pas être transformé.',
        );
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
          remainingAmount: commercialTotalFinal(
            purchase.total,
            purchase.stampDuty,
          ),
        },
        include: { supplier: true, items: { include: { product: true } } },
      });

      await this.auditLogs.audit(
        {
          action: 'purchase.transformed',
          entity: 'Purchase',
          entityId: id,
          userId,
          oldValue: {
            documentType: PurchaseDocumentType.BON_COMMANDE,
            status: purchase.status,
          },
          newValue: {
            documentType: targetType,
            status: newStatus,
            paymentStatus: PaymentStatus.UNPAID,
          },
          metadata: {
            fromType: PurchaseDocumentType.BON_COMMANDE,
            toType: targetType,
            purchaseId: id,
            purchaseNumber: purchase.orderNumber,
            totalTtc: Number(purchase.total),
            paymentStatus: PaymentStatus.UNPAID,
            supplierId: purchase.supplierId,
            supplierName: purchase.supplier?.name ?? null,
            supplierReference: purchase.supplierReference,
          },
        },
        tx,
      );

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

  private withPaymentState<
    T extends {
      total: Prisma.Decimal;
      stampDuty: Prisma.Decimal;
      payments: Array<{ amount: Prisma.Decimal }>;
    },
  >(purchase: T) {
    const paid = (purchase.payments ?? []).reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    return {
      ...purchase,
      ...serializePaymentSummary(
        calculatePaymentAmounts(
          commercialTotalFinal(purchase.total, purchase.stampDuty),
          paid,
        ),
      ),
    };
  }

  private optionalReference(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
