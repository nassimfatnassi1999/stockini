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
  PaymentType,
  Prisma,
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
import {
  calculateCreditNoteLineTotals,
  calculateCreditNoteTotals,
} from '../credit-notes/utils/credit-note-calculation.util';
import { commercialTotalFinal, DEFAULT_STAMP_DUTY } from '../common/utils/commercial-document';

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
      },
    });
    if (!sale) throw new NotFoundException(`Facture ${saleId} introuvable`);

    // Sum already-returned quantities per saleItem
    const existingReturns = await this.prisma.creditNoteItem.groupBy({
      by: ['saleItemId'],
      _sum: { quantiteRetournee: true },
      where: {
        saleItemId: { in: sale.items.map((i) => i.id) },
        creditNote: { statut: { not: 'CANCELLED' } },
      },
    });
    const returnedMap = new Map(
      existingReturns.map((r) => [r.saleItemId, r._sum.quantiteRetournee ?? 0]),
    );

    return {
      saleId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      customer: sale.customer,
      items: sale.items
        .map((item) => {
          const alreadyReturned = returnedMap.get(item.id) ?? 0;
          const cancelledQuantity = 0;
          return {
            saleItemId: item.id,
            productId: item.productId,
            product: item.product,
            quantiteSold: item.quantity,
            quantiteDejaRetournee: alreadyReturned,
            quantiteAnnulee: cancelledQuantity,
            quantiteRetournable:
              item.quantity - alreadyReturned - cancelledQuantity,
            unitPrice: item.finalUnitPrice != null
              ? Number(item.finalUnitPrice)
              : item.total != null
                ? Number(item.total) / item.quantity
                : Number(item.unitPrice) * (1 - Number(item.discountPercent ?? 0) / 100),
            tvaRate: Number(item.product?.tva ?? 19),
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

        // Validate sale
        const sale = await tx.sale.findFirst({
          where: { id: dto.saleId, deletedAt: null },
          include: {
            customer: { select: { name: true } },
            items: { include: { product: true } },
          },
        });
        if (!sale)
          throw new NotFoundException(`Facture ${dto.saleId} introuvable`);
        const saleCanBeReturned =
          sale.status === SaleStatus.COMPLETED ||
          sale.status === SaleStatus.PARTIALLY_REFUNDED;
        if (
          !saleCanBeReturned ||
          !(
            [DocumentType.FACTURE, DocumentType.BON_LIVRAISON] as DocumentType[]
          ).includes(sale.documentType) ||
          !sale.stockImpactDone
        ) {
          throw new BadRequestException(
            'Un avoir doit être lié à une facture ou un bon de livraison validé avec stock impacté',
          );
        }

        // Validate customer matches
        if (
          dto.customerId &&
          sale.customerId &&
          dto.customerId !== sale.customerId
        ) {
          throw new BadRequestException(
            'Le client ne correspond pas à la facture',
          );
        }

        const effectiveCustomerId = dto.customerId ?? sale.customerId;
        if (refundMethod === 'CUSTOMER_CREDIT' && !effectiveCustomerId) {
          throw new BadRequestException(
            'Le crédit client nécessite un client enregistré',
          );
        }

        // Map saleItems by id and by productId for lookup
        const saleItemsById = new Map(sale.items.map((i) => [i.id, i]));
        const saleItemsByProductId = new Map(
          sale.items.map((i) => [i.productId, i]),
        );

        // Check already-returned quantities
        const existingReturns = await tx.creditNoteItem.groupBy({
          by: ['saleItemId'],
          _sum: { quantiteRetournee: true },
          where: {
            saleItemId: { in: sale.items.map((i) => i.id) },
            creditNote: { statut: { not: 'CANCELLED' } },
          },
        });
        const returnedMap = new Map(
          existingReturns.map((r) => [
            r.saleItemId,
            r._sum.quantiteRetournee ?? 0,
          ]),
        );

        const seenSaleItems = new Set<string>();

        // Validate each item
        const globalRestock = dto.restock !== false;

        const resolvedItems: Array<{
          saleItemId: string;
          productId: string;
          designation: string;
          quantiteRetournee: number;
          prixUnitaireHt: number;
          tva: number;
          totalHt: number;
          totalTtc: number;
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

          const saleItem = dtoItem.saleItemId
            ? saleItemsById.get(dtoItem.saleItemId)
            : saleItemsByProductId.get(dtoItem.productId);

          if (!saleItem) {
            throw new BadRequestException(
              `Le produit ${dtoItem.productId} ne fait pas partie de cette facture`,
            );
          }
          if (seenSaleItems.has(saleItem.id)) {
            throw new BadRequestException(
              `La ligne ${saleItem.product?.name ?? dtoItem.productId} est présente plusieurs fois`,
            );
          }
          seenSaleItems.add(saleItem.id);

          const alreadyReturned = returnedMap.get(saleItem.id) ?? 0;
          const returnable = saleItem.quantity - alreadyReturned;

          if (dtoItem.quantiteRetournee > returnable) {
            throw new BadRequestException(
              `Quantité retournable insuffisante pour ${saleItem.product?.name ?? dtoItem.productId} (max: ${returnable})`,
            );
          }

          // An avoir rembourse le prix net réellement facturé, jamais le prix brut avant remise.
          const unitPriceHt = saleItem.finalUnitPrice != null
            ? Number(saleItem.finalUnitPrice)
            : saleItem.total != null
              ? Number(saleItem.total) / saleItem.quantity
              : Number(saleItem.unitPrice) * (1 - Number(saleItem.discountPercent ?? 0) / 100);
          const tvaRate = Number(saleItem.tvaPercent ?? saleItem.product?.tva ?? 19);
          const lineTotals = calculateCreditNoteLineTotals({
            quantity: dtoItem.quantiteRetournee,
            unitPriceHt,
            tvaRate,
          });

          resolvedItems.push({
            saleItemId: saleItem.id,
            productId: saleItem.productId,
            designation: saleItem.designation ?? saleItem.product?.name ?? dtoItem.productId,
            quantiteRetournee: dtoItem.quantiteRetournee,
            prixUnitaireHt: unitPriceHt,
            tva: tvaRate,
            totalHt: lineTotals.totalHt,
            totalTtc: lineTotals.totalTtc,
            motifLigne: dtoItem.motifLigne,
            restock: dtoItem.restock !== undefined ? dtoItem.restock : globalRestock,
          });
        }

        const totals = calculateCreditNoteTotals(
          resolvedItems.map((item) => ({
            quantity: item.quantiteRetournee,
            unitPriceHt: item.prixUnitaireHt,
            tvaRate: item.tva,
          })),
        );
        const subtotal = totals.totalHt;
        const tax = totals.totalTva;
        const total = totals.totalTtc;
        const stampDuty = DEFAULT_STAMP_DUTY;
        const totalFinal = commercialTotalFinal(total, stampDuty);
        const montantRembourse = refundMethod === 'NONE' ? 0 : totalFinal;

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
            customerId: effectiveCustomerId,
            motif: dto.motif,
            subtotal,
            tax,
            total,
            stampDuty,
            montantRembourse,
            statut:
              refundMethod === 'NONE'
                ? CreditNoteStatus.CREATED
                : CreditNoteStatus.REFUNDED,
            createdById: user?.id,
            items: {
              create: resolvedItems.map((item) => ({
                saleItemId: item.saleItemId,
                productId: item.productId,
                designation: item.designation,
                quantiteRetournee: item.quantiteRetournee,
                prixUnitaireHt: item.prixUnitaireHt,
                tva: item.tva,
                totalHt: item.totalHt,
                totalTtc: item.totalTtc,
                motifLigne: item.motifLigne,
              })),
            },
          },
          include: AVOIR_INCLUDE,
        });

        // Restore stock only for lines where restock is enabled
        for (const item of resolvedItems) {
          if (!item.restock) continue;
          await this.stockService.applyMovement(tx, {
            productId: item.productId,
            type: StockMovementType.CUSTOMER_RETURN,
            quantity: item.quantiteRetournee,
            reason: `Retour client - Avoir ${numero}`,
            userId: user?.id,
          });
        }

        if (refundMethod !== 'NONE' && montantRembourse > 0) {
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
              amount: montantRembourse,
              // cashImpactDone = true for all real-money methods, not just CASH.
              cashImpactDone: isRealMoneyRefund,
              saleId: dto.saleId,
              customerId: effectiveCustomerId,
              creditNoteId: avoir.id,
              note: `Remboursement avoir ${numero}`,
            },
          });

          if (isRealMoneyRefund) {
            // CASH → PHYSICAL_CASH, CARD/BANK_TRANSFER/CHECK → BANK_TREASURY
            await this.caisseService.recordMovement(tx, {
              type: CaisseMovementType.ANNULATION_VENTE,
              montant: -montantRembourse,
              motif: `Remboursement avoir ${numero}`,
              referenceDoc: payment.reference,
              userId: user?.id,
              paymentMethod: refundMethod as string,
            });
          }
          if (refundMethod === 'CUSTOMER_CREDIT' && effectiveCustomerId) {
            await tx.customer.update({
              where: { id: effectiveCustomerId },
              data: { creditBalance: { increment: montantRembourse } },
            });
          }
        }

        await this.updateSourceSaleRefundStatus(tx, sale.id);

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
    return 'CASH';
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

  private async updateSourceSaleRefundStatus(
    tx: Prisma.TransactionClient,
    saleId: string,
  ) {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { items: { select: { id: true, quantity: true } } },
    });

    const activeReturns = await tx.creditNoteItem.groupBy({
      by: ['saleItemId'],
      _sum: { quantiteRetournee: true },
      where: {
        saleItemId: { in: sale.items.map((item) => item.id) },
        creditNote: { statut: { not: 'CANCELLED' } },
      },
    });
    const returnedByLine = new Map(
      activeReturns.map((row) => [
        row.saleItemId,
        row._sum.quantiteRetournee ?? 0,
      ]),
    );
    const allQuantitiesReturned = sale.items.every(
      (item) => (returnedByLine.get(item.id) ?? 0) >= item.quantity,
    );

    const refundedTotals = await tx.creditNote.aggregate({
      where: { saleId, statut: { not: 'CANCELLED' } },
      _sum: { total: true, stampDuty: true },
    });
    const refundedTotal =
      Number(refundedTotals._sum.total ?? 0) +
      Number(refundedTotals._sum.stampDuty ?? 0);

    // Snapshot the original total on the very first avoir (never overwrite after that).
    const initialTtc =
      sale.totalInitialTtc != null
        ? Number(sale.totalInitialTtc)
        : commercialTotalFinal(sale.total, sale.stampDuty);
    const currentTtc = Math.max(0, initialTtc - refundedTotal);

    const nextStatus =
      allQuantitiesReturned || refundedTotal >= initialTtc - 0.001
        ? SaleStatus.REFUNDED
        : SaleStatus.PARTIALLY_REFUNDED;

    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: nextStatus,
        totalRefunded: refundedTotal,
        // Only set the initial snapshot once (first avoir).
        ...(sale.totalInitialTtc == null && {
          totalInitialTtc: commercialTotalFinal(sale.total, sale.stampDuty),
        }),
        totalCurrentTtc: currentTtc,
      },
    });
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
