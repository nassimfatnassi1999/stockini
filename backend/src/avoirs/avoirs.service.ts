import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CaisseMovementType,
  CreditNoteStatus,
  DocumentStatus,
  DocumentType,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Prisma,
  SaleCreditStatus,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { CaisseService } from '../caisse/caisse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { StockService } from '../stock/stock.service';
import { PdfService } from '../documents/pdf.service';
import { MinioService } from '../documents/minio.service';
import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateCreditNoteDto, type RefundMethod } from './dto/avoir.dto';
import { commercialTotalFinal } from '../common/utils/commercial-document';

const AVOIR_INCLUDE = {
  sale: { select: { invoiceNumber: true, customerId: true } },
  customer: {
    select: { id: true, name: true, phone: true, email: true, address: true },
  },
  createdBy: { select: { id: true, fullName: true } },
  items: {
    include: {
      product: { select: { id: true, reference: true, name: true } },
      saleItem: { select: { id: true, quantity: true } },
    },
  },
  payments: true,
} as const;

@Injectable()
export class AvoirsService {
  private readonly logger = new Logger(AvoirsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly references: ReferenceGeneratorService,
    private readonly pdf: PdfService,
    private readonly minio: MinioService,
    private readonly settings: SettingsService,
    private readonly caisseService: CaisseService,
  ) {}

  async getReturnableItems(saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, deletedAt: null },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, reference: true, name: true, tva: true },
            },
          },
        },
        customer: { select: { id: true, name: true } },
        consolidationSources: {
          where: { active: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            sourceSale: {
              include: {
                items: {
                  orderBy: { id: 'asc' },
                  include: {
                    product: {
                      select: {
                        id: true,
                        reference: true,
                        name: true,
                        tva: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!sale) throw new NotFoundException(`Document ${saleId} introuvable`);
    this.assertReturnableDocument(sale);

    const sourceItems = this.sourceItemsForDocument(sale);
    const sourceItemIds = sourceItems.map((item) => item.id);
    const existingReturns = await this.prisma.creditNoteItem.findMany({
      where: {
        creditNote: { statut: { not: 'CANCELLED' } },
        OR: [
          { originalSaleItemId: { in: sourceItemIds } },
          {
            originalSaleItemId: null,
            saleItemId: { in: sourceItemIds },
          },
        ],
      },
      select: {
        originalSaleItemId: true,
        saleItemId: true,
        quantiteRetournee: true,
      },
    });
    const returnedMap = this.returnedQuantityMap(existingReturns);
    const settledRefunds = await this.prisma.payment.aggregate({
      where: {
        saleId: sale.id,
        type: PaymentType.CREDIT_NOTE_REFUND,
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    return {
      saleId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      customer: sale.customer,
      documentType: sale.documentType,
      isConsolidated: sale.isConsolidated,
      documentLabel: this.documentLabel(sale),
      paidAmount: Number(sale.paidAmount),
      effectivePaid: Math.max(
        0,
        Number(sale.paidAmount) - Number(settledRefunds._sum.amount ?? 0),
      ),
      effectiveTotal: Number(
        sale.effectiveTotal ??
          sale.totalCurrentTtc ??
          new Prisma.Decimal(sale.total).plus(sale.stampDuty),
      ),
      items: sourceItems
        .map((item) => {
          const alreadyReturned = returnedMap.get(item.id) ?? 0;
          const cancelledQuantity = 0;
          const returnableQuantity = new Prisma.Decimal(item.quantity)
            .minus(alreadyReturned)
            .minus(cancelledQuantity);
          return {
            saleItemId: item.id,
            sourceSaleId: item.saleId,
            sourceSaleItemId: item.id,
            sourceReference: item.sourceReference,
            productId: item.productId,
            product: item.product,
            quantiteSold: item.quantity,
            quantiteDejaRetournee: alreadyReturned,
            quantiteAnnulee: cancelledQuantity,
            quantiteRetournable: returnableQuantity.toNumber(),
            unitPrice:
              item.finalUnitPrice != null
                ? Number(item.finalUnitPrice)
                : item.total != null
                  ? Number(item.total) / item.quantity
                  : Number(item.unitPrice) *
                    (item.marginPercent == null
                      ? 1 - Number(item.discountPercent ?? 0) / 100
                      : 1),
            tvaRate: Number(item.tvaPercent ?? item.product?.tva ?? 19),
            total: Number(item.total),
          };
        })
        .filter((i) => i.quantiteRetournable > 0),
    };
  }

  async create(dto: CreateCreditNoteDto, user?: AuthUser) {
    if (!dto.items.length) {
      throw new BadRequestException(
        'Un avoir doit inclure au moins un article',
      );
    }

    const refundMethod = this.resolveRefundMethod(dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${dto.saleId} FOR UPDATE`;

        const sale = await tx.sale.findFirst({
          where: { id: dto.saleId, deletedAt: null },
          include: {
            customer: { select: { name: true } },
            items: { include: { product: true } },
            consolidationSources: {
              where: { active: true },
              orderBy: { displayOrder: 'asc' },
              include: {
                sourceSale: {
                  include: {
                    items: {
                      orderBy: { id: 'asc' },
                      include: { product: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!sale)
          throw new NotFoundException(`Document ${dto.saleId} introuvable`);
        this.assertReturnableDocument(sale);

        const sourceItems = this.sourceItemsForDocument(sale);
        const sourceSaleIds = [
          ...new Set(sourceItems.map((item) => item.saleId)),
        ];
        if (sourceSaleIds.length) {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM "Sale" WHERE id IN (${Prisma.join(
              sourceSaleIds,
            )}) FOR UPDATE`,
          );
        }

        if (
          dto.customerId &&
          sale.customerId &&
          dto.customerId !== sale.customerId
        ) {
          throw new BadRequestException(
            'Le client ne correspond pas au document',
          );
        }

        const effectiveCustomerId = dto.customerId ?? sale.customerId;
        if (refundMethod === 'CUSTOMER_CREDIT' && !effectiveCustomerId) {
          throw new BadRequestException(
            'Le crédit client nécessite un client enregistré',
          );
        }

        const sourceItemsById = new Map(sourceItems.map((item) => [item.id, item]));
        const sourceItemIds = sourceItems.map((item) => item.id);
        const existingReturns = await tx.creditNoteItem.findMany({
          where: {
            creditNote: { statut: { not: 'CANCELLED' } },
            OR: [
              { originalSaleItemId: { in: sourceItemIds } },
              {
                originalSaleItemId: null,
                saleItemId: { in: sourceItemIds },
              },
            ],
          },
          select: {
            originalSaleItemId: true,
            saleItemId: true,
            quantiteRetournee: true,
          },
        });
        const returnedMap = this.returnedQuantityMap(existingReturns);
        const globalRestock = dto.restock !== false;

        const resolvedItems: Array<{
          saleItemId: string;
          originalSaleId: string;
          sourceReference: string;
          productId: string;
          designation: string;
          quantiteRetournee: number;
          prixUnitaireHt: Prisma.Decimal;
          tva: Prisma.Decimal;
          totalHt: Prisma.Decimal;
          totalTtc: Prisma.Decimal;
          motifLigne?: string;
          restock: boolean;
        }> = [];

        for (const dtoItem of dto.items) {
          if (!Number.isInteger(dtoItem.quantiteRetournee)) {
            throw new BadRequestException(
              'La quantité retournée doit être un entier',
            );
          }
          if (dtoItem.quantiteRetournee <= 0) {
            throw new BadRequestException(
              'La quantité retournée doit être supérieure à 0',
            );
          }

          const candidates = dtoItem.saleItemId
            ? [sourceItemsById.get(dtoItem.saleItemId)].filter(Boolean)
            : sourceItems.filter((item) => item.productId === dtoItem.productId);
          let remainingRequested = new Prisma.Decimal(
            dtoItem.quantiteRetournee,
          );
          for (const saleItem of candidates) {
            if (!saleItem || remainingRequested.lte(0)) break;
            const returnable = new Prisma.Decimal(saleItem.quantity).minus(
              returnedMap.get(saleItem.id) ?? 0,
            );
            const allocated = Prisma.Decimal.min(
              remainingRequested,
              returnable,
            );
            if (allocated.lte(0)) continue;
            const allocatedQuantity = allocated.toNumber();
            const unitPriceHt =
              saleItem.finalUnitPrice != null
                ? new Prisma.Decimal(saleItem.finalUnitPrice)
                : new Prisma.Decimal(saleItem.total).div(saleItem.quantity);
            const tvaRate = new Prisma.Decimal(
              saleItem.tvaPercent ?? saleItem.product?.tva ?? 19,
            );
            const totalHt = unitPriceHt
              .mul(allocated)
              .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
            const totalTtc = totalHt
              .mul(tvaRate.div(100).plus(1))
              .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
            resolvedItems.push({
              saleItemId: saleItem.id,
              originalSaleId: saleItem.saleId,
              sourceReference: saleItem.sourceReference,
              productId: saleItem.productId,
              designation:
                saleItem.designation ??
                saleItem.product?.name ??
                dtoItem.productId,
              quantiteRetournee: allocatedQuantity,
              prixUnitaireHt: unitPriceHt,
              tva: tvaRate,
              totalHt,
              totalTtc,
              motifLigne: dtoItem.motifLigne,
              restock:
                dtoItem.restock !== undefined
                  ? dtoItem.restock
                  : globalRestock,
            });
            returnedMap.set(
              saleItem.id,
              (returnedMap.get(saleItem.id) ?? 0) + allocatedQuantity,
            );
            remainingRequested = remainingRequested.minus(allocated);
          }
          if (remainingRequested.gt(0)) {
            throw new BadRequestException(
              `Quantité retournable insuffisante pour ${dtoItem.productId}`,
            );
          }
        }

        const subtotal = this.sumDecimal(
          resolvedItems.map((item) => item.totalHt),
        );
        const total = this.sumDecimal(
          resolvedItems.map((item) => item.totalTtc),
        );
        const tax = total.minus(subtotal);
        const isFullReturn = sourceItems.every(
          (item) => (returnedMap.get(item.id) ?? 0) >= item.quantity,
        );
        if (dto.refundStampDuty && !isFullReturn) {
          throw new BadRequestException(
            'Le timbre fiscal ne peut être remboursé que sur un avoir total',
          );
        }
        const stampDuty = dto.refundStampDuty
          ? new Prisma.Decimal(sale.stampDuty)
          : new Prisma.Decimal(0);
        const creditAmount = total.plus(stampDuty);

        const totalBeforeCredits = new Prisma.Decimal(
          sale.totalInitialTtc ??
            commercialTotalFinal(sale.total, sale.stampDuty),
        );
        const creditsBefore = new Prisma.Decimal(sale.creditedAmount ?? 0);
        const settledRefunds = await tx.payment.aggregate({
          where: {
            saleId: sale.id,
            type: PaymentType.CREDIT_NOTE_REFUND,
            deletedAt: null,
          },
          _sum: { amount: true },
        });
        const effectivePaidBefore = Prisma.Decimal.max(
          new Prisma.Decimal(sale.paidAmount).minus(
            settledRefunds._sum.amount ?? 0,
          ),
          0,
        );
        const effectiveTotalBefore = Prisma.Decimal.max(
          totalBeforeCredits.minus(creditsBefore),
          0,
        );
        const debtReductionAmount = Prisma.Decimal.min(
          creditAmount,
          Prisma.Decimal.max(
            effectiveTotalBefore.minus(effectivePaidBefore),
            0,
          ),
        );
        const effectiveTotalAfter = Prisma.Decimal.max(
          effectiveTotalBefore.minus(creditAmount),
          0,
        );
        const refundableAmount =
          refundMethod === 'NONE'
            ? new Prisma.Decimal(0)
            : Prisma.Decimal.min(
                creditAmount,
                Prisma.Decimal.max(
                  effectivePaidBefore.minus(effectiveTotalAfter),
                  0,
                ),
              );
        const customerCreditAmount =
          refundMethod === 'CUSTOMER_CREDIT'
            ? refundableAmount
            : new Prisma.Decimal(0);
        const montantRembourse = (
          ['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK'] as RefundMethod[]
        ).includes(refundMethod)
          ? refundableAmount
          : new Prisma.Decimal(0);

        const documentDate = new Date();
        const numero = await this.references.generateSalesDocumentNumber(
          DocumentType.AVOIR,
          sale.customer?.name ??
            sale.counterClientFullName ??
            (sale.clientType === 'COMPTOIR' ? 'Comptoir' : null),
          documentDate,
          tx,
        );

        const avoir = await tx.creditNote.create({
          data: {
            numero,
            dateAvoir: documentDate,
            saleId: dto.saleId,
            originalDocumentId: sale.id,
            customerId: effectiveCustomerId,
            motif: dto.motif,
            subtotal,
            tax,
            total,
            stampDuty,
            montantRembourse,
            debtReductionAmount,
            customerCreditAmount,
            refundMethod,
            consolidatedDocumentId: sale.isConsolidated ? sale.id : null,
            statut:
              refundableAmount.isZero()
                ? CreditNoteStatus.CREATED
                : CreditNoteStatus.REFUNDED,
            createdById: user?.id,
            items: {
              create: resolvedItems.map((item) => ({
                saleItemId: item.saleItemId,
                originalSaleId: item.originalSaleId,
                originalSaleItemId: item.saleItemId,
                sourceReference: item.sourceReference,
                productId: item.productId,
                designation: item.designation,
                quantiteRetournee: item.quantiteRetournee,
                prixUnitaireHt: item.prixUnitaireHt,
                tva: item.tva,
                totalHt: item.totalHt,
                totalTtc: item.totalTtc,
                motifLigne: item.motifLigne,
                stockRestocked: item.restock,
              })),
            },
          },
          include: AVOIR_INCLUDE,
        });

        for (const item of resolvedItems) {
          if (!item.restock) continue;
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.RETURN_IN,
            quantity: item.quantiteRetournee,
            reason: `Retour client - Avoir ${numero}`,
            userId: user?.id,
            sourceType: 'CREDIT_NOTE',
            sourceId: avoir.id,
            creditNoteId: avoir.id,
            originalSaleId: item.originalSaleId,
            originalSaleItemId: item.saleItemId,
          });
        }

        if (!refundableAmount.isZero()) {
          const paymentMethod = this.paymentMethodForRefund(refundMethod);
          // Real-money refund methods that impact a treasury account.
          const isRealMoneyRefund = (
            ['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK'] as RefundMethod[]
          ).includes(refundMethod);

          const payment = await tx.payment.create({
            data: {
              reference: await this.references.generate(
                'AV-PAY',
                'payment',
                tx,
              ),
              type: PaymentType.CREDIT_NOTE_REFUND,
              method: paymentMethod,
              amount: refundableAmount,
              // cashImpactDone = true for all real-money methods, not just CASH.
              cashImpactDone: isRealMoneyRefund,
              saleId: dto.saleId,
              customerId: effectiveCustomerId,
              creditNoteId: avoir.id,
              note: `Remboursement avoir ${numero}`,
            },
          });

          if (isRealMoneyRefund && !montantRembourse.isZero()) {
            await this.caisseService.recordMovement(tx, {
              type: CaisseMovementType.REFUND_OUT,
              montant: -montantRembourse.toNumber(),
              motif: `Remboursement avoir ${numero}`,
              referenceDoc: payment.reference,
              userId: user?.id,
              paymentMethod: refundMethod,
              creditNoteId: avoir.id,
            });
          }
          if (refundMethod === 'CUSTOMER_CREDIT' && effectiveCustomerId) {
            await tx.customer.update({
              where: { id: effectiveCustomerId },
              data: { creditBalance: { increment: customerCreditAmount } },
            });
          }
        }

        const creditedAmount = creditsBefore.plus(creditAmount);
        const creditedQuantity = this.sumDecimal(
          sourceItems.map((item) => returnedMap.get(item.id) ?? 0),
        );
        const effectivePaidAfter = effectivePaidBefore.minus(refundableAmount);
        const remainingAmount = Prisma.Decimal.max(
          effectiveTotalAfter.minus(effectivePaidAfter),
          0,
        );
        const overpaid = Prisma.Decimal.max(
          effectivePaidAfter.minus(effectiveTotalAfter),
          0,
        );
        const paymentStatus = !overpaid.isZero()
          ? PaymentStatus.CREDIT_BALANCE
          : remainingAmount.isZero()
            ? PaymentStatus.PAID
            : effectivePaidAfter.isZero()
              ? PaymentStatus.UNPAID
              : PaymentStatus.PARTIAL;
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            status: isFullReturn
              ? SaleStatus.REFUNDED
              : SaleStatus.PARTIALLY_REFUNDED,
            totalRefunded: creditedAmount,
            totalInitialTtc: totalBeforeCredits,
            totalCurrentTtc: effectiveTotalAfter,
            creditedAmount,
            creditedQuantity,
            creditStatus: isFullReturn
              ? SaleCreditStatus.FULL
              : SaleCreditStatus.PARTIAL,
            effectiveTotal: effectiveTotalAfter,
            remainingAmount,
            paymentStatus,
          },
        });

        if (sale.isConsolidated) {
          for (const sourceSaleId of sourceSaleIds) {
            const source = sale.consolidationSources.find(
              (link) => link.sourceSale.id === sourceSaleId,
            )?.sourceSale;
            if (!source) continue;
            const sourceCredits = await tx.creditNoteItem.aggregate({
              where: {
                originalSaleId: sourceSaleId,
                creditNote: { statut: { not: CreditNoteStatus.CANCELLED } },
              },
              _sum: { totalTtc: true, quantiteRetournee: true },
            });
            const sourceCreditedAmount = new Prisma.Decimal(
              sourceCredits._sum.totalTtc ?? 0,
            );
            const sourceFull = source.items.every(
              (sourceItem) =>
                (returnedMap.get(sourceItem.id) ?? 0) >= sourceItem.quantity,
            );
            await tx.sale.update({
              where: { id: sourceSaleId },
              data: {
                creditedAmount: sourceCreditedAmount,
                creditedQuantity: sourceCredits._sum.quantiteRetournee ?? 0,
                creditStatus: sourceFull
                  ? SaleCreditStatus.FULL
                  : SaleCreditStatus.PARTIAL,
                effectiveTotal: Prisma.Decimal.max(
                  new Prisma.Decimal(source.total)
                    .plus(source.stampDuty)
                    .minus(sourceCreditedAmount),
                  0,
                ),
              },
            });
          }
        }

        await tx.auditLog.create({
          data: {
            action: 'credit_note.created',
            entity: 'CreditNote',
            entityId: avoir.id,
            userId: user?.id,
            userName: user?.email,
            oldValue: {
              effectiveTotal: effectiveTotalBefore.toNumber(),
              effectivePaid: effectivePaidBefore.toNumber(),
            },
            newValue: {
              effectiveTotal: effectiveTotalAfter.toNumber(),
              effectivePaid: effectivePaidAfter.toNumber(),
              remaining: remainingAmount.toNumber(),
              overpaid: overpaid.toNumber(),
            },
            metadata: {
              creditNoteReference: numero,
              originalDocumentId: sale.id,
              originalDocumentReference: sale.invoiceNumber,
              consolidated: sale.isConsolidated,
              sourceSaleIds,
              stockQuantity: resolvedItems
                .filter((item) => item.restock)
                .reduce((sum, item) => sum + item.quantiteRetournee, 0),
              creditAmount: creditAmount.toNumber(),
              debtReductionAmount: debtReductionAmount.toNumber(),
              refundedAmount: montantRembourse.toNumber(),
              customerCreditAmount: customerCreditAmount.toNumber(),
              refundMethod,
              stampRefunded: stampDuty.toNumber(),
              reason: dto.motif ?? null,
            },
          },
        });

        return tx.creditNote.findUniqueOrThrow({
          where: { id: avoir.id },
          include: AVOIR_INCLUDE,
        });
      });
    } catch (error) {
      this.logger.error(
        `Erreur création avoir pour vente ${dto.saleId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  findAll(customerId?: string, saleId?: string) {
    return this.prisma.creditNote.findMany({
      where: {
        ...(customerId && { customerId }),
        ...(saleId && { saleId }),
      },
      include: AVOIR_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const avoir = await this.prisma.creditNote.findUnique({
      where: { id },
      include: AVOIR_INCLUDE,
    });
    if (!avoir) throw new NotFoundException(`Avoir ${id} introuvable`);
    return avoir;
  }

  async findByCustomer(customerId: string) {
    return this.prisma.creditNote.findMany({
      where: { customerId },
      include: AVOIR_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async generatePdf(
    id: string,
    user?: AuthUser,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const avoir = await this.prisma.creditNote.findUnique({
      where: { id },
      include: {
        ...AVOIR_INCLUDE,
        sale: {
          select: {
            invoiceNumber: true,
            customerId: true,
            clientType: true,
            counterClientFullName: true,
            counterClientPhone: true,
            counterClientAddress: true,
            counterClientTaxId: true,
            counterClientNote: true,
          },
        },
        items: {
          include: {
            product: { select: { id: true, reference: true, name: true } },
          },
        },
      },
    });
    if (!avoir) throw new NotFoundException(`Avoir ${id} introuvable`);

    const companySettings = await this.getCompanySettings();
    const customerName =
      avoir.sale?.counterClientFullName ??
      avoir.customer?.name ??
      'Client comptoir';

    const isAvoirComptoir = avoir.sale?.clientType === 'COMPTOIR';
    const pdfBuffer = await this.pdf.generateAvoirDocument(
      {
        numero: avoir.numero,
        dateAvoir: avoir.dateAvoir,
        factureOrigine: avoir.sale.invoiceNumber,
        customerName,
        isCounterClient: isAvoirComptoir,
        customerAddress: isAvoirComptoir
          ? avoir.sale?.counterClientAddress
          : (avoir.customer?.address ?? null),
        customerPhone: isAvoirComptoir
          ? avoir.sale?.counterClientPhone
          : (avoir.customer?.phone ?? null),
        customerEmail: isAvoirComptoir ? null : (avoir.customer?.email ?? null),
        customerTaxId: isAvoirComptoir ? avoir.sale?.counterClientTaxId : null,
        customerNote: isAvoirComptoir ? avoir.sale?.counterClientNote : null,
        motif: avoir.motif,
        items: avoir.items.map((item) => ({
          reference: item.product?.reference ?? '—',
          name: item.designation,
          quantiteRetournee: item.quantiteRetournee,
          prixUnitaireHt: Number(item.prixUnitaireHt),
          tva: Number(item.tva),
          totalHt: Number(item.totalHt),
          totalTtc: Number(item.totalTtc),
          motifLigne: item.motifLigne,
        })),
        subtotal: Number(avoir.subtotal),
        tax: Number(avoir.tax),
        total: Number(avoir.total),
        stampDuty: Number(avoir.stampDuty),
        montantRembourse: Number(avoir.montantRembourse),
      },
      companySettings,
    );

    // Store or update in minio and GeneratedDocument
    const fileName = `${avoir.numero}.pdf`;
    const now = new Date();
    const documentDate = new Date(avoir.dateAvoir);
    const year = documentDate.getFullYear();
    const month = String(documentDate.getMonth() + 1).padStart(2, '0');
    const objectKey = `documents/ventes/avoir/${year}/${month}/${fileName}`;

    await this.minio.putObject(
      this.minio.bucket,
      objectKey,
      pdfBuffer,
      'application/pdf',
    );

    const existing = await this.prisma.generatedDocument.findFirst({
      where: {
        creditNoteId: id,
        documentType: DocumentType.AVOIR,
      },
    });

    if (existing) {
      await this.prisma.generatedDocument.update({
        where: { id: existing.id },
        data: {
          fileSize: pdfBuffer.length,
          generatedAt: now,
          status: DocumentStatus.GENERATED,
          deletedAt: null,
          deletedBy: null,
        },
      });
    } else {
      try {
        await this.prisma.generatedDocument.create({
          data: {
            creditNoteId: id,
            clientId: avoir.customerId ?? undefined,
            clientName: customerName,
            documentType: DocumentType.AVOIR,
            documentNumber: avoir.numero,
            fileName,
            minioBucket: this.minio.bucket,
            minioObjectKey: objectKey,
            fileSize: pdfBuffer.length,
            totalHt: avoir.subtotal,
            totalTva: avoir.tax,
            totalTtc: avoir.total,
            stampDuty: avoir.stampDuty,
            totalFinal: new Prisma.Decimal(avoir.total).plus(avoir.stampDuty),
            generatedBy: user?.id,
            status: DocumentStatus.GENERATED,
          },
        });
      } catch (error) {
        if (!this.isDocumentNumberConflict(error)) throw error;
        const concurrent = await this.prisma.generatedDocument.findFirst({
          where: { creditNoteId: id, documentType: DocumentType.AVOIR },
        });
        if (!concurrent) throw error;
        this.logger.warn(
          `Concurrent PDF generation reused ${concurrent.documentNumber}`,
        );
      }
    }

    return { buffer: pdfBuffer, fileName };
  }

  private assertReturnableDocument(sale: {
    status: SaleStatus;
    documentType: DocumentType;
    stockImpactDone: boolean;
    isConsolidated: boolean;
    consolidationStatus?: string | null;
    consolidationSources?: Array<{
      sourceSale: { stockImpactDone: boolean };
    }>;
  }) {
    const validStatus =
      sale.status === SaleStatus.COMPLETED ||
      sale.status === SaleStatus.PARTIALLY_REFUNDED;
    const validType = (
      [DocumentType.FACTURE, DocumentType.BON_LIVRAISON] as DocumentType[]
    ).includes(sale.documentType);
    const stockWasImpacted = sale.isConsolidated
      ? Boolean(sale.consolidationSources?.length) &&
        sale.consolidationSources!.every(
          (source) => source.sourceSale.stockImpactDone,
        )
      : sale.stockImpactDone;
    if (
      !validStatus ||
      !validType ||
      !stockWasImpacted ||
      (sale.isConsolidated && sale.consolidationStatus !== 'ACTIVE')
    ) {
      throw new BadRequestException(
        'Un avoir doit être lié à un BL, une facture, un BLG ou une FACG actif dont le stock source a été impacté',
      );
    }
  }

  private sourceItemsForDocument(sale: {
    invoiceNumber: string;
    isConsolidated: boolean;
    items: any[];
    consolidationSources?: Array<{
      sourceReference: string;
      sourceSale: { id: string; items: any[] };
    }>;
  }): any[] {
    if (!sale.isConsolidated) {
      return sale.items.map((item) => ({
        ...item,
        sourceReference: sale.invoiceNumber,
      }));
    }
    return (sale.consolidationSources ?? []).flatMap((source) =>
      source.sourceSale.items.map((item) => ({
        ...item,
        saleId: source.sourceSale.id,
        sourceReference: source.sourceReference,
      })),
    );
  }

  private returnedQuantityMap(
    rows: Array<{
      originalSaleItemId?: string | null;
      saleItemId?: string | null;
      quantiteRetournee: number;
    }>,
  ): Map<string, number> {
    const result = new Map<string, number>();
    for (const row of rows) {
      const sourceItemId = row.originalSaleItemId ?? row.saleItemId;
      if (!sourceItemId) continue;
      result.set(
        sourceItemId,
        (result.get(sourceItemId) ?? 0) + row.quantiteRetournee,
      );
    }
    return result;
  }

  private sumDecimal(
    values: Array<Prisma.Decimal | number>,
  ): Prisma.Decimal {
    return values
      .reduce<Prisma.Decimal>(
        (sum, value) => sum.plus(value),
        new Prisma.Decimal(0),
      )
      .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
  }

  private documentLabel(sale: {
    documentType: DocumentType;
    isConsolidated: boolean;
  }) {
    if (sale.documentType === DocumentType.BON_LIVRAISON) {
      return sale.isConsolidated ? 'BLG consolidé' : 'BL';
    }
    return sale.isConsolidated ? 'FACG consolidée' : 'Facture';
  }

  private resolveRefundMethod(dto: CreateCreditNoteDto): RefundMethod {
    if (dto.refundMethod) return dto.refundMethod;
    if (dto.paymentMethod === 'CREDIT') return 'CUSTOMER_CREDIT';
    if (
      dto.paymentMethod === 'CASH' ||
      dto.paymentMethod === 'CARD' ||
      dto.paymentMethod === 'BANK_TRANSFER' ||
      dto.paymentMethod === 'CHECK'
    ) {
      return dto.paymentMethod;
    }
    return 'NONE';
  }

  private paymentMethodForRefund(refundMethod: RefundMethod): PaymentMethod {
    switch (refundMethod) {
      case 'CUSTOMER_CREDIT':
        return PaymentMethod.CREDIT;
      case 'NONE':
        return PaymentMethod.CREDIT;
      default:
        return refundMethod;
    }
  }

  private async getCompanySettings() {
    const rows = await this.settings.findAll();
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.key] = r.value;
    });
    return {
      name:
        map['company_name'] ??
        map['nom_entreprise'] ??
        process.env.COMPANY_NAME ??
        'Moumna spare part',
      address:
        map['company_address'] ??
        map['adresse'] ??
        process.env.COMPANY_ADDRESS ??
        undefined,
      phone:
        map['company_phone'] ??
        map['telephone'] ??
        process.env.COMPANY_PHONE ??
        undefined,
      email:
        map['company_email'] ??
        map['email'] ??
        process.env.COMPANY_EMAIL ??
        undefined,
      taxNumber:
        map['tax_number'] ??
        map['matricule_fiscal'] ??
        process.env.COMPANY_TAX_ID ??
        undefined,
      bankRib:
        map['company_bank_rib']?.trim() ||
        map['bank_rib']?.trim() ||
        process.env.COMPANY_BANK_RIB?.trim() ||
        undefined,
    };
  }

  private isDocumentNumberConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }
    const target = error.meta?.target;
    return (
      target === 'GeneratedDocument_documentNumber_key' ||
      target === 'documentNumber' ||
      (Array.isArray(target) && target.includes('documentNumber'))
    );
  }
}
