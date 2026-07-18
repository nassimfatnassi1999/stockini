import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  CaisseMovementType,
  ConsolidationStatus,
  CustomerOrigin,
  DocumentType,
  PaymentStatus,
  PaymentType,
  Prisma,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CaisseService } from '../caisse/caisse.service';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { StockService } from '../stock/stock.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  calculateSalesLine,
  calculateSalesTotals,
  DEFAULT_SALES_MARGIN_PERCENT,
  SALES_CALCULATION_VERSION,
  SALES_SNAPSHOT_VERSION,
  salesRound3,
} from '../common/utils/sales-calculations';
import {
  commercialTotalFinal,
  DEFAULT_STAMP_DUTY,
} from '../common/utils/commercial-document';
import { calculatePaymentAmounts } from '../common/utils/payment-status';
import {
  CreateSaleDto,
  CreateConsolidationDto,
  SalePaginationDto,
  UpdateSaleDto,
} from './dto/sale.dto';

const MIN_MARGIN_PERCENT = 20;
// Mirrors the frontend DEFAULT_MARGIN_PERCENT used in recalculateSaleLine

const STOCK_IMPACTING_TYPES = new Set<DocumentType>([
  DocumentType.BON_LIVRAISON,
  DocumentType.FACTURE,
]);

const PAYMENT_ACCEPTING_TYPES = new Set<DocumentType>([
  DocumentType.FACTURE,
  DocumentType.BON_LIVRAISON,
]);

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
  [DocumentType.DEVIS]: [
    DocumentType.BON_COMMANDE,
    DocumentType.BON_LIVRAISON,
    DocumentType.FACTURE,
  ],
  [DocumentType.BON_COMMANDE]: [
    DocumentType.BON_LIVRAISON,
    DocumentType.FACTURE,
  ],
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
    private readonly customersService: CustomersService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async createConsolidation(dto: CreateConsolidationDto, user?: AuthUser) {
    const sourceIds = [...new Set(dto.sourceIds)];
    if (sourceIds.length < 2) {
      throw new BadRequestException('Sélectionnez au moins deux documents distincts');
    }
    if (dto.targetType !== DocumentType.BON_LIVRAISON && dto.targetType !== DocumentType.FACTURE) {
      throw new BadRequestException('Le document consolidé doit être un bon de livraison ou une facture');
    }
    const documentDate = dto.date ? new Date(dto.date) : new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Sale" WHERE id IN (${Prisma.join(sourceIds)}) FOR UPDATE`);
      const sources = await tx.sale.findMany({
        where: { id: { in: sourceIds } },
        include: {
          customer: true,
          items: true,
          payments: { where: { deletedAt: null, type: PaymentType.CUSTOMER_PAYMENT } },
          creditNotes: { where: { statut: { not: 'CANCELLED' } } },
          consolidationMemberships: { where: { active: true }, select: { consolidatedSaleId: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (sources.length !== sourceIds.length) throw new BadRequestException('Un ou plusieurs documents sont introuvables');
      const first = sources[0];
      if (!first.customerId || sources.some((sale) => sale.customerId !== first.customerId)) {
        throw new BadRequestException('Tous les documents doivent appartenir au même client enregistré');
      }
      if (sources.some((sale) => sale.deletedAt || sale.status === SaleStatus.CANCELLED)) {
        throw new BadRequestException('Un document supprimé ou annulé ne peut pas être regroupé');
      }
      if (sources.some((sale) => sale.isConsolidated || sale.consolidationMemberships.length > 0)) {
        throw new BadRequestException('Un document sélectionné appartient déjà à un regroupement actif');
      }
      const sourceType = first.documentType;
      if (sources.some((sale) => sale.documentType !== sourceType)) {
        throw new BadRequestException('Les bons de livraison et les factures ne peuvent pas être mélangés');
      }
      const compatible = sourceType === dto.targetType ||
        (sourceType === DocumentType.BON_LIVRAISON && dto.targetType === DocumentType.FACTURE);
      if (!compatible || (sourceType !== DocumentType.BON_LIVRAISON && sourceType !== DocumentType.FACTURE)) {
        throw new BadRequestException('Types de documents incompatibles avec le regroupement demandé');
      }

      const sum = (values: Array<Prisma.Decimal | number>): Prisma.Decimal =>
        values.reduce<Prisma.Decimal>((total, value) => total.plus(value), new Prisma.Decimal(0));
      const subtotal = sum(sources.map((sale) => sale.subtotal));
      const discount = sum(sources.map((sale) => sale.discount));
      const tax = sum(sources.map((sale) => sale.tax));
      const total = sum(sources.map((sale) => sale.total));
      // Un regroupement est un nouveau document unique : son timbre n'est
      // jamais la somme des timbres historiques des documents sources.
      const stampDuty = new Prisma.Decimal(DEFAULT_STAMP_DUTY);
      const historicalPaid = sum(sources.flatMap((sale) => sale.payments.map((payment) => payment.amount)));
      const credits = sum(sources.flatMap((sale) => sale.creditNotes.map((credit) => credit.montantRembourse)));
      const net = total.plus(stampDuty);
      const remainingAmount = Prisma.Decimal.max(net.minus(historicalPaid).minus(credits), 0);
      const invoiceNumber = await this.references.generateConsolidatedSalesDocumentNumber(
        dto.targetType as 'BON_LIVRAISON' | 'FACTURE', first.customer?.name, documentDate, tx,
      );
      const parent = await tx.sale.create({
        data: {
          invoiceNumber,
          customerId: first.customerId,
          clientType: first.clientType,
          createdAt: documentDate,
          sellerId: user?.id,
          subtotal,
          discount,
          tax,
          total,
          stampDuty,
          paidAmount: historicalPaid,
          remainingAmount,
          totalRefunded: credits,
          paymentStatus: this.paymentStatus(Number(net.minus(credits)), Number(historicalPaid)),
          status: SaleStatus.COMPLETED,
          documentType: dto.targetType,
          stockImpactDone: false,
          lastSalePriceImpactDone: false,
          isConsolidated: true,
          consolidationStatus: ConsolidationStatus.ACTIVE,
          consolidationNote: dto.note?.trim() || null,
          consolidatedAt: new Date(),
          items: {
            create: sources.flatMap((sale) => sale.items.map((item) => ({
              productId: item.productId,
              designation: item.designation,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              marginPercent: item.marginPercent,
              tvaPercent: item.tvaPercent,
              finalUnitPrice: item.finalUnitPrice,
              total: item.total,
              unitPurchaseCostHt: item.unitPurchaseCostHt,
              purchaseCostEstimated: item.purchaseCostEstimated,
              calculationVersion: item.calculationVersion,
              sourceSaleId: sale.id,
              sourceSaleItemId: item.id,
              sourceReference: sale.invoiceNumber,
            }))),
          },
          consolidationSources: {
            create: sources.map((sale, index) => ({
              sourceSaleId: sale.id,
              sourceReference: sale.invoiceNumber,
              sourceType: sale.documentType,
              sourceTotal: sale.total.plus(sale.stampDuty),
              displayOrder: index,
            })),
          },
        },
        include: { customer: true, items: { include: { product: true } }, consolidationSources: true },
      });
      await this.auditLogs.audit({
        action: 'sale.consolidation.created', entity: 'Sale', entityId: parent.id,
        userId: user?.id, userName: user?.email,
        newValue: { reference: parent.invoiceNumber, total: Number(net), paid: Number(historicalPaid), remaining: Number(remainingAmount) },
        metadata: { sourceIds, sourceReferences: sources.map((sale) => sale.invoiceNumber), targetType: dto.targetType, credits: Number(credits) },
      }, tx);
      return parent;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      await this.auditLogs.audit({
        action: 'sale.consolidation.blocked',
        entity: 'Sale',
        userId: user?.id,
        userName: user?.email,
        metadata: {
          sourceIds,
          targetType: dto.targetType,
          reason: error instanceof Error ? error.message : String(error),
        },
      }).catch(() => undefined);
      throw error;
    }
  }

  async getConsolidation(id: string) {
    return this.prisma.sale.findFirstOrThrow({
      where: { id, isConsolidated: true, deletedAt: null },
      include: {
        customer: true,
        items: { include: { product: true } },
        payments: { where: { deletedAt: null } },
        creditNotes: { where: { statut: { not: 'CANCELLED' } } },
        generatedDocuments: { where: { deletedAt: null } },
        consolidationSources: {
          orderBy: { displayOrder: 'asc' },
          include: {
            sourceSale: {
              include: {
                payments: { where: { deletedAt: null } },
                creditNotes: { where: { statut: { not: 'CANCELLED' } } },
              },
            },
          },
        },
      },
    });
  }

  async getSaleConsolidation(id: string) {
    const membership = await this.prisma.saleConsolidationSource.findFirst({
      where: { sourceSaleId: id, active: true },
      include: { consolidatedSale: { include: { customer: true } } },
    });
    return membership?.consolidatedSale ?? null;
  }

  async cancelConsolidation(id: string, reason?: string, user?: AuthUser) {
    if (!this.hasPermission(user, 'sales.consolidation.cancel')) {
      throw new ForbiddenException("Vous n'avez pas la permission d'annuler un regroupement");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Sale" WHERE id = ${id} FOR UPDATE`);
        const parent = await tx.sale.findFirstOrThrow({
          where: { id, isConsolidated: true, consolidationStatus: ConsolidationStatus.ACTIVE },
          include: {
            payments: { where: { deletedAt: null } },
            creditNotes: { where: { statut: { not: 'CANCELLED' } } },
            generatedDocuments: { where: { deletedAt: null } },
            consolidationSources: {
              where: { active: true },
              orderBy: { displayOrder: 'asc' },
              include: {
                sourceSale: {
                  include: {
                    payments: { where: { deletedAt: null, type: PaymentType.CUSTOMER_PAYMENT } },
                    creditNotes: { where: { statut: { not: 'CANCELLED' } } },
                  },
                },
              },
            },
          },
        });
        if (parent.payments.length) {
          throw new BadRequestException('Impossible d’annuler le regroupement : un ou plusieurs paiements ont été enregistrés sur le document consolidé. Annulez ou réaffectez ces paiements avant de continuer.');
        }
        if (parent.creditNotes.length) {
          throw new BadRequestException('Impossible d’annuler le regroupement : un avoir actif est lié au document consolidé.');
        }
        if (parent.generatedDocuments.some((document) => document.status === 'SENT')) {
          throw new BadRequestException('Impossible d’annuler le regroupement : un document fiscal finalisé a déjà été envoyé.');
        }
        if (!parent.consolidationSources.length) {
          throw new BadRequestException('Impossible d’annuler le regroupement : aucun document source actif n’a été trouvé.');
        }

        const sourceIds = parent.consolidationSources.map((link) => link.sourceSaleId);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "Sale" WHERE id IN (${Prisma.join(sourceIds)}) FOR UPDATE`);
        for (const link of parent.consolidationSources) {
          const source = link.sourceSale;
          const paid = source.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
          const credits = source.creditNotes.reduce((sum, credit) => sum.plus(credit.montantRembourse), new Prisma.Decimal(0));
          const netAfterCredits = Prisma.Decimal.max(source.total.plus(source.stampDuty).minus(credits), 0);
          const remaining = Prisma.Decimal.max(netAfterCredits.minus(paid), 0);
          await tx.sale.update({
            where: { id: source.id },
            data: {
              paidAmount: paid,
              totalRefunded: credits,
              remainingAmount: remaining,
              paymentStatus: PAYMENT_ACCEPTING_TYPES.has(source.documentType)
                ? this.paymentStatus(Number(netAfterCredits), Number(paid))
                : null,
            },
          });
        }

        const now = new Date();
        await tx.saleConsolidationSource.updateMany({
          where: { consolidatedSaleId: id, active: true },
          data: { active: false, cancelledAt: now },
        });
        const cancelled = await tx.sale.update({
          where: { id },
          data: {
            status: SaleStatus.CANCELLED,
            consolidationStatus: ConsolidationStatus.CANCELLED,
            consolidationCancelledAt: now,
          },
        });
        await this.auditLogs.audit({
          action: 'SALE_CONSOLIDATION_CANCELLED',
          entity: 'Sale',
          entityId: id,
          userId: user?.id,
          userName: user?.email,
          oldValue: {
            status: ConsolidationStatus.ACTIVE,
            total: Number(parent.total.plus(parent.stampDuty)),
            paidAmount: Number(parent.paidAmount),
            remainingAmount: Number(parent.remainingAmount),
          },
          newValue: { status: ConsolidationStatus.CANCELLED },
          metadata: {
            reason: reason?.trim() || null,
            sourceIds,
            sourceReferences: parent.consolidationSources.map((source) => source.sourceReference),
            result: 'sources_restored',
          },
        }, tx);
        return { ...cancelled, restoredSourceIds: sourceIds };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      await this.auditLogs.audit({
        action: 'SALE_CONSOLIDATION_CANCELLATION_BLOCKED',
        entity: 'Sale',
        entityId: id,
        userId: user?.id,
        userName: user?.email,
        metadata: { reason: error instanceof Error ? error.message : String(error) },
      }).catch(() => undefined);
      throw error;
    }
  }

  async getNextReference(
    documentType: DocumentType,
  ): Promise<{ reference: string }> {
    this.prefixForDocument(documentType);
    const reference = await this.references.peekNextSalesDocumentNumber(
      documentType,
      'Client',
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

    // ── Client comptoir: auto-création si email fourni ─────────────────────────
    let resolvedCustomerId = dto.customerId;
    let resolvedClientType = dto.clientType;

    if (!resolvedCustomerId && dto.counterClientEmail?.trim()) {
      const email = dto.counterClientEmail.trim().toLowerCase();
      const existing = await this.prisma.customer.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        resolvedCustomerId = existing.id;
      } else {
        const fullName =
          dto.counterClientLastName?.trim() ||
          dto.counterClientFullName?.trim() ||
          'Client comptoir';
        const created = await this.prisma.$transaction(async (tx) => {
          const ref = await this.references.generateForCustomer(
            'INDIVIDUAL',
            tx,
          );
          return tx.customer.create({
            data: {
              reference: ref,
              name: fullName,
              email,
              phone: dto.counterClientPhone?.trim() || undefined,
              address: dto.counterClientAddress?.trim() || undefined,
              type: 'INDIVIDUAL',
              origin: CustomerOrigin.SALE_COUNTER,
            },
          });
        });
        resolvedCustomerId = created.id;
      }
      resolvedClientType = 'PERSISTENT';
    }

    const isComptoir = resolvedClientType === 'COMPTOIR' || !resolvedCustomerId;

    const reserveStock = dto.reserveStock ?? false;
    const isDevis = documentType === DocumentType.DEVIS;
    const acceptsPayment = PAYMENT_ACCEPTING_TYPES.has(documentType);

    // ── Blocage client verrouillé (hors DEVIS) ────────────────────────────────
    if (!isDevis && resolvedCustomerId) {
      await this.customersService.assertClientNotLocked(resolvedCustomerId);
    }

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
    const allowEditUnitPriceHt = this.hasPermission(
      user,
      'sales.line.edit_unit_price_ht',
    );
    const documentDate = dto.date ? new Date(dto.date) : new Date();
    const counterClientFullName = isComptoir
      ? dto.counterClientFirstName && dto.counterClientLastName
        ? `${dto.counterClientFirstName.trim()} ${dto.counterClientLastName.trim()}`
        : dto.counterClientLastName?.trim() ||
          dto.counterClientFirstName?.trim() ||
          undefined
      : dto.counterClientFullName?.trim() || undefined;

    const sale = await this.prisma.$transaction(async (tx) => {
      const customer = resolvedCustomerId
        ? await tx.customer.findUnique({
            where: { id: resolvedCustomerId },
            select: { name: true },
          })
        : null;
      const invoiceNumber = await this.references.generateSalesDocumentNumber(
        documentType,
        customer?.name ??
          counterClientFullName ??
          (isComptoir ? 'Comptoir' : null),
        documentDate,
        tx,
      );

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
        const discountPercent = item.discountPercent ?? 0;
        const marginPercent =
          item.marginPercent ?? DEFAULT_SALES_MARGIN_PERCENT;
        const purchasePriceHt = Number(product.purchasePrice);
        const submittedGrossPriceHt =
          item.unitPrice ?? this.salePriceHt(product);
        const calculation = calculateSalesLine({
          purchasePriceHt,
          ...(purchasePriceHt <= 0 && {
            grossSalePriceHt: submittedGrossPriceHt,
          }),
          marginPercent,
          discountPercent,
          taxPercent: tvaRate,
          quantity: item.quantity,
        });
        const unitPrice = calculation.grossSalePriceHt;
        if (unitPrice < 0) {
          throw new BadRequestException(
            `Le prix de vente calculé pour "${product.name}" ne peut pas être négatif.`,
          );
        }

        if (
          Math.abs(marginPercent - DEFAULT_SALES_MARGIN_PERCENT) > 0.001 &&
          !allowEditUnitPriceHt
        ) {
          throw new ForbiddenException(
            `Vous n'avez pas la permission de modifier la marge pour "${product.name}".`,
          );
        }
        const grossLineHt = calculation.grossSalePriceHt * item.quantity;
        const lineDiscount = calculation.discountAmount;
        const netLineHt = calculation.totalHt;
        const lineTax = calculation.vatAmount;
        const lineTotalTtc = calculation.lineTtc;

        if (!isDevis) {
          if (purchasePriceHt <= 0) {
            throw new BadRequestException(
              `Le produit "${product.name}" n'a pas de prix d'achat défini. Vente refusée.`,
            );
          }
          if (
            calculation.netMarginPercent < MIN_MARGIN_PERCENT &&
            !allowLowMargin
          ) {
            throw new BadRequestException(
              `Vente refusée : marge insuffisante pour "${product.name}" (${calculation.netMarginPercent.toFixed(2)}% < ${MIN_MARGIN_PERCENT}%).`,
            );
          }
        }

        return {
          productId: item.productId,
          designation: item.designation?.trim() || product.name,
          quantity: item.quantity,
          unitPrice,
          tvaRate,
          discountPercent,
          marginPercent,
          grossTotal: grossLineHt,
          discountAmount: lineDiscount,
          netLineTotal: netLineHt,
          tax: lineTax,
          totalTtc: lineTotalTtc,
        };
      });

      const stampDuty = DEFAULT_STAMP_DUTY;
      const documentCalculation = calculateSalesTotals(
        rawItems.map((item) =>
          calculateSalesLine({
            purchasePriceHt: Number(
              productsById.get(item.productId)!.purchasePrice,
            ),
            grossSalePriceHt: item.unitPrice,
            marginPercent: item.marginPercent,
            discountPercent: item.discountPercent,
            taxPercent: item.tvaRate,
            quantity: item.quantity,
          }),
        ),
        stampDuty,
      );
      const subtotal = documentCalculation.totalHt;
      const discount = documentCalculation.totalDiscountHt;
      const tax = documentCalculation.totalVat;
      const total = documentCalculation.totalTtc;
      const totalFinal = documentCalculation.totalToPay;

      const rawPaidAmount = acceptsPayment
        ? this.round3(dto.paidAmount ?? 0)
        : 0;
      // CREDIT = vente à crédit, aucun encaissement immédiat — paidAmount reste 0.
      const paidAmount = dto.paymentMethod === 'CREDIT' ? 0 : rawPaidAmount;

      // Guard: paidAmount cannot exceed total
      if (paidAmount > totalFinal + 0.001) {
        throw new BadRequestException(
          `Le montant payé (${paidAmount.toFixed(3)}) dépasse le total à payer (${totalFinal.toFixed(3)})`,
        );
      }

      // paymentMethod is required when a payment is recorded
      if (paidAmount > 0 && !dto.paymentMethod) {
        throw new BadRequestException(
          'La méthode de paiement est requise lorsque paidAmount > 0',
        );
      }

      const remainingAmount = Math.max(totalFinal - paidAmount, 0);
      // Only FACTURE carries a payment status; other document types are not payable
      const paymentStatus = acceptsPayment
        ? this.paymentStatus(totalFinal, paidAmount)
        : null;
      const items = rawItems.map((item) => {
        return {
          productId: item.productId,
          designation: item.designation,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          marginPercent: item.marginPercent,
          tvaPercent: item.tvaRate,
          finalUnitPrice: salesRound3(item.netLineTotal / item.quantity),
          total: salesRound3(item.netLineTotal),
          unitPurchaseCostHt: Number(
            productsById.get(item.productId)!.purchasePrice,
          ),
          purchaseCostEstimated: false,
          calculationVersion: SALES_CALCULATION_VERSION,
        };
      });

      const sellerId = user?.id;
      const sale = await tx.sale.create({
        data: {
          invoiceNumber,
          createdAt: documentDate,
          customerId: resolvedCustomerId,
          clientType: resolvedClientType ?? null,
          counterClientFirstName: isComptoir
            ? (dto.counterClientFirstName?.trim() ?? null)
            : null,
          counterClientLastName: isComptoir
            ? (dto.counterClientLastName?.trim() ?? null)
            : null,
          counterClientFullName: counterClientFullName ?? null,
          counterClientEmail:
            dto.counterClientEmail?.trim().toLowerCase() ?? null,
          counterClientPhone: dto.counterClientPhone?.trim() ?? null,
          counterClientAddress: dto.counterClientAddress?.trim() ?? null,
          counterClientTaxId: dto.counterClientTaxId?.trim() ?? null,
          counterClientNote: dto.counterClientNote?.trim() ?? null,
          subtotal,
          discount,
          tax,
          total,
          stampDuty,
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
            customerId: resolvedCustomerId,
          },
        });

        await this.caisseService.recordMovement(tx, {
          type: CaisseMovementType.ENCAISSEMENT_VENTE,
          montant: paidAmount,
          motif: `Encaissement vente ${invoiceNumber}`,
          referenceDoc: payRef,
          userId: sellerId,
          paymentMethod: dto.paymentMethod,
        });
      }

      if (LAST_SALE_PRICE_TYPES.has(documentType)) {
        await this.recalculateLastSalePricesForProducts(
          tx,
          sale.items.map((item) => item.productId),
          sellerId,
        );
      }

      const finalSale = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: {
          items: { include: { product: true } },
          customer: true,
          seller: true,
          payments: true,
        },
      });

      await this.auditLogs.audit(
        {
          action: 'sale.created',
          entity: 'Sale',
          entityId: finalSale.id,
          userId: sellerId,
          userName: user?.email,
          newValue: {
            id: finalSale.id,
            invoiceNumber: finalSale.invoiceNumber,
            documentType: finalSale.documentType,
            status: finalSale.status,
            total: Number(finalSale.total),
            paidAmount: Number(finalSale.paidAmount),
            remainingAmount: Number(finalSale.remainingAmount),
            customerId: finalSale.customerId,
          },
          metadata: {
            invoiceNumber: finalSale.invoiceNumber,
            documentType: finalSale.documentType,
            customerId: finalSale.customerId,
            customerName:
              finalSale.customer?.name ??
              finalSale.counterClientFullName ??
              null,
            total: Number(finalSale.total),
            paidAmount: Number(finalSale.paidAmount),
            paymentMethod: dto.paymentMethod ?? null,
            itemCount: finalSale.items.length,
          },
        },
        tx,
      );

      return finalSale;
    });

    // Recalcule le statut de verrouillage après création (BL/Facture créent une dette)
    if (resolvedCustomerId) {
      await this.customersService.recalculateClientLockStatus(
        resolvedCustomerId,
      );
    }

    return sale;
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

      await this.auditLogs.audit(
        {
          action: 'sale.validated',
          entity: 'Sale',
          entityId: sale.id,
          userId,
          userName: user?.email,
          oldValue: { status: sale.status },
          newValue: { status: SaleStatus.COMPLETED },
          metadata: {
            invoiceNumber: sale.invoiceNumber,
            documentType: sale.documentType,
          },
        },
        tx,
      );

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
          {
            customer: { name: { contains: query.search, mode: 'insensitive' } },
          },
        ],
      });
    }

    if (query?.payableOnly) {
      // Source de vérité : remainingAmount > 0 (calculé et stocké à chaque paiement).
      // On évite de se fier uniquement à paymentStatus qui pourrait être désynchronisé.
      // Un BL transformé en FACTURE ne doit plus apparaître ici (transformedToId != null).
      const payableCondition: Prisma.SaleWhereInput = {
        status: { not: SaleStatus.CANCELLED },
        remainingAmount: { gt: 0 },
        consolidationMemberships: { none: { active: true } },
        OR: [
          { documentType: DocumentType.FACTURE },
          { documentType: DocumentType.BON_LIVRAISON, transformedToId: null },
        ],
      };
      // Sous-filtre paymentStatus au sein des payables (UNPAID ou PARTIAL uniquement, PAID exclu)
      if (query.paymentStatus && query.paymentStatus !== PaymentStatus.PAID) {
        payableCondition.paymentStatus = query.paymentStatus;
      }
      andConditions.push(payableCondition);
    }

    const where: Prisma.SaleWhereInput = {
      deletedAt: null,
      NOT: {
        isConsolidated: true,
        consolidationStatus: ConsolidationStatus.CANCELLED,
      },
      // Ces filtres sont ignorés quand payableOnly est actif pour éviter des
      // contradictions (ex: documentType=DEVIS AND payableOnly=true → 0 résultat).
      // Le paymentStatus est géré dans la payableCondition quand payableOnly=true.
      ...(!query?.payableOnly && query?.status && { status: query.status }),
      ...(!query?.payableOnly &&
        query?.documentType && { documentType: query.documentType }),
      ...(!query?.payableOnly &&
        query?.paymentStatus && { paymentStatus: query.paymentStatus }),
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
    const allowedSortFields: Record<
      string,
      Prisma.SaleOrderByWithRelationInput
    > = {
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
    const orderBy: Prisma.SaleOrderByWithRelationInput = (query?.sortBy &&
      allowedSortFields[query.sortBy]) || { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          customer: true,
          items: true,
          payments: true,
          consolidationMemberships: { where: { active: true }, select: { consolidatedSale: { select: { id: true, invoiceNumber: true } } } },
          _count: { select: { creditNotes: true, consolidationSources: { where: { active: true } } } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.sale.count({ where }),
    ]);

    // Flatten _count into creditNotesCount for simpler frontend consumption
    const enriched = data.map(({ _count, ...sale }) => ({
      ...sale,
      creditNotesCount: _count.creditNotes,
      sourceDocumentsCount: _count.consolidationSources,
      activeConsolidation: sale.consolidationMemberships[0]?.consolidatedSale ?? null,
    }));

    return {
      data: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
        consolidationSources: { orderBy: { displayOrder: 'asc' }, include: { sourceSale: true } },
        consolidationMemberships: { where: { active: true }, include: { consolidatedSale: true } },
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

      // Reverse caisse per payment and soft-delete each payment.
      // Pass the original payment method so the reversal goes to the correct account.
      for (const payment of sale.payments) {
        if (payment.cashImpactDone) {
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_VENTE,
            montant: -Number(payment.amount),
            motif: `Annulation ${sale.documentType} ${sale.invoiceNumber} — paiement ${payment.reference}`,
            referenceDoc: sale.invoiceNumber,
            userId,
            paymentMethod: payment.method,
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
          remainingAmount: commercialTotalFinal(sale.total, sale.stampDuty),
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

      await this.auditLogs.audit(
        {
          action: 'sale.cancelled',
          entity: 'Sale',
          entityId: sale.id,
          userId,
          userName: user?.email,
          oldValue: {
            status: sale.status,
            paidAmount: Number(sale.paidAmount),
            remainingAmount: Number(sale.remainingAmount),
          },
          newValue: {
            status: SaleStatus.CANCELLED,
            paidAmount: 0,
            remainingAmount: Number(sale.total),
          },
          metadata: {
            invoiceNumber: sale.invoiceNumber,
            documentType: sale.documentType,
          },
        },
        tx,
      );

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
    if (!dto.items) {
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
    if (!dto.items.length) {
      throw new BadRequestException(
        'Le document doit contenir au moins une ligne',
      );
    }
    const requestedItems = dto.items;

    const allowLowMargin = this.hasPermission(user, 'sales.allow_low_margin');
    const allowEditUnitPriceHt = this.hasPermission(
      user,
      'sales.line.edit_unit_price_ht',
    );
    const userId = user?.id;

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, deletedAt: null },
        include: { items: true, payments: { where: { deletedAt: null } } },
      });
      if (!sale)
        throw new BadRequestException(
          'Document introuvable ou placé dans la corbeille',
        );
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException(
          'Impossible de modifier un document annulé',
        );
      }
      if (dto.documentType && dto.documentType !== sale.documentType) {
        throw new BadRequestException(
          'Le type d’un document existant ne peut pas être changé',
        );
      }

      const productIds = [
        ...new Set(requestedItems.map((item) => item.productId)),
      ];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
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
        const purchasePriceHt = Number(product.purchasePrice);
        const marginPercent =
          item.marginPercent ?? DEFAULT_SALES_MARGIN_PERCENT;
        const discountPercent = item.discountPercent ?? 0;
        const tvaRate = Number(product.tva ?? 0);
        const values = calculateSalesLine({
          purchasePriceHt,
          ...(purchasePriceHt <= 0 && { grossSalePriceHt: item.unitPrice }),
          marginPercent,
          discountPercent,
          taxPercent: tvaRate,
          quantity: item.quantity,
        });
        if (
          Math.abs(marginPercent - DEFAULT_SALES_MARGIN_PERCENT) > 0.001 &&
          !allowEditUnitPriceHt
        ) {
          throw new ForbiddenException(
            `Vous n'avez pas la permission de modifier la marge pour "${product.name}".`,
          );
        }
        if (sale.documentType !== DocumentType.DEVIS && purchasePriceHt <= 0) {
          throw new BadRequestException(
            `Le produit "${product.name}" n'a pas de prix d'achat défini.`,
          );
        }
        if (
          sale.documentType !== DocumentType.DEVIS &&
          values.netMarginPercent < MIN_MARGIN_PERCENT &&
          !allowLowMargin
        ) {
          throw new BadRequestException(
            `Vente refusée : marge insuffisante pour "${product.name}".`,
          );
        }
        return {
          productId: item.productId,
          designation: item.designation?.trim() || product.name,
          quantity: item.quantity,
          unitPrice: values.grossSalePriceHt,
          discountPercent,
          marginPercent,
          tvaPercent: tvaRate,
          finalUnitPrice: values.netSalePriceHt,
          total: values.totalHt,
          unitPurchaseCostHt: purchasePriceHt,
          purchaseCostEstimated: false,
          calculationVersion: SALES_CALCULATION_VERSION,
          discountAmount: values.discountAmount,
          taxAmount: values.taxAmount,
        };
      });

      const updateTotals = calculateSalesTotals(
        calculated.map((item) =>
          calculateSalesLine({
            purchasePriceHt: item.unitPurchaseCostHt,
            grossSalePriceHt: item.unitPrice,
            marginPercent: item.marginPercent,
            discountPercent: item.discountPercent,
            taxPercent: item.tvaPercent,
            quantity: item.quantity,
          }),
        ),
        Number(sale.stampDuty),
      );
      const subtotal = updateTotals.totalHt;
      const discount = updateTotals.totalDiscountHt;
      const tax = updateTotals.totalVat;
      const total = updateTotals.totalTtc;
      const totalFinal = commercialTotalFinal(total, Number(sale.stampDuty));
      const paidAmount = Number(sale.paidAmount);
      if (
        dto.paidAmount !== undefined &&
        Math.abs(dto.paidAmount - paidAmount) > 0.001
      ) {
        throw new BadRequestException(
          'Modifiez les encaissements depuis le module Paiements',
        );
      }
      if (paidAmount > totalFinal + 0.001) {
        throw new BadRequestException(
          'Le nouveau total ne peut pas être inférieur au montant déjà payé',
        );
      }

      if (sale.stockImpactDone) {
        for (const item of sale.items) {
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.CUSTOMER_RETURN,
            quantity: item.quantity,
            reason: `Modification ${sale.documentType}:${sale.invoiceNumber}`,
            userId,
          });
        }
        for (const item of calculated) {
          const current = await tx.product.findUnique({
            where: { id: item.productId },
            select: { quantity: true, name: true },
          });
          if (!current || current.quantity < item.quantity) {
            throw new BadRequestException(
              `Stock insuffisant pour "${current?.name ?? item.designation}"`,
            );
          }
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.SALE,
            quantity: item.quantity,
            reason: `Modification ${sale.documentType}:${sale.invoiceNumber}`,
            userId,
          });
        }
      }

      await tx.saleItem.deleteMany({ where: { saleId: id } });
      const updated = await tx.sale.update({
        where: { id },
        data: {
          customerId:
            dto.customerId === undefined ? sale.customerId : dto.customerId,
          clientType: dto.clientType ?? sale.clientType,
          counterClientFirstName: dto.counterClientFirstName,
          counterClientLastName: dto.counterClientLastName,
          counterClientFullName: dto.counterClientFullName,
          counterClientEmail: dto.counterClientEmail,
          counterClientPhone: dto.counterClientPhone,
          counterClientAddress: dto.counterClientAddress,
          counterClientTaxId: dto.counterClientTaxId,
          counterClientNote: dto.counterClientNote,
          ...(dto.date && { createdAt: new Date(dto.date) }),
          subtotal,
          discount,
          tax,
          total,
          remainingAmount: this.round3(Math.max(totalFinal - paidAmount, 0)),
          paymentStatus: PAYMENT_ACCEPTING_TYPES.has(sale.documentType)
            ? this.paymentStatus(totalFinal, paidAmount)
            : null,
          isEdited: true,
          editedAt: new Date(),
          items: {
            create: calculated.map(
              ({
                discountAmount: _discountAmount,
                taxAmount: _taxAmount,
                ...item
              }) => item,
            ),
          },
        },
        include: {
          customer: true,
          items: { include: { product: true } },
          payments: true,
        },
      });

      await this.auditLogs.audit(
        {
          action: 'sale.updated',
          entity: 'Sale',
          entityId: id,
          userId,
          userName: user?.email,
          oldValue: { total: Number(sale.total), itemCount: sale.items.length },
          newValue: { total, itemCount: calculated.length },
          metadata: {
            invoiceNumber: sale.invoiceNumber,
            documentType: sale.documentType,
          },
        },
        tx,
      );
      return updated;
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

    const sale = await this.prisma.sale.findFirstOrThrow({
      where: { id, deletedAt: null },
      select: {
        id: true,
        invoiceNumber: true,
        documentType: true,
        status: true,
        total: true,
        customerId: true,
      },
    });

    await this.prisma.sale.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId ?? null },
    });

    await this.auditLogs.audit({
      action: 'sale.deleted',
      entity: 'Sale',
      entityId: sale.id,
      userId,
      userName: user?.email,
      oldValue: {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        documentType: sale.documentType,
        status: sale.status,
        total: Number(sale.total),
        customerId: sale.customerId,
        deletedAt: null,
      },
      newValue: {
        deletedAt: new Date().toISOString(),
        deletedBy: userId ?? null,
      },
      metadata: {
        invoiceNumber: sale.invoiceNumber,
        documentType: sale.documentType,
      },
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

    const result = await this.prisma.$transaction(async (tx) => {
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

      // ── Blocage client verrouillé pour les transformations vers BL/Facture ──
      if (source.customerId && STOCK_IMPACTING_TYPES.has(targetType)) {
        await this.customersService.assertClientNotLocked(source.customerId);
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

      const documentDate = new Date();
      const invoiceNumber = await this.references.generateSalesDocumentNumber(
        targetType,
        source.customer?.name ??
          source.counterClientFullName ??
          (source.clientType === 'COMPTOIR' ? 'Comptoir' : null),
        documentDate,
        tx,
      );

      // Le document cible hérite du stock si la source l'avait déjà appliqué
      // (cas BL → FAC : le stock ne doit pas être décrémenté une 2e fois).
      const newStockImpactDone =
        targetAppliesStock && sourceAppliedStock ? true : false;

      const newSale = await tx.sale.create({
        data: {
          invoiceNumber,
          createdAt: documentDate,
          customerId: source.customerId,
          clientType: source.clientType,
          counterClientFirstName: source.counterClientFirstName,
          counterClientLastName: source.counterClientLastName,
          counterClientFullName: source.counterClientFullName,
          counterClientPhone: source.counterClientPhone,
          counterClientAddress: source.counterClientAddress,
          counterClientTaxId: source.counterClientTaxId,
          counterClientNote: source.counterClientNote,
          subtotal: source.subtotal,
          discount: source.discount,
          tax: source.tax,
          total: source.total,
          stampDuty: source.stampDuty,
          paidAmount: 0,
          remainingAmount: commercialTotalFinal(source.total, source.stampDuty),
          paymentStatus: PAYMENT_ACCEPTING_TYPES.has(targetType)
            ? PaymentStatus.UNPAID
            : null,
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
              designation: item.designation,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              marginPercent: item.marginPercent,
              tvaPercent: item.tvaPercent,
              finalUnitPrice: item.finalUnitPrice,
              total: item.total,
              unitPurchaseCostHt: item.unitPurchaseCostHt,
              purchaseCostEstimated: item.purchaseCostEstimated,
              calculationVersion: item.calculationVersion,
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

      const finalNew = await tx.sale.findUniqueOrThrow({
        where: { id: newSale.id },
        include: {
          items: { include: { product: true } },
          customer: true,
          seller: true,
          payments: true,
        },
      });

      await this.auditLogs.audit(
        {
          action: 'sale.transformed',
          entity: 'Sale',
          entityId: finalNew.id,
          userId,
          userName: user?.email,
          oldValue: {
            id: source.id,
            invoiceNumber: source.invoiceNumber,
            documentType: source.documentType,
          },
          newValue: {
            id: finalNew.id,
            invoiceNumber: finalNew.invoiceNumber,
            documentType: finalNew.documentType,
          },
          metadata: {
            sourceRef: source.invoiceNumber,
            sourceType: source.documentType,
            sourceId: source.id,
            targetRef: finalNew.invoiceNumber,
            targetType: finalNew.documentType,
            targetId: finalNew.id,
          },
        },
        tx,
      );

      return finalNew;
    });

    // Recalcule le statut de verrouillage si transformation vers BL/Facture
    const transformedSale = result as { customerId?: string | null };
    if (transformedSale.customerId && STOCK_IMPACTING_TYPES.has(targetType)) {
      await this.customersService.recalculateClientLockStatus(
        transformedSale.customerId,
      );
    }

    return result;
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
        const netHt =
          item.calculationVersion >= SALES_SNAPSHOT_VERSION
            ? Number(item.total)
            : item.marginPercent === null
              ? grossHt * (1 - discountPercent / 100)
              : grossHt;
        lineNetHtByItemId.set(item.id, netHt);
        lineDiscountTotal += grossHt - netHt;
        lineNetSubtotal += netHt;
      }

      const sale = saleGroup[0].sale;
      const usesNewPricing = saleGroup.every(
        (item) =>
          item.calculationVersion >= SALES_SNAPSHOT_VERSION ||
          item.marginPercent !== null,
      );
      const remainingDocumentDiscount = usesNewPricing
        ? 0
        : Math.max(Number(sale.discount) - lineDiscountTotal, 0);

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
    return calculatePaymentAmounts(total, paidAmount).paymentStatus;
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
