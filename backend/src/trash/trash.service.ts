import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TrashEntity =
  | 'product'
  | 'customer'
  | 'supplier'
  | 'sale'
  | 'purchase'
  | 'payment';

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
}

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        await this.prisma.payment.update({
          where: { id },
          data: { deletedAt: null, deletedBy: null },
        });
        break;
      default:
        throw new BadRequestException(`Unknown entity: ${entity}`);
    }
    this.logger.log(`Restored ${normalizedEntity}:${id}`);
  }

  async permanentDelete(entity: string, id: string): Promise<void> {
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
          await tx.payment.deleteMany({ where: { saleId: id } });
          await tx.sale.delete({ where: { id } });
        });
        break;
      }
      case 'purchase': {
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.deleteMany({ where: { purchaseId: id } });
          await tx.purchase.delete({ where: { id } });
        });
        break;
      }
      case 'payment':
        await this.prisma.payment.delete({ where: { id } });
        break;
      default:
        throw new BadRequestException(`Unknown entity: ${entity}`);
    }
    this.logger.log(`Permanently deleted ${normalizedEntity}:${id}`);
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
      entity === 'payment'
    ) {
      return entity;
    }
    throw new BadRequestException(`Unknown entity: ${entity}`);
  }
}
