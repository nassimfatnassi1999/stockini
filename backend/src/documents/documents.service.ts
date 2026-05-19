import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
  DocumentStatus,
  EmailStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MinioService } from './minio.service';
import { PdfService } from './pdf.service';
import { EmailService } from './email.service';
import type {
  GenerateDocumentsDto,
  EmailPreviewDto,
  SendEmailDto,
  SendDocumentEmailDto,
  UpdateDocumentDto,
  ListDocumentsQuery,
} from './dto/document.dto';
import type { AuthUser } from '../common/decorators/current-user.decorator';

const DOC_PREFIXES: Record<DocumentType, string> = {
  DEVIS: 'DEVIS',
  BON_COMMANDE: 'BON-COMMANDE',
  BON_LIVRAISON: 'BON-LIVRAISON',
  FACTURE: 'FACTURE',
  AVOIR: 'AVOIR',
};

const DOC_FOLDER: Record<DocumentType, string> = {
  DEVIS: 'devis',
  BON_COMMANDE: 'bon-commande',
  BON_LIVRAISON: 'bon-livraison',
  FACTURE: 'facture',
  AVOIR: 'avoir',
};

const INCLUDE_SALE = {
  sale: {
    select: {
      invoiceNumber: true,
      subtotal: true,
      tax: true,
      total: true,
      customer: { select: { name: true, email: true } },
    },
  },
  generator: { select: { fullName: true } },
} as const;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly minio: MinioService,
    private readonly pdf: PdfService,
    private readonly email: EmailService,
  ) {}

  // ─── Generate ────────────────────────────────────────────────────────────────

  async generate(dto: GenerateDocumentsDto, user?: AuthUser) {
    const results = [];

    for (const invoiceId of dto.invoiceIds) {
      const sale = await this.prisma.sale.findFirst({
        where: { id: invoiceId, deletedAt: null },
        include: {
          customer: true,
          items: { include: { product: true } },
        },
      });
      if (!sale) throw new NotFoundException(`Sale ${invoiceId} not found`);
      if (dto.documentType === DocumentType.AVOIR) {
        throw new BadRequestException(
          'Les avoirs doivent être générés depuis le module Avoirs',
        );
      }
      if (sale.documentType !== dto.documentType) {
        throw new BadRequestException(
          `Type de document incohérent: la vente est ${sale.documentType}, génération demandée ${dto.documentType}`,
        );
      }

      const existing = await this.prisma.generatedDocument.findFirst({
        where: {
          invoiceId,
          documentType: dto.documentType,
          status: { not: DocumentStatus.DELETED },
        },
      });
      if (existing) {
        results.push(existing);
        continue;
      }

      const companySettings = await this.getCompanySettings();
      const prefix = DOC_PREFIXES[dto.documentType];
      const documentNumber = `${prefix}-${sale.invoiceNumber}`;
      const fileName = `${documentNumber}.pdf`;
      const clientId = sale.customerId ?? undefined;
      const clientName =
        sale.counterClientFullName ?? sale.customer?.name ?? 'Client comptoir';
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const folder = DOC_FOLDER[dto.documentType];
      const objectKey = `documents/ventes/${folder}/${year}/${month}/${fileName}`;

      const isComptoir = sale.clientType === 'COMPTOIR';
      const pdfBuffer = await this.pdf.generateSaleDocument(
        {
          invoiceNumber: sale.invoiceNumber,
          createdAt: sale.createdAt,
          subtotal: Number(sale.subtotal),
          discount: Number(sale.discount),
          tax: Number(sale.tax),
          total: Number(sale.total),
          customerName: clientName,
          isCounterClient: isComptoir,
          customerAddress: isComptoir ? sale.counterClientAddress : sale.customer?.address,
          customerPhone: isComptoir ? sale.counterClientPhone : sale.customer?.phone,
          customerEmail: isComptoir ? null : sale.customer?.email,
          customerTaxId: isComptoir ? sale.counterClientTaxId : (sale.customer as { taxId?: string | null } | null)?.taxId,
          customerNote: isComptoir ? sale.counterClientNote : null,
          items: sale.items.map((item) => ({
            reference: item.product?.reference ?? '—',
            name: item.product?.name ?? '—',
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            discountPercent: Number(item.discountPercent ?? 0),
            total: Number(item.total),
          })),
        },
        dto.documentType,
        companySettings,
      );

      await this.minio.putObject(
        this.minio.bucket,
        objectKey,
        pdfBuffer,
        'application/pdf',
      );

      const doc = await this.prisma.generatedDocument.create({
        data: {
          invoiceId,
          clientId,
          clientName,
          documentType: dto.documentType,
          documentNumber,
          fileName,
          minioBucket: this.minio.bucket,
          minioObjectKey: objectKey,
          fileSize: pdfBuffer.length,
          totalHt: sale.subtotal,
          totalTva: sale.tax,
          totalTtc: sale.total,
          generatedBy: user?.id,
          status: DocumentStatus.GENERATED,
        },
      });

      results.push(doc);
      this.logger.log(`Generated ${documentNumber} stored at ${objectKey}`);
    }

    return { documents: results };
  }

  // ─── List with filters (new Documents page) ──────────────────────────────────

  async list(query: ListDocumentsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.GeneratedDocumentWhereInput = {
      deletedAt: null,
    };

    if (query.documentType) where.documentType = query.documentType;
    if (query.clientId) where.clientId = query.clientId;
    if (query.status) where.status = query.status;
    if (query.invoiceId) where.invoiceId = query.invoiceId;

    if (query.search) {
      where.OR = [
        { documentNumber: { contains: query.search, mode: 'insensitive' } },
        { clientName: { contains: query.search, mode: 'insensitive' } },
        {
          sale: {
            invoiceNumber: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          sale: {
            customer: { name: { contains: query.search, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (query.dateFrom || query.dateTo) {
      where.generatedAt = {};
      if (query.dateFrom)
        (where.generatedAt as Prisma.DateTimeFilter).gte = new Date(
          query.dateFrom,
        );
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        (where.generatedAt as Prisma.DateTimeFilter).lte = end;
      }
    }

    if (query.minSize !== undefined || query.maxSize !== undefined) {
      where.fileSize = {};
      if (query.minSize !== undefined)
        (where.fileSize as Prisma.IntFilter).gte = query.minSize;
      if (query.maxSize !== undefined)
        (where.fileSize as Prisma.IntFilter).lte = query.maxSize;
    }

    const sortOrder = query.sortOrder ?? 'desc';
    const allowedSortFields: Record<string, Prisma.GeneratedDocumentOrderByWithRelationInput> = {
      createdAt: { generatedAt: sortOrder },
      generatedAt: { generatedAt: sortOrder },
      date: { generatedAt: sortOrder },
      totalTtc: { totalTtc: sortOrder },
      clientName: { clientName: sortOrder },
      reference: { documentNumber: sortOrder },
      documentNumber: { documentNumber: sortOrder },
      status: { status: sortOrder },
      documentType: { documentType: sortOrder },
      fileSize: { fileSize: sortOrder },
    };
    const orderBy: Prisma.GeneratedDocumentOrderByWithRelationInput =
      (query.sortBy && allowedSortFields[query.sortBy]) || { generatedAt: 'desc' };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.generatedDocument.count({ where }),
      this.prisma.generatedDocument.findMany({
        where,
        include: INCLUDE_SALE,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── Legacy findAll (kept for backward compat with ventes page) ──────────────

  async findAll(invoiceId?: string) {
    return this.prisma.generatedDocument.findMany({
      where: invoiceId ? { invoiceId, deletedAt: null } : { deletedAt: null },
      include: INCLUDE_SALE,
      orderBy: { generatedAt: 'desc' },
    });
  }

  // ─── Find one ────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...INCLUDE_SALE,
        emailLogs: { orderBy: { sentAt: 'desc' } },
      },
    });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);
    return doc;
  }

  // ─── Update metadata ─────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateDocumentDto) {
    await this.findOne(id);
    return this.prisma.generatedDocument.update({
      where: { id },
      data: {
        ...(dto.documentNumber !== undefined && {
          documentNumber: dto.documentNumber,
        }),
        ...(dto.clientName !== undefined && { clientName: dto.clientName }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: INCLUDE_SALE,
    });
  }

  // ─── Presigned URL ───────────────────────────────────────────────────────────

  async getPresignedUrl(id: string): Promise<{ url: string }> {
    const doc = await this.prisma.generatedDocument.findUniqueOrThrow({
      where: { id },
    });
    const url = await this.minio.presignedGetUrl(
      doc.minioBucket,
      doc.minioObjectKey,
    );
    return { url };
  }

  // ─── Download buffer ─────────────────────────────────────────────────────────

  async getDownloadBuffer(
    id: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const doc = await this.prisma.generatedDocument.findUniqueOrThrow({
      where: { id },
    });
    const buffer = await this.minio.getObject(
      doc.minioBucket,
      doc.minioObjectKey,
    );
    return { buffer, fileName: doc.fileName };
  }

  // ─── Email preview (batch, from ventes page) ─────────────────────────────────

  async emailPreview(dto: EmailPreviewDto) {
    if (!dto.documentIds.length) {
      throw new BadRequestException('Aucun document sélectionné');
    }

    const docs = await this.prisma.generatedDocument.findMany({
      where: { id: { in: dto.documentIds } },
      include: {
        sale: { select: { customer: { select: { name: true, email: true } } } },
      },
    });

    if (!docs.length) throw new NotFoundException('Documents introuvables');

    const clientEmails = new Set(
      docs.map((d) => d.sale?.customer?.email ?? '').filter(Boolean),
    );
    const clientNames = new Set(
      docs
        .map((d) => d.clientName ?? d.sale?.customer?.name ?? 'Client')
        .filter(Boolean),
    );

    if (clientEmails.size > 1 || clientNames.size > 1) {
      throw new BadRequestException(
        "Veuillez sélectionner des documents du même client pour l'envoi par email.",
      );
    }

    const clientEmail = [...clientEmails][0] ?? '';
    const clientName = [...clientNames][0] ?? 'Client';

    return {
      to: clientEmail,
      subject: `Documents commerciaux - ${clientName}`,
      body: `Bonjour ${clientName},\n\nVeuillez trouver en pièces jointes les documents demandés.\n\nCordialement.`,
      attachments: docs.map((d) => ({
        documentId: d.id,
        fileName: d.fileName,
      })),
    };
  }

  // ─── Send email (batch, from ventes page) ────────────────────────────────────

  async sendEmail(dto: SendEmailDto, user?: AuthUser) {
    if (!dto.to) {
      throw new BadRequestException(
        "Ce client n'a pas d'adresse email enregistrée.",
      );
    }

    const docs = await this.prisma.generatedDocument.findMany({
      where: { id: { in: dto.documentIds } },
    });
    if (!docs.length) throw new NotFoundException('Documents introuvables');

    const attachments = await Promise.all(
      docs.map(async (doc) => {
        const buffer = await this.minio.getObject(
          doc.minioBucket,
          doc.minioObjectKey,
        );
        return {
          filename: doc.fileName,
          content: buffer,
          contentType: 'application/pdf',
        };
      }),
    );

    let emailStatus: EmailStatus = EmailStatus.SENT;
    let errorMessage: string | undefined;

    try {
      await this.email.send({
        to: dto.to,
        cc: dto.cc,
        bcc: dto.bcc,
        subject: dto.subject,
        body: dto.body,
        attachments,
      });

      await this.prisma.generatedDocument.updateMany({
        where: { id: { in: dto.documentIds } },
        data: {
          emailStatus: EmailStatus.SENT,
          status: DocumentStatus.SENT,
          sentAt: new Date(),
          sentTo: dto.to,
        },
      });
    } catch (err) {
      emailStatus = EmailStatus.FAILED;
      errorMessage = (err as Error).message;
      this.logger.error(`Email send failed: ${errorMessage}`);

      await this.prisma.generatedDocument.updateMany({
        where: { id: { in: dto.documentIds } },
        data: { emailStatus: EmailStatus.FAILED },
      });
    }

    await this.prisma.documentEmailLog.createMany({
      data: dto.documentIds.map((documentId) => ({
        documentId,
        recipientEmail: dto.to,
        cc: dto.cc,
        bcc: dto.bcc,
        subject: dto.subject,
        message: dto.body,
        sentBy: user?.id,
        status: emailStatus,
        errorMessage,
      })),
    });

    if (emailStatus === EmailStatus.FAILED) {
      throw new BadRequestException(`Échec de l'envoi email : ${errorMessage}`);
    }

    return { success: true, emailStatus };
  }

  // ─── Per-document email (from Documents page) ────────────────────────────────

  async sendEmailForDocument(
    id: string,
    dto: SendDocumentEmailDto,
    user?: AuthUser,
  ) {
    if (!dto.to) {
      throw new BadRequestException('Adresse email du destinataire manquante.');
    }

    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id, deletedAt: null },
    });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);

    let emailStatus: EmailStatus = EmailStatus.SENT;
    let errorMessage: string | undefined;

    try {
      const buffer = await this.minio.getObject(
        doc.minioBucket,
        doc.minioObjectKey,
      );

      await this.email.send({
        to: dto.to,
        cc: dto.cc,
        bcc: dto.bcc,
        subject: dto.subject,
        body: dto.message ?? '',
        attachments: [
          {
            filename: doc.fileName,
            content: buffer,
            contentType: 'application/pdf',
          },
        ],
      });

      await this.prisma.generatedDocument.update({
        where: { id },
        data: {
          emailStatus: EmailStatus.SENT,
          status: DocumentStatus.SENT,
          sentAt: new Date(),
          sentTo: dto.to,
        },
      });
    } catch (err) {
      emailStatus = EmailStatus.FAILED;
      errorMessage = (err as Error).message;
      this.logger.error(
        `Email send failed for document ${id}: ${errorMessage}`,
      );

      await this.prisma.generatedDocument.update({
        where: { id },
        data: { emailStatus: EmailStatus.FAILED },
      });
    }

    await this.prisma.documentEmailLog.create({
      data: {
        documentId: id,
        recipientEmail: dto.to,
        cc: dto.cc,
        bcc: dto.bcc,
        subject: dto.subject,
        message: dto.message,
        sentBy: user?.id,
        status: emailStatus,
        errorMessage,
      },
    });

    if (emailStatus === EmailStatus.FAILED) {
      throw new BadRequestException(`Échec de l'envoi email : ${errorMessage}`);
    }

    return { success: true, emailStatus };
  }

  // ─── Email logs ──────────────────────────────────────────────────────────────

  async getEmailLogs(id: string) {
    await this.findOne(id);
    return this.prisma.documentEmailLog.findMany({
      where: { documentId: id },
      orderBy: { sentAt: 'desc' },
    });
  }

  // ─── Soft delete (move to trash) ─────────────────────────────────────────────

  async remove(id: string, user?: AuthUser) {
    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id, deletedAt: null },
    });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);

    const trashKey = this.toTrashKey(doc.minioObjectKey);
    try {
      await this.minio.moveObject(doc.minioBucket, doc.minioObjectKey, trashKey);
    } catch (err) {
      this.logger.warn(
        `MinIO move to trash failed for document ${id}: ${(err as Error).message}. Proceeding with soft-delete.`,
      );
    }

    await this.prisma.generatedDocument.update({
      where: { id },
      data: {
        status: DocumentStatus.DELETED,
        deletedAt: new Date(),
        deletedBy: user?.id ?? null,
      },
    });

    return { id, deleted: true };
  }

  toTrashKey(objectKey: string): string {
    if (objectKey.startsWith('documents/')) {
      return 'documents-trash/' + objectKey.slice('documents/'.length);
    }
    return 'documents-trash/' + objectKey;
  }

  fromTrashKey(trashKey: string): string {
    if (trashKey.startsWith('documents-trash/')) {
      return 'documents/' + trashKey.slice('documents-trash/'.length);
    }
    return trashKey;
  }

  // ─── Regenerate ──────────────────────────────────────────────────────────────

  async regenerate(id: string, user?: AuthUser) {
    const existing = await this.prisma.generatedDocument.findUniqueOrThrow({
      where: { id },
      include: {
        sale: {
          include: { customer: true, items: { include: { product: true } } },
        },
      },
    });

    const companySettings = await this.getCompanySettings();
    const sale = existing.sale;
    if (!sale) throw new BadRequestException('Aucune vente liée à ce document');

    const isRegenerateComptoir = sale.clientType === 'COMPTOIR';
    const pdfBuffer = await this.pdf.generateSaleDocument(
      {
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount),
        tax: Number(sale.tax),
        total: Number(sale.total),
        customerName:
          sale.counterClientFullName ?? sale.customer?.name ?? 'Client comptoir',
        isCounterClient: isRegenerateComptoir,
        customerAddress: isRegenerateComptoir ? sale.counterClientAddress : sale.customer?.address,
        customerPhone: isRegenerateComptoir ? sale.counterClientPhone : sale.customer?.phone,
        customerEmail: isRegenerateComptoir ? null : sale.customer?.email,
        customerTaxId: isRegenerateComptoir ? sale.counterClientTaxId : (sale.customer as { taxId?: string | null } | null)?.taxId,
        customerNote: isRegenerateComptoir ? sale.counterClientNote : null,
        items: sale.items.map((item) => ({
          reference: item.product?.reference ?? '—',
          name: item.product?.name ?? '—',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          discountPercent: Number(item.discountPercent ?? 0),
          total: Number(item.total),
        })),
      },
      existing.documentType,
      companySettings,
    );

    await this.minio.putObject(
      existing.minioBucket,
      existing.minioObjectKey,
      pdfBuffer,
      'application/pdf',
    );

    return this.prisma.generatedDocument.update({
      where: { id },
      data: {
        fileSize: pdfBuffer.length,
        generatedAt: new Date(),
        status: DocumentStatus.GENERATED,
        emailStatus: EmailStatus.PENDING,
        sentAt: null,
        sentTo: null,
        generatedBy: user?.id ?? existing.generatedBy,
      },
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

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
    };
  }
}
