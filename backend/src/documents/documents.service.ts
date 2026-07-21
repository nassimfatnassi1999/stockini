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
  ShareLinkDto,
  SendEmailLinkDto,
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
          seller: { select: { fullName: true } },
          consolidationSources: { where: { active: true }, orderBy: { displayOrder: 'asc' } },
        },
      });
      if (!sale) throw new NotFoundException(`Sale ${invoiceId} not found`);
      if (sale.isConsolidated && sale.consolidationStatus !== 'ACTIVE') {
        throw new BadRequestException('Impossible de générer un document pour un regroupement inactif');
      }
      const existing = await this.prisma.generatedDocument.findFirst({
        where: {
          invoiceId,
          documentType: dto.documentType,
        },
      });
      // Consolidations must always be rebuilt from their canonical aggregate
      // sale so a second click refreshes the complete grouped PDF.
      if (
        existing &&
        existing.status !== DocumentStatus.DELETED &&
        !sale.isConsolidated
      ) {
        results.push(existing);
        continue;
      }

      const companySettings = await this.getCompanySettings();
      // Keep the sale reference for its native type; prefix alternate outputs
      // so each generated type retains a globally unique document number.
      const documentNumber = existing?.documentNumber ?? (
        dto.documentType === sale.documentType
          ? sale.invoiceNumber
          : `${DOC_PREFIXES[dto.documentType]}-${sale.invoiceNumber}`
      );
      const fileName = existing?.fileName ?? `${documentNumber}.pdf`;
      const clientId = sale.customerId ?? undefined;
      const clientName =
        sale.counterClientFullName ?? sale.customer?.name ?? 'Client comptoir';
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const folder = DOC_FOLDER[dto.documentType];
      const objectKey =
        existing?.minioObjectKey ??
        `documents/ventes/${folder}/${year}/${month}/${fileName}`;

      const isComptoir = sale.clientType === 'COMPTOIR';
      // Snapshot fields take priority over live customer data for all client types
      const pdfBuffer = await this.pdf.generateSaleDocument(
        {
          invoiceNumber: documentNumber,
          createdAt: sale.createdAt,
          subtotal: Number(sale.subtotal),
          discount: Number(sale.discount),
          tax: Number(sale.tax),
          total: Number(sale.total),
          timbreFiscal: Number(sale.stampDuty),
          paidAmount: Number(sale.paidAmount),
          remainingAmount: Number(sale.remainingAmount),
          sourceReferences: (sale.consolidationSources ?? []).map((source) => source.sourceReference),
          customerName: clientName,
          isCounterClient: isComptoir,
          customerAddress: sale.counterClientAddress ?? sale.customer?.address ?? null,
          customerPhone: sale.counterClientPhone ?? sale.customer?.phone ?? null,
          customerEmail: isComptoir ? null : (sale.customer?.email ?? null),
          customerTaxId: sale.counterClientTaxId ?? (sale.customer as { taxNumber?: string | null } | null)?.taxNumber ?? null,
          customerNote: sale.counterClientNote ?? null,
          representant: (sale as any).seller?.fullName ?? null,
          items: sale.items.map((item) => ({
            reference: item.product?.reference ?? '—',
            name: item.designation ?? item.product?.name ?? '—',
            quantity: item.quantity,
            unitPrice: Number(item.finalUnitPrice ?? item.unitPrice),
            discountPercent: Number(item.discountPercent ?? 0),
            tvaPercent: Number(item.tvaPercent ?? item.product?.tva ?? 0),
            total: Number(item.total),
            sourceReference: item.sourceReference,
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

      const data: Prisma.GeneratedDocumentUncheckedCreateInput = {
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
        stampDuty: sale.stampDuty,
        totalFinal: new Prisma.Decimal(sale.total).plus(sale.stampDuty),
        generatedBy: user?.id,
        status: DocumentStatus.GENERATED,
      };

      let doc;
      if (existing) {
        // Soft-deleted documents keep their unique number. Reuse the canonical
        // row and restore it instead of attempting an impossible duplicate.
        doc = await this.prisma.generatedDocument.update({
          where: { id: existing.id },
          data: {
            ...data,
            deletedAt: null,
            deletedBy: null,
            generatedAt: now,
            emailStatus: EmailStatus.PENDING,
            sentAt: null,
            sentTo: null,
          },
        });
      } else {
        try {
          doc = await this.prisma.generatedDocument.create({ data });
        } catch (error) {
          if (!this.isDocumentNumberConflict(error)) throw error;

          // Another request may have created this sale/type after our initial
          // lookup. The unique index is the atomic arbiter; return its winner.
          const concurrentDocument =
            await this.prisma.generatedDocument.findFirst({
              where: { invoiceId, documentType: dto.documentType },
            });
          if (!concurrentDocument) throw error;

          doc = concurrentDocument;
          this.logger.warn(
            `Concurrent generation reused ${concurrentDocument.documentNumber}`,
          );
        }
      }

      results.push(doc);
      if (sale.isConsolidated) {
        await this.prisma.auditLog.create({
          data: {
            action: 'sale.consolidation.pdf_generated',
            entity: 'Sale',
            entityId: sale.id,
            userId: user?.id ?? null,
            userName: user?.email ?? null,
            metadata: {
              reference: sale.invoiceNumber,
              documentId: doc.id,
              sourceReferences: (sale.consolidationSources ?? []).map((source) => source.sourceReference),
            },
          },
        });
      }
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
    const doc = await this.findAvailableDocument(id);
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
    const doc = await this.findAvailableDocument(id);
    const exists = await this.minio.objectExists(doc.minioBucket, doc.minioObjectKey);
    if (!exists) throw new NotFoundException('Le document demandé est introuvable.');
    const buffer = await this.minio.getObject(
      doc.minioBucket,
      doc.minioObjectKey,
    );
    return { buffer, fileName: doc.fileName };
  }

  private async findAvailableDocument(id: string) {
    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Le document demandé est introuvable.');
    return doc;
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

  // ─── Share link (presigned URL with configurable expiry) ─────────────────────

  async shareLink(
    id: string,
    dto: ShareLinkDto,
  ): Promise<{ url: string; expiresAt: string; expiresInDays: number }> {
    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id, deletedAt: null },
    });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);

    const exists = await this.minio.objectExists(doc.minioBucket, doc.minioObjectKey);
    if (!exists) throw new NotFoundException('Fichier PDF introuvable dans le stockage MinIO');

    const expiresInDays = dto.expiresInDays ?? 7;
    const expirySeconds = expiresInDays * 24 * 3600;
    const url = await this.minio.presignedGetUrl(
      doc.minioBucket,
      doc.minioObjectKey,
      expirySeconds,
    );
    const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();

    this.logger.log(
      `[SHARE-LINK] documentId=${id} expiresInDays=${expiresInDays} expiresAt=${expiresAt}`,
    );

    return { url, expiresAt, expiresInDays };
  }

  // ─── Send email with PDF link (no attachment) ─────────────────────────────────

  async sendEmailLink(id: string, dto: SendEmailLinkDto, user?: AuthUser) {
    if (!dto.to) {
      throw new BadRequestException('Adresse email du destinataire manquante.');
    }

    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id, deletedAt: null },
      include: {
        sale: {
          select: {
            invoiceNumber: true,
            total: true,
            customer: { select: { name: true, email: true } },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);

    const exists = await this.minio.objectExists(doc.minioBucket, doc.minioObjectKey);
    if (!exists) throw new NotFoundException('Fichier PDF introuvable dans le stockage MinIO');

    const expiresInDays = dto.expiresInDays ?? 7;
    const expirySeconds = expiresInDays * 24 * 3600;
    const presignedUrl = await this.minio.presignedGetUrl(
      doc.minioBucket,
      doc.minioObjectKey,
      expirySeconds,
    );
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    const clientName =
      doc.clientName ?? doc.sale?.customer?.name ?? 'Client';
    const docTypeLabel =
      DOC_PREFIXES[doc.documentType] ?? doc.documentType;
    const subject =
      dto.subject ??
      `${docTypeLabel} ${doc.documentNumber} — lien de consultation`;

    const htmlBody = this.buildLinkEmailHtml({
      clientName,
      documentNumber: doc.documentNumber,
      documentType: docTypeLabel,
      totalTtc: doc.totalTtc ? Number(doc.totalTtc) : null,
      stampDuty: Number(doc.stampDuty),
      totalFinal: doc.totalFinal ? Number(doc.totalFinal) : null,
      presignedUrl,
      expiresAt,
      customMessage: dto.message,
    });

    let emailStatus: EmailStatus = EmailStatus.SENT;
    let errorMessage: string | undefined;

    try {
      await this.email.sendHtml({ to: dto.to, subject, htmlBody });

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
        `[EMAIL-LINK] send failed for document ${id}: ${errorMessage}`,
      );

      await this.prisma.generatedDocument.update({
        where: { id },
        data: { emailStatus: EmailStatus.FAILED },
      });
    }

    this.logger.log(
      `[EMAIL-LINK] documentId=${id} recipient=${dto.to} expiresAt=${expiresAt.toISOString()} sentBy=${user?.id ?? 'unknown'} status=${emailStatus}`,
    );

    await this.prisma.documentEmailLog.create({
      data: {
        documentId: id,
        recipientEmail: dto.to,
        subject,
        message: `[LIEN PDF] Lien valable ${expiresInDays} jour(s) — expire le ${expiresAt.toLocaleDateString('fr-TN')}`,
        sentBy: user?.id,
        status: emailStatus,
        errorMessage,
      },
    });

    if (emailStatus === EmailStatus.FAILED) {
      throw new BadRequestException(`Échec de l'envoi email : ${errorMessage}`);
    }

    return {
      success: true,
      emailStatus,
      expiresAt: expiresAt.toISOString(),
      expiresInDays,
    };
  }

  private buildLinkEmailHtml(params: {
    clientName: string;
    documentNumber: string;
    documentType: string;
    totalTtc: number | null;
    stampDuty: number;
    totalFinal: number | null;
    presignedUrl: string;
    expiresAt: Date;
    customMessage?: string;
  }): string {
    const {
      clientName,
      documentNumber,
      documentType,
      totalTtc,
      stampDuty,
      totalFinal,
      presignedUrl,
      expiresAt,
      customMessage,
    } = params;

    const expireStr = expiresAt.toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const ttcRow =
      totalTtc !== null
        ? `<tr>
            <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:6px;">Montant TTC</td>
            <td style="color:#1d4ed8;font-size:15px;font-weight:700;text-align:right;">${totalTtc.toFixed(3)} TND</td>
          </tr>`
        : '';
    const finalRows = totalFinal !== null
      ? `${ttcRow}<tr>
          <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:6px;">Timbre fiscal</td>
          <td style="color:#111827;font-size:13px;text-align:right;">${stampDuty.toFixed(3)} TND</td>
        </tr><tr>
          <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:6px;">Total à payer</td>
          <td style="color:#1d4ed8;font-size:15px;font-weight:700;text-align:right;">${totalFinal.toFixed(3)} TND</td>
        </tr>`
      : ttcRow;

    const customMsgHtml = customMessage
      ? `<p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">${customMessage}</p>`
      : '';

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${documentType} ${documentNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#f4f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;
                      overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1d4ed8;padding:28px 32px;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Stockini</p>
              <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Document commercial</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 20px;color:#374151;font-size:15px;">
                Bonjour <strong>${clientName}</strong>,
              </p>
              ${customMsgHtml}
              <p style="margin:0 0 20px;color:#374151;font-size:14px;">
                Votre document est disponible en consultation et téléchargement&nbsp;:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Type</td>
                        <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">${documentType}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;padding-top:6px;">Référence</td>
                        <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">${documentNumber}</td>
                      </tr>
                      ${finalRows}
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="margin:0 auto 28px;">
                <tr>
                  <td style="background:#1d4ed8;border-radius:6px;">
                    <a href="${presignedUrl}" target="_blank"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;
                              font-weight:600;text-decoration:none;letter-spacing:0.2px;">
                      Consulter / Télécharger le PDF
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;text-align:center;">
                &#9888;&#65039; Ce lien expire le <strong style="color:#374151;">${expireStr}</strong>
              </p>
              <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
                Si le bouton ne fonctionne pas, copiez le lien directement dans votre navigateur.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:11px;">
                Ce message a été envoyé automatiquement — merci de ne pas y répondre.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
          include: {
            customer: true,
            items: { include: { product: true } },
            seller: { select: { fullName: true } },
          },
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
        timbreFiscal: Number(sale.stampDuty),
        customerName:
          sale.counterClientFullName ?? sale.customer?.name ?? 'Client comptoir',
        isCounterClient: isRegenerateComptoir,
        customerAddress: isRegenerateComptoir ? sale.counterClientAddress : sale.customer?.address,
        customerPhone: isRegenerateComptoir ? sale.counterClientPhone : sale.customer?.phone,
        customerEmail: isRegenerateComptoir ? null : sale.customer?.email,
        customerTaxId: isRegenerateComptoir ? sale.counterClientTaxId : (sale.customer as { taxId?: string | null } | null)?.taxId,
        customerNote: isRegenerateComptoir ? sale.counterClientNote : null,
        representant: (sale as any).seller?.fullName ?? null,
        items: sale.items.map((item) => ({
          reference: item.product?.reference ?? '—',
          name: item.designation ?? item.product?.name ?? '—',
          quantity: item.quantity,
          unitPrice: Number(item.finalUnitPrice ?? item.unitPrice),
          discountPercent: Number(item.discountPercent ?? 0),
          tvaPercent: Number(item.tvaPercent ?? item.product?.tva ?? 0),
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
}
