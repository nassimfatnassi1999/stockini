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
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { CaisseService } from '../caisse/caisse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateSaleDto, UpdateSaleDto } from './dto/sale.dto';

const MIN_MARGIN_PERCENT = 20;

/** Document types that trigger a real stock decrement when validated */
const STOCK_IMPACTING_TYPES = new Set<DocumentType>([
  DocumentType.BON_LIVRAISON,
  DocumentType.FACTURE,
]);

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

  async create(dto: CreateSaleDto, user?: AuthUser) {
    if (!dto.items.length) {
      throw new BadRequestException('Sale must include at least one item');
    }

    const documentType = dto.documentType ?? DocumentType.DEVIS;
    const reserveStock = dto.reserveStock ?? false;
    const isDevis = documentType === DocumentType.DEVIS;

    // Payment method is only required / checked for real commercial docs
    if (!isDevis && dto.paymentMethod) {
      await this.settings.assertActiveOption('payment_methods', dto.paymentMethod);
    }

    const allowLowMargin = this.hasPermission(user, 'sales.allow_low_margin');

    return this.prisma.$transaction(async (tx) => {
      const prefix = this.prefixForDocument(documentType);
      const invoiceNumber = await this.references.generate(prefix, 'sale', tx);

      const productIds = dto.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
      });
      const productsById = new Map(products.map((p) => [p.id, p]));

      // BON_COMMANDE with reserveStock: immediate stock check needed
      const immediateStockCheck =
        documentType === DocumentType.BON_COMMANDE && reserveStock;

      const items = dto.items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) {
          throw new BadRequestException(`Product ${item.productId} not found`);
        }

        if (immediateStockCheck && product.quantity < item.quantity) {
          throw new BadRequestException(
            `Stock insuffisant pour ${product.name} (disponible: ${product.quantity})`,
          );
        }

        const unitPrice = item.unitPrice ?? Number(product.salePrice);
        const discountPercent = item.discountPercent ?? 0;
        const netUnitPrice = unitPrice * (1 - discountPercent / 100);

        // Margin check — skipped for devis (preview document)
        if (!isDevis) {
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
              `Vente refusée : marge insuffisante pour "${product.name}" (${marginPercent.toFixed(2)}% < ${MIN_MARGIN_PERCENT}%).`,
            );
          }
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
      const paidAmount = isDevis ? 0 : (dto.paidAmount ?? 0);
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
          status: SaleStatus.DRAFT,
          documentType,
          reserveStock,
          stockImpactDone: false,
          sellerId,
          items: { create: items },
        },
        include: { items: true, customer: true, seller: true, payments: true },
      });

      // BON_COMMANDE with reserveStock: apply stock immediately
      if (immediateStockCheck) {
        for (const item of items) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.SALE,
            quantity: item.quantity,
            reason: `${DocumentType.BON_COMMANDE}:${invoiceNumber}`,
            userId: sellerId,
          });
          await tx.product.update({
            where: { id: item.productId },
            data: { lastSellingPrice: item.unitPrice },
          });
        }
        await tx.sale.update({
          where: { id: sale.id },
          data: { stockImpactDone: true },
        });
      }

      // Payment record for non-devis docs with upfront payment
      if (!isDevis && paidAmount > 0 && dto.paymentMethod) {
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

  /**
   * Validate a document: transition DRAFT → COMPLETED and apply stock
   * decrement for BON_LIVRAISON, FACTURE, and BON_COMMANDE with reserveStock.
   */
  async validate(id: string, user?: AuthUser) {
    const userId = user?.id;
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { product: true } } },
      });

      if (sale.documentType === DocumentType.DEVIS) {
        throw new BadRequestException('Un devis ne peut pas être validé');
      }
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Impossible de valider un document annulé');
      }
      if (sale.status === SaleStatus.COMPLETED) {
        throw new BadRequestException('Ce document est déjà validé');
      }

      // Does this validation trigger a stock decrement?
      const needsStockImpact =
        (STOCK_IMPACTING_TYPES.has(sale.documentType as DocumentType) ||
          (sale.documentType === DocumentType.BON_COMMANDE && sale.reserveStock)) &&
        !sale.stockImpactDone;

      if (needsStockImpact) {
        for (const item of sale.items) {
          const product = item.product;
          if (!product) {
            throw new BadRequestException(`Produit introuvable (id: ${item.productId})`);
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
          await tx.product.update({
            where: { id: item.productId },
            data: { lastSellingPrice: Number(item.unitPrice) },
          });
        }
      }

      return tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.COMPLETED,
          ...(needsStockImpact && { stockImpactDone: true }),
        },
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

      // Always reverse caisse if a payment was collected
      const paidAmount = Number(sale.paidAmount);
      if (paidAmount > 0) {
        await this.caisseService.recordMovement(tx, {
          type: CaisseMovementType.ANNULATION_VENTE,
          montant: -paidAmount,
          motif: `Annulation ${sale.documentType} ${sale.invoiceNumber}`,
          referenceDoc: sale.invoiceNumber,
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
    await this.settings.assertActiveOption('payment_statuses', dto.paymentStatus);
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
        const paidAmount = Number(sale.paidAmount);
        if (paidAmount > 0) {
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_VENTE,
            montant: -paidAmount,
            motif: `Suppression ${sale.documentType} ${sale.invoiceNumber}`,
            referenceDoc: sale.invoiceNumber,
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

  private prefixForDocument(documentType: DocumentType): string {
    const map: Record<DocumentType, string> = {
      DEVIS: 'DEV',
      BON_COMMANDE: 'BC',
      BON_LIVRAISON: 'BL',
      FACTURE: 'FAC',
      AVOIR: 'AV',
    };
    return map[documentType] ?? 'INV';
  }

  private paymentStatus(total: number, paidAmount: number) {
    if (paidAmount <= 0) return PaymentStatus.UNPAID;
    if (paidAmount < total) return PaymentStatus.PARTIAL;
    return PaymentStatus.PAID;
  }

  private hasPermission(user: AuthUser | undefined, permission: string): boolean {
    if (!user) return false;
    const perms = user.permissions ?? [];
    return perms.includes('*') || perms.includes(permission);
  }
}
