import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CaisseMovementType,
  DocumentStatus,
  PaymentStatus,
  PurchaseStatus,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { CaisseService } from '../caisse/caisse.service';
import { DocumentsService } from '../documents/documents.service';
import { MinioService } from '../documents/minio.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';

export type TrashEntity =
  | 'product'
  | 'customer'
  | 'supplier'
  | 'sale'
  | 'purchase'
  | 'payment'
  | 'document';

export interface TrashItem {
  id: string;
  entity: TrashEntity;
  entityType: TrashEntity;
  entity_type: TrashEntity;
  reference: string;
  name: string;
  deletedAt: Date;
  deletedBy?: string | null;
  status?: string | null;
  total?: number | null;
  fileSize?: number | null;
  documentType?: string | null;
  minioObjectKey?: string | null;
  minioBucket?: string | null;
}

export interface DeleteImpactResult {
  canDelete: boolean;
  requiresCascadeConfirmation: boolean;
  mainEntity: string;
  entityType: string;
  entityStatus?: string | null;
  blockingRelations: string[];
  cascadeWouldDelete: string[];
  willKeep: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  warning?: string | null;
}

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly caisseService: CaisseService,
    private readonly minio: MinioService,
    private readonly documentsService: DocumentsService,
  ) {}

  async findAll(entity?: string): Promise<TrashItem[]> {
    const normalizedEntity = this.normalizeEntity(entity);
    const results: TrashItem[] = [];

    if (!normalizedEntity || normalizedEntity === 'product') {
      const rows = await this.prisma.product.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      });
      rows.forEach((r) =>
        results.push({
          id: r.id,
          entity: 'product',
          entityType: 'product',
          entity_type: 'product',
          reference: r.reference,
          name: r.name,
          deletedAt: r.deletedAt!,
          deletedBy: r.deletedBy ?? null,
        }),
      );
    }

    if (!normalizedEntity || normalizedEntity === 'customer') {
      const rows = await this.prisma.customer.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      });
      rows.forEach((r) =>
        results.push({
          id: r.id,
          entity: 'customer',
          entityType: 'customer',
          entity_type: 'customer',
          reference: r.reference,
          name: r.name,
          deletedAt: r.deletedAt!,
          deletedBy: r.deletedBy ?? null,
        }),
      );
    }

    if (!normalizedEntity || normalizedEntity === 'supplier') {
      const rows = await this.prisma.supplier.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      });
      rows.forEach((r) =>
        results.push({
          id: r.id,
          entity: 'supplier',
          entityType: 'supplier',
          entity_type: 'supplier',
          reference: r.reference,
          name: r.name,
          deletedAt: r.deletedAt!,
          deletedBy: r.deletedBy ?? null,
        }),
      );
    }

    if (!normalizedEntity || normalizedEntity === 'sale') {
      const rows = await this.prisma.sale.findMany({
        where: { deletedAt: { not: null } },
        include: { customer: true },
        orderBy: { deletedAt: 'desc' },
      });
      rows.forEach((r) =>
        results.push({
          id: r.id,
          entity: 'sale',
          entityType: 'sale',
          entity_type: 'sale',
          reference: r.invoiceNumber,
          name: r.customer?.name ?? 'Client inconnu',
          deletedAt: r.deletedAt!,
          deletedBy: r.deletedBy ?? null,
          status: r.status,
          total: Number(r.total),
        }),
      );
    }

    if (!normalizedEntity || normalizedEntity === 'purchase') {
      const rows = await this.prisma.purchase.findMany({
        where: { deletedAt: { not: null } },
        include: { supplier: true },
        orderBy: { deletedAt: 'desc' },
      });
      rows.forEach((r) =>
        results.push({
          id: r.id,
          entity: 'purchase',
          entityType: 'purchase',
          entity_type: 'purchase',
          reference: r.orderNumber,
          name: r.supplier?.name ?? 'Fournisseur inconnu',
          deletedAt: r.deletedAt!,
          deletedBy: r.deletedBy ?? null,
          status: r.status,
          total: Number(r.total),
        }),
      );
    }

    if (!normalizedEntity || normalizedEntity === 'payment') {
      const rows = await this.prisma.payment.findMany({
        where: { deletedAt: { not: null } },
        include: { customer: true, supplier: true },
        orderBy: { deletedAt: 'desc' },
      });
      rows.forEach((r) =>
        results.push({
          id: r.id,
          entity: 'payment',
          entityType: 'payment',
          entity_type: 'payment',
          reference: r.reference,
          name: r.customer?.name ?? r.supplier?.name ?? '—',
          deletedAt: r.deletedAt!,
          deletedBy: r.deletedBy ?? null,
          total: Number(r.amount),
        }),
      );
    }

    if (!normalizedEntity || normalizedEntity === 'document') {
      const rows = await this.prisma.generatedDocument.findMany({
        where: { deletedAt: { not: null } },
        include: { sale: { select: { customer: { select: { name: true } } } } },
        orderBy: { deletedAt: 'desc' },
      });
      rows.forEach((r) =>
        results.push({
          id: r.id,
          entity: 'document',
          entityType: 'document',
          entity_type: 'document',
          reference: r.documentNumber,
          name: r.clientName ?? r.sale?.customer?.name ?? '—',
          deletedAt: r.deletedAt!,
          deletedBy: r.deletedBy ?? null,
          fileSize: r.fileSize ?? null,
          documentType: r.documentType,
          minioObjectKey: r.minioObjectKey,
          minioBucket: r.minioBucket,
        }),
      );
    }

    const sortedResults = results.sort(
      (a, b) => b.deletedAt.getTime() - a.deletedAt.getTime(),
    );
    this.logger.log(
      `GET /trash entity=${entity ?? 'all'} returned ${sortedResults.length} item(s)`,
    );
    return sortedResults;
  }

  async previewDeleteImpact(entity: string, id: string): Promise<DeleteImpactResult> {
    const normalizedEntity = this.normalizeEntity(entity);
    this.logger.log(`GET /trash/${entity}/${id}/delete-impact called`);

    switch (normalizedEntity) {
      case 'product': {
        const product = await this.prisma.product.findUniqueOrThrow({ where: { id } });
        return {
          canDelete: false,
          requiresCascadeConfirmation: false,
          mainEntity: product.name,
          entityType: 'product',
          blockingRelations: ["Historique de stock", "Lignes de vente", "Lignes d'achat"],
          cascadeWouldDelete: [],
          willKeep: ["Historique de stock", "Mouvements de stock"],
          riskLevel: 'HIGH',
          warning: "Les produits sont archivés, pas supprimés, car ils sont liés à l'historique de stock.",
        };
      }

      case 'customer': {
        const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id } });
        const [salesCount, paymentsCount, creditNotesCount] = await Promise.all([
          this.prisma.sale.count({ where: { customerId: id } }),
          this.prisma.payment.count({ where: { customerId: id } }),
          this.prisma.creditNote.count({ where: { customerId: id } }),
        ]);

        const blockingRelations: string[] = [];
        if (salesCount > 0) blockingRelations.push(`${salesCount} vente(s)`);
        if (paymentsCount > 0) blockingRelations.push(`${paymentsCount} paiement(s)`);
        if (creditNotesCount > 0) blockingRelations.push(`${creditNotesCount} avoir(s)`);

        return {
          canDelete: blockingRelations.length === 0,
          requiresCascadeConfirmation: false,
          mainEntity: customer.name,
          entityType: 'customer',
          blockingRelations,
          cascadeWouldDelete: [],
          willKeep: blockingRelations,
          riskLevel: blockingRelations.length > 0 ? 'HIGH' : 'LOW',
          warning: blockingRelations.length > 0
            ? `Ce client est lié à des données existantes. Suppression permanente refusée.`
            : null,
        };
      }

      case 'supplier': {
        const supplier = await this.prisma.supplier.findUniqueOrThrow({ where: { id } });
        const [purchasesCount, productsCount] = await Promise.all([
          this.prisma.purchase.count({ where: { supplierId: id } }),
          this.prisma.product.count({ where: { supplierId: id } }),
        ]);

        const blockingRelations: string[] = [];
        if (purchasesCount > 0) blockingRelations.push(`${purchasesCount} achat(s)`);
        if (productsCount > 0) blockingRelations.push(`${productsCount} produit(s) rattaché(s)`);

        return {
          canDelete: blockingRelations.length === 0,
          requiresCascadeConfirmation: false,
          mainEntity: supplier.name,
          entityType: 'supplier',
          blockingRelations,
          cascadeWouldDelete: [],
          willKeep: blockingRelations,
          riskLevel: blockingRelations.length > 0 ? 'HIGH' : 'LOW',
          warning: blockingRelations.length > 0
            ? `Ce fournisseur est lié à des achats ou produits. Suppression permanente refusée.`
            : null,
        };
      }

      case 'sale': {
        const sale = await this.prisma.sale.findUniqueOrThrow({
          where: { id },
          include: {
            items: { select: { id: true } },
            payments: { select: { id: true, reference: true, amount: true, deletedAt: true, cashImpactDone: true } },
            creditNotes: {
              select: {
                id: true,
                numero: true,
                total: true,
                statut: true,
                payments: { select: { id: true } },
                documents: { select: { id: true } },
                items: { select: { id: true } },
              },
            },
            generatedDocuments: { select: { id: true, documentNumber: true } },
          },
        });

        const activePayments = sale.payments.filter((p) => !p.deletedAt);
        const creditNotes = sale.creditNotes;
        const blockingRelations: string[] = [];
        const cascadeWouldDelete: string[] = [];

        if (creditNotes.length > 0) blockingRelations.push(`${creditNotes.length} avoir(s) / note(s) de crédit`);
        if (activePayments.length > 0) blockingRelations.push(`${activePayments.length} paiement(s) actif(s)`);

        if (sale.items.length > 0) cascadeWouldDelete.push(`${sale.items.length} ligne(s) de document`);
        if (activePayments.length > 0) cascadeWouldDelete.push(`${activePayments.length} paiement(s)`);
        if (creditNotes.length > 0) {
          cascadeWouldDelete.push(`${creditNotes.length} avoir(s)`);
          const cnPayments = creditNotes.reduce((s, cn) => s + cn.payments.length, 0);
          if (cnPayments > 0) cascadeWouldDelete.push(`${cnPayments} paiement(s) d'avoir(s)`);
          const cnDocs = creditNotes.reduce((s, cn) => s + cn.documents.length, 0);
          if (cnDocs > 0) cascadeWouldDelete.push(`${cnDocs} document(s) PDF d'avoir(s)`);
        }
        if (sale.generatedDocuments.length > 0) {
          cascadeWouldDelete.push(`${sale.generatedDocuments.length} document(s) PDF`);
        }
        if (sale.stockImpactDone && sale.status !== SaleStatus.CANCELLED) {
          cascadeWouldDelete.push('Mouvement(s) de stock (inversé(s))');
        }

        const cashImpactPayments = activePayments.filter((p) => p.cashImpactDone);
        if (cashImpactPayments.length > 0) {
          cascadeWouldDelete.push(`Écriture(s) de caisse inversée(s) (${cashImpactPayments.length})`);
        }

        const willKeep = ["Journaux d'audit", "Historique de prix produits"];

        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        let warning: string | null = null;

        if (creditNotes.length > 0) {
          riskLevel = 'HIGH';
          const nums = creditNotes.map((cn) => cn.numero).join(', ');
          warning = `Cette facture a des avoir(s) liés (${nums}). La suppression en cascade peut affecter l'historique financier.`;
        } else if (
          sale.status === SaleStatus.REFUNDED ||
          sale.status === SaleStatus.PARTIALLY_REFUNDED
        ) {
          riskLevel = 'HIGH';
          warning = `Statut ${sale.status} : cette facture a été remboursée. Vérifiez l'impact avant suppression.`;
        } else if (activePayments.length > 0) {
          riskLevel = 'MEDIUM';
          warning = `${activePayments.length} paiement(s) actif(s) seront supprimés et les montants inversés en caisse.`;
        }

        return {
          canDelete: true,
          requiresCascadeConfirmation: blockingRelations.length > 0,
          mainEntity: sale.invoiceNumber,
          entityType: 'sale',
          entityStatus: sale.status,
          blockingRelations,
          cascadeWouldDelete,
          willKeep,
          riskLevel,
          warning,
        };
      }

      case 'purchase': {
        const purchase = await this.prisma.purchase.findUniqueOrThrow({
          where: { id },
          include: {
            items: { select: { id: true, receivedQuantity: true } },
            payments: { select: { id: true, deletedAt: true, cashImpactDone: true } },
          },
        });

        const activePayments = purchase.payments.filter((p) => !p.deletedAt);
        const receivedItems = purchase.items.filter((i) => i.receivedQuantity > 0);
        const blockingRelations: string[] = [];
        const cascadeWouldDelete: string[] = [];

        if (activePayments.length > 0) blockingRelations.push(`${activePayments.length} paiement(s) actif(s)`);

        if (purchase.items.length > 0) cascadeWouldDelete.push(`${purchase.items.length} ligne(s) d'achat`);
        if (activePayments.length > 0) cascadeWouldDelete.push(`${activePayments.length} paiement(s)`);
        if (receivedItems.length > 0 && purchase.status !== PurchaseStatus.CANCELLED) {
          cascadeWouldDelete.push(`Mouvement(s) de stock (inversé(s))`);
        }

        const cashImpact = activePayments.filter((p) => p.cashImpactDone);
        if (cashImpact.length > 0) {
          cascadeWouldDelete.push(`Écriture(s) de caisse inversée(s) (${cashImpact.length})`);
        }

        return {
          canDelete: true,
          requiresCascadeConfirmation: blockingRelations.length > 0,
          mainEntity: purchase.orderNumber,
          entityType: 'purchase',
          entityStatus: purchase.status,
          blockingRelations,
          cascadeWouldDelete,
          willKeep: ["Journaux d'audit"],
          riskLevel: blockingRelations.length > 0 ? 'MEDIUM' : 'LOW',
          warning: blockingRelations.length > 0
            ? `${activePayments.length} paiement(s) actif(s) seront supprimés et les montants inversés en caisse.`
            : null,
        };
      }

      case 'payment': {
        const payment = await this.prisma.payment.findUniqueOrThrow({
          where: { id },
          select: { reference: true, amount: true, cashImpactDone: true },
        });
        return {
          canDelete: true,
          requiresCascadeConfirmation: false,
          mainEntity: payment.reference,
          entityType: 'payment',
          blockingRelations: [],
          cascadeWouldDelete: payment.cashImpactDone ? ["Ce paiement est déjà retiré de la caisse"] : [],
          willKeep: ["Journaux d'audit"],
          riskLevel: 'LOW',
          warning: null,
        };
      }

      case 'document': {
        const doc = await this.prisma.generatedDocument.findUniqueOrThrow({
          where: { id },
          select: { documentNumber: true, documentType: true },
        });
        return {
          canDelete: true,
          requiresCascadeConfirmation: false,
          mainEntity: doc.documentNumber,
          entityType: 'document',
          blockingRelations: [],
          cascadeWouldDelete: ['Fichier PDF (MinIO)', 'Entrée base de données'],
          willKeep: ["Journaux d'audit"],
          riskLevel: 'LOW',
          warning: null,
        };
      }

      default:
        throw new BadRequestException(`Unknown entity: ${entity}`);
    }
  }

  async restore(entity: string, id: string): Promise<void> {
    const normalizedEntity = this.normalizeEntity(entity);
    this.logger.log(`PATCH /trash/${entity}/${id}/restore called`);
    switch (normalizedEntity) {
      case 'product':
        await this.prisma.product.update({
          where: { id },
          data: { deletedAt: null, deletedBy: null, isActive: true },
        });
        break;
      case 'customer':
        await this.prisma.customer.update({
          where: { id },
          data: { deletedAt: null, deletedBy: null },
        });
        break;
      case 'supplier':
        await this.prisma.supplier.update({
          where: { id },
          data: { deletedAt: null, deletedBy: null },
        });
        break;
      case 'sale':
        await this.prisma.sale.update({
          where: { id },
          data: { deletedAt: null, deletedBy: null },
        });
        break;
      case 'purchase':
        await this.prisma.purchase.update({
          where: { id },
          data: { deletedAt: null, deletedBy: null },
        });
        break;
      case 'payment':
        await this.prisma.$transaction(async (tx) => {
          const payment = await tx.payment.findUniqueOrThrow({
            where: { id },
            include: {
              sale: { select: { id: true, total: true } },
              purchase: { select: { id: true, total: true } },
            },
          });
          await tx.payment.update({
            where: { id },
            data: { deletedAt: null, deletedBy: null },
          });
          if (payment.saleId && payment.sale) {
            const agg = await tx.payment.aggregate({
              where: { saleId: payment.saleId, deletedAt: null },
              _sum: { amount: true },
            });
            const newPaid = Number(agg._sum.amount ?? 0);
            const saleTotal = Number(payment.sale.total);
            await tx.sale.update({
              where: { id: payment.saleId },
              data: {
                paidAmount: newPaid,
                remainingAmount: Math.max(saleTotal - newPaid, 0),
                paymentStatus: this.computePaymentStatus(saleTotal, newPaid),
              },
            });
          }
          if (payment.purchaseId && payment.purchase) {
            const agg = await tx.payment.aggregate({
              where: { purchaseId: payment.purchaseId, deletedAt: null },
              _sum: { amount: true },
            });
            const newPaid = Number(agg._sum.amount ?? 0);
            const purchaseTotal = Number(payment.purchase.total);
            await tx.purchase.update({
              where: { id: payment.purchaseId },
              data: {
                paidAmount: newPaid,
                remainingAmount: Math.max(purchaseTotal - newPaid, 0),
                paymentStatus: this.computePaymentStatus(purchaseTotal, newPaid),
              },
            });
          }
        });
        break;
      case 'document': {
        const doc = await this.prisma.generatedDocument.findUniqueOrThrow({
          where: { id },
        });
        const trashKey = this.documentsService.toTrashKey(doc.minioObjectKey);
        try {
          const trashExists = await this.minio.objectExists(doc.minioBucket, trashKey);
          if (trashExists) {
            await this.minio.moveObject(doc.minioBucket, trashKey, doc.minioObjectKey);
          }
        } catch (err) {
          this.logger.warn(
            `MinIO restore failed for document ${id}: ${(err as Error).message}. Proceeding with DB restore.`,
          );
        }
        await this.prisma.generatedDocument.update({
          where: { id },
          data: { deletedAt: null, deletedBy: null, status: DocumentStatus.GENERATED },
        });
        break;
      }
      default:
        throw new BadRequestException(`Unknown entity: ${entity}`);
    }
    this.logger.log(`Restored ${normalizedEntity}:${id}`);
  }

  async permanentDelete(
    entity: string,
    id: string,
    userId?: string,
    confirmCascade?: boolean,
  ): Promise<void> {
    const normalizedEntity = this.normalizeEntity(entity);
    this.logger.log(`DELETE /trash/${entity}/${id}/permanent confirmCascade=${confirmCascade ?? false}`);

    let auditMeta: Record<string, unknown> = { cascadeConfirmed: confirmCascade ?? false };

    try {
      switch (normalizedEntity) {
        case 'product': {
          throw new BadRequestException(
            "Ce produit est lié à l'historique de stock. Il a été archivé au lieu d'être supprimé.",
          );
        }

        case 'customer': {
          const sales = await this.prisma.sale.count({ where: { customerId: id } });
          const payments = await this.prisma.payment.count({ where: { customerId: id } });
          if (sales > 0 || payments > 0) {
            throw new BadRequestException(
              'Ce client est lié à des ventes ou paiements. Suppression permanente refusée.',
            );
          }
          const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id } });
          auditMeta = { ...auditMeta, reference: customer.reference };
          await this.prisma.customer.delete({ where: { id } });
          break;
        }

        case 'supplier': {
          const purchases = await this.prisma.purchase.count({ where: { supplierId: id } });
          const products = await this.prisma.product.count({ where: { supplierId: id } });
          if (purchases > 0 || products > 0) {
            throw new BadRequestException(
              'Ce fournisseur est lié à des achats ou produits. Suppression permanente refusée.',
            );
          }
          const supplier = await this.prisma.supplier.findUniqueOrThrow({ where: { id } });
          auditMeta = { ...auditMeta, reference: supplier.reference };
          await this.prisma.supplier.delete({ where: { id } });
          break;
        }

        case 'sale': {
          await this.prisma.$transaction(async (tx) => {
            const sale = await tx.sale.findUniqueOrThrow({
              where: { id },
              include: {
                items: true,
                payments: { where: { deletedAt: null } },
                creditNotes: {
                  include: {
                    payments: true,
                    documents: true,
                  },
                },
                generatedDocuments: true,
              },
            });

            auditMeta = {
              ...auditMeta,
              reference: sale.invoiceNumber,
              status: sale.status,
              creditNotesCount: sale.creditNotes.length,
              paymentsCount: sale.payments.length,
            };

            // Block if credit notes exist and cascade not confirmed
            if (sale.creditNotes.length > 0 && !confirmCascade) {
              const nums = sale.creditNotes.map((cn) => cn.numero).join(', ');
              throw new BadRequestException(
                `Cette facture a des avoir(s) liés (${nums}). Envoyez confirmCascade=true pour autoriser la suppression en cascade.`,
              );
            }

            // Delete credit notes and their dependencies first
            let deletedRelationsCount = 0;
            for (const cn of sale.creditNotes) {
              if (cn.payments.length > 0) {
                await tx.payment.deleteMany({ where: { creditNoteId: cn.id } });
                deletedRelationsCount += cn.payments.length;
              }
              if (cn.documents.length > 0) {
                await tx.generatedDocument.deleteMany({ where: { creditNoteId: cn.id } });
                deletedRelationsCount += cn.documents.length;
              }
              // CreditNoteItems are deleted via onDelete: Cascade
              await tx.creditNote.delete({ where: { id: cn.id } });
              deletedRelationsCount++;
            }

            auditMeta = { ...auditMeta, deletedRelationsCount };

            // Delete generated documents linked to this sale
            if (sale.generatedDocuments.length > 0) {
              await tx.generatedDocument.deleteMany({ where: { invoiceId: id } });
            }

            // Reverse stock if applicable
            if (sale.status !== SaleStatus.CANCELLED && sale.stockImpactDone) {
              for (const item of sale.items) {
                await this.stockService.applyMovement(tx, {
                  productId: item.productId,
                  type: StockMovementType.CUSTOMER_RETURN,
                  quantity: item.quantity,
                  reason: `Suppression définitive ${sale.documentType}:${sale.invoiceNumber}`,
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
                    motif: `Suppression définitive ${sale.documentType} ${sale.invoiceNumber} — paiement ${payment.reference}`,
                    referenceDoc: sale.invoiceNumber,
                    userId,
                  });
                }
              }
            }

            await tx.payment.deleteMany({ where: { saleId: id } });
            // SaleItems and ProductPriceHistory are cascade-deleted by DB
            await tx.sale.delete({ where: { id } });
          });
          break;
        }

        case 'purchase': {
          await this.prisma.$transaction(async (tx) => {
            const purchase = await tx.purchase.findUniqueOrThrow({
              where: { id },
              include: {
                items: true,
                payments: { where: { deletedAt: null } },
              },
            });

            auditMeta = {
              ...auditMeta,
              reference: purchase.orderNumber,
              status: purchase.status,
              paymentsCount: purchase.payments.length,
            };

            if (purchase.status !== PurchaseStatus.CANCELLED) {
              for (const item of purchase.items) {
                if (item.receivedQuantity > 0) {
                  await this.stockService.applyMovement(tx, {
                    productId: item.productId,
                    type: StockMovementType.SUPPLIER_RETURN,
                    quantity: item.receivedQuantity,
                    reason: `Suppression définitive achat ${purchase.orderNumber}`,
                    userId,
                  });
                }
              }
            }

            if (purchase.status !== PurchaseStatus.CANCELLED) {
              for (const payment of purchase.payments) {
                if (payment.cashImpactDone) {
                  await this.caisseService.recordMovement(tx, {
                    type: CaisseMovementType.ANNULATION_ACHAT,
                    montant: Number(payment.amount),
                    motif: `Suppression définitive achat ${purchase.orderNumber} — paiement ${payment.reference}`,
                    referenceDoc: purchase.orderNumber,
                    userId,
                  });
                }
              }
            }

            await tx.payment.deleteMany({ where: { purchaseId: id } });
            // PurchaseItems are cascade-deleted by DB
            await tx.purchase.delete({ where: { id } });
          });
          break;
        }

        case 'payment': {
          const payment = await this.prisma.payment.findUniqueOrThrow({
            where: { id },
            select: { reference: true },
          });
          auditMeta = { ...auditMeta, reference: payment.reference };
          await this.prisma.payment.delete({ where: { id } });
          break;
        }

        case 'document': {
          const doc = await this.prisma.generatedDocument.findUniqueOrThrow({
            where: { id },
          });
          auditMeta = { ...auditMeta, reference: doc.documentNumber };
          const trashKey = this.documentsService.toTrashKey(doc.minioObjectKey);
          try {
            const trashExists = await this.minio.objectExists(doc.minioBucket, trashKey);
            if (trashExists) {
              await this.minio.removeObject(doc.minioBucket, trashKey);
            } else {
              const origExists = await this.minio.objectExists(doc.minioBucket, doc.minioObjectKey);
              if (origExists) {
                await this.minio.removeObject(doc.minioBucket, doc.minioObjectKey);
              }
            }
          } catch (err) {
            this.logger.warn(
              `MinIO permanent delete failed for document ${id}: ${(err as Error).message}. Removing DB row.`,
            );
          }
          await this.prisma.generatedDocument.delete({ where: { id } });
          break;
        }

        default:
          throw new BadRequestException(`Unknown entity: ${entity}`);
      }

      await this.prisma.auditLog.create({
        data: {
          userId: userId ?? null,
          action: 'trash.permanent_delete',
          entity: normalizedEntity!,
          entityId: id,
          metadata: { ...auditMeta, success: true },
        },
      });

      this.logger.log(`Permanently deleted ${normalizedEntity}:${id}`);
    } catch (err) {
      // Log failure (skip logging for BadRequestException to avoid noise)
      if (!(err instanceof BadRequestException)) {
        await this.prisma.auditLog.create({
          data: {
            userId: userId ?? null,
            action: 'trash.permanent_delete',
            entity: normalizedEntity ?? entity,
            entityId: id,
            metadata: {
              ...auditMeta,
              success: false,
              reason: err instanceof Error ? err.message : String(err),
            },
          },
        });
      }
      throw err;
    }
  }

  async emptyTrash(userId?: string): Promise<{ deletedCount: number; failedCount: number; errors: string[] }> {
    this.logger.log('DELETE /trash/empty called');
    const items = await this.findAll();
    let deletedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.permanentDelete(item.entity, item.id, userId, false);
        deletedCount++;
      } catch (err) {
        failedCount++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${item.entity}:${item.id} — ${msg}`);
        this.logger.warn(`emptyTrash: failed to delete ${item.entity}:${item.id} — ${msg}`);
      }
    }

    this.logger.log(`emptyTrash done: deleted=${deletedCount} failed=${failedCount}`);
    return { deletedCount, failedCount, errors };
  }

  private computePaymentStatus(total: number, paid: number): PaymentStatus {
    if (paid <= 0) return PaymentStatus.UNPAID;
    if (paid < total) return PaymentStatus.PARTIAL;
    return PaymentStatus.PAID;
  }

  private normalizeEntity(entity?: string): TrashEntity | undefined {
    if (!entity) return undefined;
    if (entity === 'client') return 'customer';
    if (
      entity === 'product' ||
      entity === 'customer' ||
      entity === 'supplier' ||
      entity === 'sale' ||
      entity === 'purchase' ||
      entity === 'payment' ||
      entity === 'document'
    ) {
      return entity;
    }
    throw new BadRequestException(`Unknown entity: ${entity}`);
  }
}
