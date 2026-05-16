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
          // Recalculate parent totals after restore
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
                paymentStatus: this.computePaymentStatus(
                  purchaseTotal,
                  newPaid,
                ),
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
  ): Promise<void> {
    const normalizedEntity = this.normalizeEntity(entity);
    this.logger.log(`DELETE /trash/${entity}/${id}/permanent called`);
    switch (normalizedEntity) {
      case 'product': {
        throw new BadRequestException(
          "Ce produit est lié à l'historique de stock. Il a été archivé au lieu d'être supprimé.",
        );
      }
      case 'customer': {
        const sales = await this.prisma.sale.count({
          where: { customerId: id },
        });
        const payments = await this.prisma.payment.count({
          where: { customerId: id },
        });
        if (sales > 0 || payments > 0) {
          throw new BadRequestException(
            'Ce client est lié à des ventes ou paiements. Suppression permanente refusée.',
          );
        }
        await this.prisma.customer.delete({ where: { id } });
        break;
      }
      case 'supplier': {
        const purchases = await this.prisma.purchase.count({
          where: { supplierId: id },
        });
        const products = await this.prisma.product.count({
          where: { supplierId: id },
        });
        if (purchases > 0 || products > 0) {
          throw new BadRequestException(
            'Ce fournisseur est lié à des achats ou produits. Suppression permanente refusée.',
          );
        }
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
            },
          });

          // Reverse stock only if not already cancelled and stock was impacted
          if (
            sale.status !== SaleStatus.CANCELLED &&
            sale.stockImpactDone
          ) {
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

          // Reverse stock for all received items
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

          // Reverse caisse per active payment
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
          await tx.purchase.delete({ where: { id } });
        });
        break;
      }
      case 'payment':
        await this.prisma.payment.delete({ where: { id } });
        break;
      case 'document': {
        const doc = await this.prisma.generatedDocument.findUniqueOrThrow({
          where: { id },
        });
        const trashKey = this.documentsService.toTrashKey(doc.minioObjectKey);
        try {
          const trashExists = await this.minio.objectExists(doc.minioBucket, trashKey);
          if (trashExists) {
            await this.minio.removeObject(doc.minioBucket, trashKey);
          } else {
            // File may still be at original path (e.g. MinIO move failed on soft-delete)
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
    this.logger.log(`Permanently deleted ${normalizedEntity}:${id}`);
  }

  private computePaymentStatus(
    total: number,
    paid: number,
  ): PaymentStatus {
    if (paid <= 0) return PaymentStatus.UNPAID;
    if (paid < total) return PaymentStatus.PARTIAL;
    return PaymentStatus.PAID;
  }

  private normalizeEntity(entity?: string): TrashEntity | undefined {
    if (!entity) {
      return undefined;
    }
    if (entity === 'client') {
      return 'customer';
    }
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
