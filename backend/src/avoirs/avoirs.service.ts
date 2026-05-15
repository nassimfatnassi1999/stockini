import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CaisseMovementType,
  DocumentStatus,
  DocumentType,
  PaymentMethod,
  PaymentType,
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
import { CreateAvoirDto } from './dto/avoir.dto';

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
            product: { select: { id: true, reference: true, name: true } },
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
          return {
            saleItemId: item.id,
            productId: item.productId,
            product: item.product,
            quantiteSold: item.quantity,
            quantiteDejaRetournee: alreadyReturned,
            quantiteRetournable: item.quantity - alreadyReturned,
            unitPrice: Number(item.unitPrice),
            total: Number(item.total),
          };
        })
        .filter((i) => i.quantiteRetournable > 0),
    };
  }

  async create(dto: CreateAvoirDto, user?: AuthUser) {
    if (!dto.items.length) {
      throw new BadRequestException(
        'Un avoir doit inclure au moins un article',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Validate sale
      const sale = await tx.sale.findFirst({
        where: { id: dto.saleId, deletedAt: null },
        include: { items: { include: { product: true } } },
      });
      if (!sale)
        throw new NotFoundException(`Facture ${dto.saleId} introuvable`);
      if (
        sale.status !== SaleStatus.COMPLETED ||
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

      // Validate each item
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
      }> = [];

      for (const dtoItem of dto.items) {
        const saleItem = dtoItem.saleItemId
          ? saleItemsById.get(dtoItem.saleItemId)
          : saleItemsByProductId.get(dtoItem.productId);

        if (!saleItem) {
          throw new BadRequestException(
            `Le produit ${dtoItem.productId} ne fait pas partie de cette facture`,
          );
        }

        const alreadyReturned = returnedMap.get(saleItem.id) ?? 0;
        const returnable = saleItem.quantity - alreadyReturned;

        if (dtoItem.quantiteRetournee > returnable) {
          throw new BadRequestException(
            `Quantité retournable insuffisante pour ${saleItem.product?.name ?? dtoItem.productId} (max: ${returnable})`,
          );
        }

        const unitPriceHt = Number(saleItem.unitPrice);
        const tvaRate = 19;
        const totalHt = unitPriceHt * dtoItem.quantiteRetournee;
        const totalTtc = totalHt * (1 + tvaRate / 100);

        resolvedItems.push({
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          designation: saleItem.product?.name ?? dtoItem.productId,
          quantiteRetournee: dtoItem.quantiteRetournee,
          prixUnitaireHt: unitPriceHt,
          tva: tvaRate,
          totalHt,
          totalTtc,
          motifLigne: dtoItem.motifLigne,
        });
      }

      const subtotal = resolvedItems.reduce((s, i) => s + i.totalHt, 0);
      const tax = resolvedItems.reduce(
        (s, i) => s + (i.totalTtc - i.totalHt),
        0,
      );
      const total = subtotal + tax;
      const montantRembourse = total;

      const numero = await this.references.generateSimple(
        'AV',
        'creditNote',
        tx,
      );

      const avoir = await tx.creditNote.create({
        data: {
          numero,
          saleId: dto.saleId,
          customerId: effectiveCustomerId,
          motif: dto.motif,
          subtotal,
          tax,
          total,
          montantRembourse,
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

      // Restore stock for returned products
      for (const item of resolvedItems) {
        await this.stockService.applyMovement(tx, {
          productId: item.productId,
          type: StockMovementType.CUSTOMER_RETURN,
          quantity: item.quantiteRetournee,
          reason: `Retour client - Avoir ${numero}`,
          userId: user?.id,
        });
      }

      // Record refund payment (debit caisse)
      if (montantRembourse > 0) {
        const paymentMethod =
          (dto.paymentMethod as PaymentMethod) ?? PaymentMethod.CASH;
        const payment = await tx.payment.create({
          data: {
            reference: await this.references.generate('AV-PAY', 'payment', tx),
            type: PaymentType.CREDIT_NOTE_REFUND,
            method: paymentMethod,
            amount: montantRembourse,
            cashImpactDone: true,
            saleId: dto.saleId,
            customerId: effectiveCustomerId,
            creditNoteId: avoir.id,
            note: `Remboursement avoir ${numero}`,
          },
        });

        await this.caisseService.recordMovement(tx, {
          type: CaisseMovementType.ANNULATION_VENTE,
          montant: -montantRembourse,
          motif: `Remboursement avoir ${numero}`,
          referenceDoc: payment.reference,
          userId: user?.id,
        });
      }

      return tx.creditNote.findUniqueOrThrow({
        where: { id: avoir.id },
        include: AVOIR_INCLUDE,
      });
    });
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
        sale: { select: { invoiceNumber: true, customerId: true } },
        items: {
          include: {
            product: { select: { id: true, reference: true, name: true } },
          },
        },
      },
    });
    if (!avoir) throw new NotFoundException(`Avoir ${id} introuvable`);

    const companySettings = await this.getCompanySettings();
    const customerName = avoir.customer?.name ?? 'Client comptoir';

    const pdfBuffer = await this.pdf.generateAvoirDocument(
      {
        numero: avoir.numero,
        dateAvoir: avoir.dateAvoir,
        factureOrigine: avoir.sale.invoiceNumber,
        customerName,
        customerAddress: avoir.customer?.address ?? null,
        customerPhone: avoir.customer?.phone ?? null,
        customerEmail: avoir.customer?.email ?? null,
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
        montantRembourse: Number(avoir.montantRembourse),
      },
      companySettings,
    );

    // Store or update in minio and GeneratedDocument
    const fileName = `AVOIR-${avoir.numero}.pdf`;
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
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
        status: { not: DocumentStatus.DELETED },
      },
    });

    if (existing) {
      await this.prisma.generatedDocument.update({
        where: { id: existing.id },
        data: {
          fileSize: pdfBuffer.length,
          generatedAt: now,
          status: DocumentStatus.GENERATED,
        },
      });
    } else {
      await this.prisma.generatedDocument.create({
        data: {
          creditNoteId: id,
          clientId: avoir.customerId ?? undefined,
          clientName: customerName,
          documentType: DocumentType.AVOIR,
          documentNumber: `AVOIR-${avoir.numero}`,
          fileName,
          minioBucket: this.minio.bucket,
          minioObjectKey: objectKey,
          fileSize: pdfBuffer.length,
          totalHt: avoir.subtotal,
          totalTva: avoir.tax,
          totalTtc: avoir.total,
          generatedBy: user?.id,
          status: DocumentStatus.GENERATED,
        },
      });
    }

    return { buffer: pdfBuffer, fileName };
  }

  private async getCompanySettings() {
    const rows = await this.settings.findAll();
    const map: Record<string, string> = {};
    rows.forEach((r) => {
      map[r.key] = r.value;
    });
    return {
      name: map['company_name'] ?? map['nom_entreprise'],
      address: map['company_address'] ?? map['adresse'],
      phone: map['company_phone'] ?? map['telephone'],
      email: map['company_email'] ?? map['email'],
      taxNumber: map['tax_number'] ?? map['matricule_fiscal'],
    };
  }
}
