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
// Mirrors the frontend DEFAULT_MARGIN_PERCENT used in recalculateSaleLine
const DEFAULT_MARGIN_PERCENT = 40;

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

// Transformations autorisées : source -> cibles possibles
const ALLOWED_TRANSFORMS: Partial<Record<DocumentType, DocumentType[]>> = {
  [DocumentType.DEVIS]: [DocumentType.BON_LIVRAISON, DocumentType.FACTURE],
  [DocumentType.BON_COMMANDE]: [DocumentType.BON_LIVRAISON, DocumentType.FACTURE],
  [DocumentType.BON_LIVRAISON]: [DocumentType.FACTURE],
};

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

    // ── Client comptoir validation ──────────────────────────────────────────────
    const isComptoir = dto.clientType === 'COMPTOIR';
    if (isComptoir) {
      if (!dto.counterClientFirstName?.trim() || !dto.counterClientLastName?.trim()) {
        throw new BadRequestException(
          'Veuillez saisir le nom et le prénom du client comptoir.',
        );
      }
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
    const allowEditUnitPriceHt = this.hasPermission(user, 'sales.line.edit_unit_price_ht');

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

        // Guard: si unitPrice est explicitement fourni et diffère du prix calculé par défaut,
        // la permission sales.line.edit_unit_price_ht est requise.
        if (item.unitPrice !== undefined && item.unitPrice !== null) {
          const itemPurchasePriceHt = Number(product.purchasePrice);
          let expectedPuHt: number;
          if (itemPurchasePriceHt > 0) {
            const margeFinalePourcent = Math.max(DEFAULT_MARGIN_PERCENT - discountPercent, 0);
            expectedPuHt = this.round3(itemPurchasePriceHt * (1 + margeFinalePourcent / 100));
          } else {
            expectedPuHt = this.salePriceHt(product);
          }
          if (Math.abs(item.unitPrice - expectedPuHt) > 0.005 && !allowEditUnitPriceHt) {
            throw new ForbiddenException(
              `Vous n'avez pas la permission de modifier le prix unitaire HT pour "${product.name}".`,
            );
          }
        }
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
      // Only FACTURE carries a payment status; other document types are not payable
      const paymentStatus = acceptsPayment ? this.paymentStatus(total, paidAmount) : null;
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
      const counterClientFullName =
        isComptoir && dto.counterClientFirstName && dto.counterClientLastName
          ? `${dto.counterClientFirstName.trim()} ${dto.counterClientLastName.trim()}`
          : undefined;

      const sale = await tx.sale.create({
        data: {
          invoiceNumber,
          customerId: dto.customerId,
          clientType: dto.clientType ?? null,
          counterClientFirstName: isComptoir ? dto.counterClientFirstName?.trim() ?? null : null,
          counterClientLastName: isComptoir ? dto.counterClientLastName?.trim() ?? null : null,
          counterClientFullName: counterClientFullName ?? null,
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

      // Seuls BON_LIVRAISON et FACTURE affectent le stock — jamais DEVIS ni BON_COMMANDE
      const needsStockImpact =
        STOCK_IMPACTING_TYPES.has(sale.documentType) && !sale.stockImpactDone;
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
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(100, Math.max(1, query?.limit ?? 20));
    const skip = (page - 1) * limit;

    // Conditions qui nécessitent un sous-bloc OR sont placées dans AND
    // pour éviter les conflits de clés Prisma.
    const andConditions: Prisma.SaleWhereInput[] = [];

    if (query?.search) {
      andConditions.push({
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
          { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    if (query?.payableOnly) {
      // Seuls FACTURE et BON_LIVRAISON non transformé sont des dettes réelles.
      // Un BL dont transformedToId != null a été converti en FACTURE : la FACTURE
      // est le document final payable, le BL ne doit plus apparaître.
      // Les FACTURE ont un paymentStatus non-null ; les BL ont paymentStatus = null
      // mais remainingAmount > 0 tant qu'elles ne sont pas payées.
      andConditions.push({
        status: { not: SaleStatus.CANCELLED },
        OR: [
          { documentType: DocumentType.FACTURE, paymentStatus: { not: PaymentStatus.PAID } },
          { documentType: DocumentType.BON_LIVRAISON, transformedToId: null },
        ],
      });
    }

    const where: Prisma.SaleWhereInput = {
      deletedAt: null,
      // Ces filtres sont ignorés quand payableOnly est actif pour éviter des
      // contradictions (ex: documentType=DEVIS AND payableOnly=true → 0 résultat).
      ...(!query?.payableOnly && query?.status && { status: query.status }),
      ...(!query?.payableOnly && query?.documentType && { documentType: query.documentType }),
      ...(!query?.payableOnly && query?.paymentStatus && { paymentStatus: query.paymentStatus }),
      ...(query?.customerId && { customerId: query.customerId }),
      ...((query?.dateFrom || query?.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
      ...(andConditions.length > 0 && { AND: andConditions }),
    };

    const sortOrder = query?.sortOrder ?? 'desc';
    const allowedSortFields: Record<string, Prisma.SaleOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder },
      date: { createdAt: sortOrder },
      totalTtc: { total: sortOrder },
      total: { total: sortOrder },
      paidAmount: { paidAmount: sortOrder },
      remainingAmount: { remainingAmount: sortOrder },
      clientName: { customer: { name: sortOrder } },
      customer: { customer: { name: sortOrder } },
      reference: { invoiceNumber: sortOrder },
      invoiceNumber: { invoiceNumber: sortOrder },
      status: { status: sortOrder },
      paymentStatus: { paymentStatus: sortOrder },
      documentType: { documentType: sortOrder },
    };
    const orderBy: Prisma.SaleOrderByWithRelationInput =
      (query?.sortBy && allowedSortFields[query.sortBy]) || { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { customer: true, items: true, payments: true },
        orderBy,
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
          paymentStatus: PAYMENT_ACCEPTING_TYPES.has(sale.documentType)
            ? PaymentStatus.UNPAID
            : null,
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

  async remove(id: string, user?: AuthUser) {
    if (!this.hasPermission(user, 'sales.delete')) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission de supprimer une vente",
      );
    }
    const userId = user?.id;
    this.logger.log(`DELETE /sales/${id} called by ${userId ?? 'unknown'}`);
    await this.prisma.sale.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId ?? null },
    });
    this.logger.log(`Sale ${id} moved to trash by ${userId ?? 'unknown'}`);
    return { id };
  }

  async transformDocument(
    sourceId: string,
    targetType: DocumentType,
    user?: AuthUser,
  ) {
    const userId = user?.id;

    return this.prisma.$transaction(async (tx) => {
      const source = await tx.sale.findFirstOrThrow({
        where: { id: sourceId, deletedAt: null },
        include: { items: true, customer: true },
      });

      if (source.status === SaleStatus.CANCELLED) {
        throw new BadRequestException(
          'Impossible de transformer un document annulé',
        );
      }

      const allowed = ALLOWED_TRANSFORMS[source.documentType] ?? [];
      if (!allowed.includes(targetType)) {
        throw new BadRequestException(
          `Transformation ${source.documentType} → ${targetType} non autorisée. Transformations permises : ${allowed.join(', ') || 'aucune'}`,
        );
      }

      if (source.transformedToId) {
        throw new BadRequestException(
          'Ce document a déjà été transformé. Impossible de le transformer une deuxième fois.',
        );
      }

      if (!source.items.length) {
        throw new BadRequestException(
          'Le document source ne contient aucun article',
        );
      }

      const targetAppliesStock = STOCK_IMPACTING_TYPES.has(targetType);
      const sourceAppliedStock = source.stockImpactDone;

      // Vérifier la disponibilité stock uniquement si le document cible affecte le
      // stock ET que le document source n'a pas déjà consommé ce stock.
      if (targetAppliesStock && !sourceAppliedStock) {
        for (const item of source.items) {
          const product = await tx.product.findUniqueOrThrow({
            where: { id: item.productId },
          });
          if (product.quantity < item.quantity) {
            throw new BadRequestException(
              `Stock insuffisant pour "${product.name}" — disponible : ${product.quantity}, demandé : ${item.quantity}`,
            );
          }
        }
      }

      const prefix = this.prefixForDocument(targetType);
      const invoiceNumber = await this.references.generateSimple(
        prefix,
        'sale',
        tx,
      );

      // Le document cible hérite du stock si la source l'avait déjà appliqué
      // (cas BL → FAC : le stock ne doit pas être décrémenté une 2e fois).
      const newStockImpactDone =
        targetAppliesStock && sourceAppliedStock ? true : false;

      const newSale = await tx.sale.create({
        data: {
          invoiceNumber,
          customerId: source.customerId,
          clientType: source.clientType,
          counterClientFirstName: source.counterClientFirstName,
          counterClientLastName: source.counterClientLastName,
          counterClientFullName: source.counterClientFullName,
          subtotal: source.subtotal,
          discount: source.discount,
          tax: source.tax,
          total: source.total,
          paidAmount: 0,
          remainingAmount: source.total,
          paymentStatus: PAYMENT_ACCEPTING_TYPES.has(targetType) ? PaymentStatus.UNPAID : null,
          status: targetAppliesStock ? SaleStatus.COMPLETED : SaleStatus.DRAFT,
          documentType: targetType,
          reserveStock: false,
          stockImpactDone: newStockImpactDone,
          lastSalePriceImpactDone: false,
          sellerId: userId,
          sourceDocumentId: source.id,
          items: {
            create: source.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              finalUnitPrice: item.finalUnitPrice,
              total: item.total,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          customer: true,
          seller: true,
          payments: true,
        },
      });

      // Appliquer le stock une seule fois si nécessaire
      if (targetAppliesStock && !sourceAppliedStock) {
        for (const item of source.items) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.SALE,
            quantity: item.quantity,
            reason: `TRANSFORMATION:${source.invoiceNumber} -> ${invoiceNumber}`,
            userId,
          });
        }
        await tx.sale.update({
          where: { id: newSale.id },
          data: { stockImpactDone: true },
        });
      }

      // Marquer le document source comme transformé
      await tx.sale.update({
        where: { id: source.id },
        data: { transformedToId: newSale.id },
      });

      // Mettre à jour le dernier prix de vente si applicable
      if (LAST_SALE_PRICE_TYPES.has(targetType)) {
        await tx.sale.update({
          where: { id: newSale.id },
          data: { lastSalePriceImpactDone: true },
        });
        await this.recalculateLastSalePricesForProducts(
          tx,
          source.items.map((i) => i.productId),
          userId,
        );
      }

      return tx.sale.findUniqueOrThrow({
        where: { id: newSale.id },
        include: {
          items: { include: { product: true } },
          customer: true,
          seller: true,
          payments: true,
        },
      });
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
    if (!Number.isFinite(salePrice) || salePrice <= 0) return 0;
    return this.round3(salePrice);
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
