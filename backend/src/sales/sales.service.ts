import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  CaisseMovementType,
  DocumentType,
  PaymentStatus,
  PaymentType,
  Prisma,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { CaisseService } from '../caisse/caisse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CreateSaleDto,
  SalePaginationDto,
  UpdateSaleDto,
} from './dto/sale.dto';

const MIN_MARGIN_PERCENT = 20;

const STOCK_IMPACTING_TYPES = new Set<DocumentType>([
  DocumentType.BON_LIVRAISON,
  DocumentType.FACTURE,
]);

const PAYMENT_ACCEPTING_TYPES = new Set<DocumentType>([DocumentType.FACTURE]);

const LAST_SALE_PRICE_TYPES = new Set<DocumentType>([
  DocumentType.BON_LIVRAISON,
  DocumentType.FACTURE,
]);

const LAST_SALE_PRICE_TYPE_LIST = [
  DocumentType.BON_LIVRAISON,
  DocumentType.FACTURE,
];

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly references: ReferenceGeneratorService,
    private readonly settings: SettingsService,
    private readonly caisseService: CaisseService,
  ) {}

  async getNextReference(
    documentType: DocumentType,
  ): Promise<{ reference: string }> {
    const prefix = this.prefixForDocument(documentType);
    const reference = await this.references.peekNextSimpleReference(
      prefix,
      'sale',
    );
    return { reference };
  }

  async create(dto: CreateSaleDto, user?: AuthUser) {
    if (!dto.items.length) {
      throw new BadRequestException('Sale must include at least one item');
    }

    const documentType = dto.documentType;
    if (documentType === DocumentType.AVOIR) {
      throw new BadRequestException(
        'Un avoir doit être créé via le module Avoirs et lié à une facture ou un bon de livraison validé',
      );
    }

    const reserveStock = dto.reserveStock ?? false;
    const isDevis = documentType === DocumentType.DEVIS;
    const acceptsPayment = PAYMENT_ACCEPTING_TYPES.has(documentType);

    if (dto.paymentMethod) {
      await this.settings.assertActiveOption(
        'payment_methods',
        dto.paymentMethod,
      );
    }

    if (!acceptsPayment && (dto.paidAmount ?? 0) > 0) {
      throw new BadRequestException(
        `Le type ${documentType} n'accepte pas de paiement à la création`,
      );
    }

    const allowLowMargin = this.hasPermission(user, 'sales.allow_low_margin');

    return this.prisma.$transaction(async (tx) => {
      const prefix = this.prefixForDocument(documentType);
      const invoiceNumber = await this.references.generateSimple(
        prefix,
        'sale',
        tx,
      );

      const expectedPrefix = `${prefix}-`;
      if (!invoiceNumber.startsWith(expectedPrefix)) {
        throw new BadRequestException(
          `Référence invalide pour le type ${documentType}. Attendu: ${expectedPrefix}...`,
        );
      }

      const productIds = dto.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
      });
      const productsById = new Map(products.map((p) => [p.id, p]));

      const immediateStockImpact = STOCK_IMPACTING_TYPES.has(documentType);

      const rawItems = dto.items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) {
          throw new BadRequestException(`Product ${item.productId} not found`);
        }

        if (immediateStockImpact && product.quantity < item.quantity) {
          throw new BadRequestException(
            `Stock insuffisant pour ${product.name} (disponible: ${product.quantity})`,
          );
        }

        const tvaRate = Number(product.tva ?? 0);
        const unitPrice = item.unitPrice ?? this.salePriceHt(product);
        const discountPercent = item.discountPercent ?? 0;
        const grossLineHt = unitPrice * item.quantity;
        const lineDiscount = grossLineHt * (discountPercent / 100);
        const netLineHt = grossLineHt - lineDiscount;
        const lineTax = netLineHt * (tvaRate / 100);
        const lineTotalTtc = netLineHt + lineTax;

        if (!isDevis) {
          const purchasePriceHt = Number(product.purchasePrice);
          if (purchasePriceHt <= 0) {
            throw new BadRequestException(
              `Le produit "${product.name}" n'a pas de prix d'achat défini. Vente refusée.`,
            );
          }
          const marginPercent =
            ((unitPrice * (1 - discountPercent / 100) - purchasePriceHt) /
              purchasePriceHt) *
            100;
          if (marginPercent < MIN_MARGIN_PERCENT && !allowLowMargin) {
            throw new BadRequestException(
              `Vente refusée : marge insuffisante pour "${product.name}" (${marginPercent.toFixed(2)}% < ${MIN_MARGIN_PERCENT}%).`,
            );
          }
        }

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          tvaRate,
          discountPercent,
          grossTotal: grossLineHt,
          discountAmount: lineDiscount,
          netLineTotal: netLineHt,
          tax: lineTax,
          totalTtc: lineTotalTtc,
        };
      });

      const subtotal = this.round3(
        rawItems.reduce((sum, item) => sum + item.netLineTotal, 0),
      );
      const discount = this.round3(
        rawItems.reduce((sum, item) => sum + item.discountAmount, 0),
      );
      const tax = this.round3(
        rawItems.reduce((sum, item) => sum + item.tax, 0),
      );
      const total = this.round3(subtotal + tax);

      const paidAmount = acceptsPayment ? this.round3(dto.paidAmount ?? 0) : 0;

      // Guard: paidAmount cannot exceed total
      if (paidAmount > total + 0.001) {
        throw new BadRequestException(
          `Le montant payé (${paidAmount.toFixed(3)}) dépasse le total (${total.toFixed(3)})`,
        );
      }

      // paymentMethod is required when a payment is recorded
      if (paidAmount > 0 && !dto.paymentMethod) {
        throw new BadRequestException(
          'La méthode de paiement est requise lorsque paidAmount > 0',
        );
      }

      const remainingAmount = Math.max(total - paidAmount, 0);
      const paymentStatus = this.paymentStatus(total, paidAmount);
      const items = rawItems.map((item) => {
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          finalUnitPrice: item.netLineTotal / item.quantity,
          total: item.netLineTotal,
        };
      });

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
          status: immediateStockImpact
            ? SaleStatus.COMPLETED
            : SaleStatus.DRAFT,
          documentType,
          reserveStock,
          stockImpactDone: false,
          sellerId,
          items: { create: items },
        },
        include: { items: true, customer: true, seller: true, payments: true },
      });

      // FACTURE and BON_LIVRAISON are validated at creation and impact stock once.
      if (immediateStockImpact) {
        for (const item of items) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.SALE,
            quantity: item.quantity,
            reason: `${documentType}:${invoiceNumber}`,
            userId: sellerId,
          });
        }
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            stockImpactDone: true,
            lastSalePriceImpactDone: LAST_SALE_PRICE_TYPES.has(documentType),
          },
        });
      }

      // Initial payment: create Payment + CaisseMovement atomically
      if (!isDevis && paidAmount > 0 && dto.paymentMethod) {
        const payRef = await this.references.generate('PAY', 'payment', tx);
        await tx.payment.create({
          data: {
            reference: payRef,
            type: PaymentType.CUSTOMER_PAYMENT,
            method: dto.paymentMethod,
            amount: paidAmount,
            cashImpactDone: true,
            saleId: sale.id,
            customerId: dto.customerId,
          },
        });

        await this.caisseService.recordMovement(tx, {
          type: CaisseMovementType.ENCAISSEMENT_VENTE,
          montant: paidAmount,
          motif: `Encaissement vente ${invoiceNumber}`,
          referenceDoc: payRef,
          userId: sellerId,
        });
      }

      if (LAST_SALE_PRICE_TYPES.has(documentType)) {
        await this.recalculateLastSalePricesForProducts(
          tx,
          sale.items.map((item) => item.productId),
          sellerId,
        );
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

  async validate(id: string, user?: AuthUser) {
    const userId = user?.id;
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { product: true } }, customer: true },
      });

      if (sale.documentType === DocumentType.DEVIS) {
        throw new BadRequestException('Un devis ne peut pas être validé');
      }
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException(
          'Impossible de valider un document annulé',
        );
      }
      if (sale.status === SaleStatus.COMPLETED) {
        throw new BadRequestException('Ce document est déjà validé');
      }

      const needsStockImpact =
        (STOCK_IMPACTING_TYPES.has(sale.documentType) ||
          (sale.documentType === DocumentType.BON_COMMANDE &&
            sale.reserveStock)) &&
        !sale.stockImpactDone;
      const needsLastSalePriceImpact =
        LAST_SALE_PRICE_TYPES.has(sale.documentType) &&
        !sale.lastSalePriceImpactDone;

      if (needsStockImpact) {
        for (const item of sale.items) {
          const product = item.product;
          if (!product) {
            throw new BadRequestException(
              `Produit introuvable (id: ${item.productId})`,
            );
          }
          if (product.quantity < item.quantity) {
            throw new BadRequestException(
              `Stock insuffisant pour "${product.name}" — disponible: ${product.quantity}, demandé: ${item.quantity}`,
            );
          }
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.SALE,
            quantity: item.quantity,
            reason: `${sale.documentType}:${sale.invoiceNumber}`,
            userId,
          });
        }
      }

      const updatedSale = await tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.COMPLETED,
          ...(needsStockImpact && { stockImpactDone: true }),
          ...(needsLastSalePriceImpact && { lastSalePriceImpactDone: true }),
        },
        include: {
          items: { include: { product: true } },
          customer: true,
          seller: true,
          payments: true,
        },
      });

      if (needsLastSalePriceImpact) {
        await this.recalculateLastSalePricesForProducts(
          tx,
          sale.items.map((item) => item.productId),
          userId,
        );
      }

      return updatedSale;
    });
  }

  async findAll(query?: SalePaginationDto) {
    const page = query?.page ?? 1;
    const limit = Math.min(query?.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = {
      deletedAt: null,
      ...(query?.status && { status: query.status }),
      ...(query?.documentType && { documentType: query.documentType }),
      ...(query?.paymentStatus && { paymentStatus: query.paymentStatus }),
      ...(query?.customerId && { customerId: query.customerId }),
      ...((query?.dateFrom || query?.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
      ...(query?.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
          {
            customer: { name: { contains: query.search, mode: 'insensitive' } },
          },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { customer: true, items: true, payments: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
        include: {
          items: true,
          payments: { where: { deletedAt: null } },
        },
      });

      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Document déjà annulé');
      }

      // Reverse stock only if it was actually decremented
      if (sale.stockImpactDone) {
        for (const item of sale.items) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.CUSTOMER_RETURN,
            quantity: item.quantity,
            reason: `Annulation ${sale.documentType}:${sale.invoiceNumber}`,
            userId,
          });
        }
      }

      // Reverse caisse per payment and soft-delete each payment
      for (const payment of sale.payments) {
        if (payment.cashImpactDone) {
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_VENTE,
            montant: -Number(payment.amount),
            motif: `Annulation ${sale.documentType} ${sale.invoiceNumber} — paiement ${payment.reference}`,
            referenceDoc: sale.invoiceNumber,
            userId,
          });
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { deletedAt: new Date(), deletedBy: userId },
        });
      }

      const updatedSale = await tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.CANCELLED,
          lastSalePriceImpactDone: false,
          paidAmount: 0,
          remainingAmount: sale.total,
          paymentStatus: PaymentStatus.UNPAID,
        },
        include: { items: true, payments: true },
      });

      if (LAST_SALE_PRICE_TYPES.has(sale.documentType)) {
        await this.recalculateLastSalePricesForProducts(
          tx,
          sale.items.map((item) => item.productId),
          userId,
        );
      }

      return updatedSale;
    });
  }

  async update(id: string, dto: UpdateSaleDto, user?: AuthUser) {
    if (dto.status === SaleStatus.COMPLETED) {
      return this.validate(id, user);
    }
    if (dto.status === SaleStatus.CANCELLED) {
      return this.cancel(id, user);
    }
    return this.prisma.sale.update({
      where: { id },
      data: { status: dto.status },
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
        include: {
          items: true,
          payments: { where: { deletedAt: null } },
        },
      });

      // Reverse stock only if not already cancelled and stock was impacted
      if (sale.status !== SaleStatus.CANCELLED && sale.stockImpactDone) {
        for (const item of sale.items) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.CUSTOMER_RETURN,
            quantity: item.quantity,
            reason: `Suppression ${sale.documentType}:${sale.invoiceNumber}`,
            userId,
          });
        }
      }

      // Reverse caisse per active payment
      if (sale.status !== SaleStatus.CANCELLED) {
        for (const payment of sale.payments) {
          if (payment.cashImpactDone) {
            await this.caisseService.recordMovement(tx, {
              type: CaisseMovementType.ANNULATION_VENTE,
              montant: -Number(payment.amount),
              motif: `Suppression ${sale.documentType} ${sale.invoiceNumber} — paiement ${payment.reference}`,
              referenceDoc: sale.invoiceNumber,
              userId,
            });
          }
        }
      }

      const productIdsToRecalculate = sale.items.map((item) => item.productId);
      const shouldRecalculateLastSalePrice = LAST_SALE_PRICE_TYPES.has(
        sale.documentType,
      );

      await tx.payment.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });

      if (shouldRecalculateLastSalePrice) {
        await this.recalculateLastSalePricesForProducts(
          tx,
          productIdsToRecalculate,
          userId,
        );
      }
      this.logger.log(
        `Sale ${id} permanently deleted by ${userId ?? 'unknown'}`,
      );
      return { id };
    });
  }

  async recalculateLastSalePrices() {
    return this.prisma.$transaction((tx) =>
      this.recalculateLastSalePricesForProducts(tx),
    );
  }

  private async recalculateLastSalePricesForProducts(
    tx: Prisma.TransactionClient,
    productIds?: string[],
    userId?: string,
  ) {
    const uniqueProductIds = productIds ? [...new Set(productIds)] : undefined;
    const products = await tx.product.findMany({
      where: uniqueProductIds ? { id: { in: uniqueProductIds } } : {},
      select: { id: true },
    });
    const productIdsToUpdate = products.map((product) => product.id);

    if (productIdsToUpdate.length === 0) {
      return { productsUpdated: 0, historyRows: 0 };
    }

    await tx.productPriceHistory.deleteMany({
      where: uniqueProductIds ? { productId: { in: uniqueProductIds } } : {},
    });

    const relevantSaleIds = uniqueProductIds
      ? (
          await tx.saleItem.findMany({
            where: {
              productId: { in: productIdsToUpdate },
              sale: {
                deletedAt: null,
                status: SaleStatus.COMPLETED,
                documentType: { in: LAST_SALE_PRICE_TYPE_LIST },
              },
            },
            select: { saleId: true },
            distinct: ['saleId'],
          })
        ).map((item) => item.saleId)
      : undefined;

    const saleItems = await tx.saleItem.findMany({
      where: {
        ...(relevantSaleIds ? { saleId: { in: relevantSaleIds } } : {}),
        sale: {
          deletedAt: null,
          status: SaleStatus.COMPLETED,
          documentType: { in: LAST_SALE_PRICE_TYPE_LIST },
        },
      },
      include: {
        product: { select: { tva: true } },
        sale: {
          select: {
            id: true,
            invoiceNumber: true,
            documentType: true,
            customerId: true,
            discount: true,
            updatedAt: true,
          },
        },
      },
    });

    const saleItemsBySaleId = new Map<string, typeof saleItems>();
    for (const item of saleItems) {
      const current = saleItemsBySaleId.get(item.saleId) ?? [];
      current.push(item);
      saleItemsBySaleId.set(item.saleId, current);
    }

    const latestByProduct = new Map<
      string,
      {
        price: Prisma.Decimal;
        date: Date;
        documentId: string;
        documentReference: string;
        documentType: DocumentType;
        customerId: string | null;
      }
    >();
    let historyRows = 0;

    for (const saleGroup of saleItemsBySaleId.values()) {
      const lineNetHtByItemId = new Map<string, number>();
      let lineDiscountTotal = 0;
      let lineNetSubtotal = 0;

      for (const item of saleGroup) {
        const grossHt = Number(item.unitPrice) * item.quantity;
        const discountPercent = Number(item.discountPercent ?? 0);
        const netHt = grossHt * (1 - discountPercent / 100);
        lineNetHtByItemId.set(item.id, netHt);
        lineDiscountTotal += grossHt - netHt;
        lineNetSubtotal += netHt;
      }

      const sale = saleGroup[0].sale;
      const remainingDocumentDiscount = Math.max(
        Number(sale.discount) - lineDiscountTotal,
        0,
      );

      for (const item of saleGroup) {
        if (!productIdsToUpdate.includes(item.productId)) {
          continue;
        }

        const netHtBeforeDocumentDiscount = lineNetHtByItemId.get(item.id) ?? 0;
        const documentDiscountShare =
          lineNetSubtotal > 0
            ? (netHtBeforeDocumentDiscount / lineNetSubtotal) *
              remainingDocumentDiscount
            : 0;
        const netHt = Math.max(
          netHtBeforeDocumentDiscount - documentDiscountShare,
          0,
        );
        const tva = Number(item.product.tva ?? 0);
        const netTtc = netHt * (1 + tva / 100);
        const unitTtc = new Prisma.Decimal(
          netTtc / item.quantity,
        ).toDecimalPlaces(3);

        await tx.productPriceHistory.upsert({
          where: {
            productId_documentId: {
              productId: item.productId,
              documentId: sale.id,
            },
          },
          create: {
            productId: item.productId,
            documentId: sale.id,
            documentType: sale.documentType,
            documentReference: sale.invoiceNumber,
            clientId: sale.customerId,
            prixVente: unitTtc,
            dateVente: sale.updatedAt,
            userId,
          },
          update: {
            documentType: sale.documentType,
            documentReference: sale.invoiceNumber,
            clientId: sale.customerId,
            prixVente: unitTtc,
            dateVente: sale.updatedAt,
            userId,
          },
        });
        historyRows += 1;

        const latest = latestByProduct.get(item.productId);
        if (!latest || sale.updatedAt >= latest.date) {
          latestByProduct.set(item.productId, {
            price: unitTtc,
            date: sale.updatedAt,
            documentId: sale.id,
            documentReference: sale.invoiceNumber,
            documentType: sale.documentType,
            customerId: sale.customerId,
          });
        }
      }
    }

    for (const productId of productIdsToUpdate) {
      const latest = latestByProduct.get(productId);
      await tx.product.update({
        where: { id: productId },
        data: latest
          ? {
              lastSellingPrice: latest.price,
              lastSaleDate: latest.date,
              lastSaleDocumentId: latest.documentId,
              lastSaleDocumentReference: latest.documentReference,
              lastSaleDocumentType: latest.documentType,
              lastSaleCustomerId: latest.customerId,
            }
          : {
              lastSellingPrice: null,
              lastSaleDate: null,
              lastSaleDocumentId: null,
              lastSaleDocumentReference: null,
              lastSaleDocumentType: null,
              lastSaleCustomerId: null,
            },
      });
    }

    await tx.sale.updateMany({
      where: {
        deletedAt: null,
        status: SaleStatus.COMPLETED,
        documentType: { in: LAST_SALE_PRICE_TYPE_LIST },
        items: { some: { productId: { in: productIdsToUpdate } } },
      },
      data: { lastSalePriceImpactDone: true },
    });

    await tx.sale.updateMany({
      where: {
        OR: [
          { status: { not: SaleStatus.COMPLETED } },
          { documentType: { notIn: LAST_SALE_PRICE_TYPE_LIST } },
          { deletedAt: { not: null } },
        ],
      },
      data: { lastSalePriceImpactDone: false },
    });

    return { productsUpdated: productIdsToUpdate.length, historyRows };
  }

  private prefixForDocument(documentType: string): string {
    const map: Record<string, string> = {
      DEVIS: 'DEV',
      BON_COMMANDE: 'BC',
      BON_LIVRAISON: 'BL',
      FACTURE: 'FAC',
      AVOIR: 'AV',
    };
    const prefix = map[documentType];
    if (!prefix) {
      throw new BadRequestException(
        `Type de document invalide: ${documentType}`,
      );
    }
    return prefix;
  }

  private paymentStatus(total: number, paidAmount: number) {
    if (paidAmount <= 0) return PaymentStatus.UNPAID;
    if (paidAmount < total) return PaymentStatus.PARTIAL;
    return PaymentStatus.PAID;
  }

  private salePriceHt(product: {
    salePrice: Prisma.Decimal | number | string;
    tva?: Prisma.Decimal | number | string | null;
  }) {
    const salePrice = Number(product.salePrice);
    const tva = Number(product.tva ?? 0);
    if (!Number.isFinite(salePrice) || salePrice <= 0) return 0;
    return this.round3(salePrice / (1 + tva / 100));
  }

  private round3(value: number) {
    return Math.round(value * 1000) / 1000;
  }

  private hasPermission(
    user: AuthUser | undefined,
    permission: string,
  ): boolean {
    if (!user) return false;
    const perms = user.permissions ?? [];
    return perms.includes('*') || perms.includes(permission);
  }
}
