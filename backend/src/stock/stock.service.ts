import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AlertType, Prisma, StockMovementType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import {
  ResetInventoryDto,
  StockAdjustmentDto,
  StockChangeDto,
  StockMovementQueryDto,
} from './dto/stock.dto';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
    private readonly settings: SettingsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async entry(dto: StockChangeDto, userId?: string) {
    await this.settings.assertActiveOption(
      'stock_movement_reasons',
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const movement = await this.applyMovement(tx, {
        productId: dto.productId,
        type: StockMovementType.ENTRY,
        quantity: dto.quantity,
        reason: dto.reason,
        userId,
      });
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { reference: true, name: true },
      });
      await this.auditLogs.audit({
        action: 'stock.entry',
        entity: 'StockMovement',
        entityId: movement.id,
        userId,
        oldValue: { quantity: movement.previousQuantity },
        newValue: { quantity: movement.newQuantity },
        metadata: {
          stockMovementId: movement.id,
          productId: dto.productId,
          productReference: product?.reference ?? null,
          productName: product?.name ?? null,
          quantity: dto.quantity,
          reason: dto.reason,
        },
      }, tx);
      return movement;
    });
  }

  async exit(dto: StockChangeDto, userId?: string) {
    await this.settings.assertActiveOption(
      'stock_movement_reasons',
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const movement = await this.applyMovement(tx, {
        productId: dto.productId,
        type: StockMovementType.EXIT,
        quantity: dto.quantity,
        reason: dto.reason,
        userId,
      });
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { reference: true, name: true },
      });
      await this.auditLogs.audit({
        action: 'stock.exit',
        entity: 'StockMovement',
        entityId: movement.id,
        userId,
        oldValue: { quantity: movement.previousQuantity },
        newValue: { quantity: movement.newQuantity },
        metadata: {
          stockMovementId: movement.id,
          productId: dto.productId,
          productReference: product?.reference ?? null,
          productName: product?.name ?? null,
          quantity: dto.quantity,
          reason: dto.reason,
        },
      }, tx);
      return movement;
    });
  }

  async adjustment(dto: StockAdjustmentDto, userId?: string) {
    await this.settings.assertActiveOption(
      'stock_movement_reasons',
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: dto.productId },
      });
      const delta = dto.newQuantity - product.quantity;
      const reference = await this.references.generate(
        'COR',
        'stockMovement',
        tx,
      );
      const movement = await tx.stockMovement.create({
        data: {
          productId: dto.productId,
          type: StockMovementType.ADJUSTMENT,
          quantity: Math.abs(delta),
          previousQuantity: product.quantity,
          newQuantity: dto.newQuantity,
          reason: dto.reason,
          reference,
          userId,
        },
      });
      await tx.product.update({
        where: { id: dto.productId },
        data: { quantity: dto.newQuantity },
      });
      await this.ensureStockAlert(tx, product, dto.newQuantity);

      await this.auditLogs.audit({
        action: 'stock.adjustment',
        entity: 'StockMovement',
        entityId: movement.id,
        userId,
        oldValue: { quantity: product.quantity },
        newValue: { quantity: dto.newQuantity },
        metadata: {
          stockMovementId: movement.id,
          productId: dto.productId,
          productReference: product.reference,
          productName: product.name,
          previousQuantity: product.quantity,
          newQuantity: dto.newQuantity,
          delta,
          reason: dto.reason,
        },
      }, tx);

      return movement;
    });
  }

  async history(query?: StockMovementQueryDto) {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(100, Math.max(1, query?.limit ?? 20));
    const skip = (page - 1) * limit;

    const andConditions: Prisma.StockMovementWhereInput[] = [];

    if (query?.search) {
      andConditions.push({
        OR: [
          { reference: { contains: query.search, mode: 'insensitive' } },
          { reason: { contains: query.search, mode: 'insensitive' } },
          { product: { name: { contains: query.search, mode: 'insensitive' } } },
          { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.StockMovementWhereInput = {
      ...(query?.type && { type: query.type }),
      ...(query?.productId && { productId: query.productId }),
      ...(query?.userId && { userId: query.userId }),
      ...((query?.dateFrom || query?.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
      ...(andConditions.length > 0 && { AND: andConditions }),
    };

    const sortOrder = query?.sortOrder ?? 'desc';
    const allowedSortFields: Record<string, Prisma.StockMovementOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder },
      date: { createdAt: sortOrder },
      quantity: { quantity: sortOrder },
      previousQuantity: { previousQuantity: sortOrder },
      newQuantity: { newQuantity: sortOrder },
      reference: { reference: sortOrder },
      status: { type: sortOrder },
    };
    const orderBy: Prisma.StockMovementOrderByWithRelationInput =
      (query?.sortBy && allowedSortFields[query.sortBy]) || { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── Reset inventory ──────────────────────────────────────────────────────────

  async resetInventory(dto: ResetInventoryDto, adminId: string) {
    // Re-authenticate the admin
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (!admin) {
      throw new ForbiddenException('Utilisateur introuvable');
    }

    const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin'];
    if (!ADMIN_ROLES.includes(admin.role.name)) {
      throw new ForbiddenException('Action réservée aux administrateurs');
    }

    const passwordValid = await bcrypt.compare(
      dto.adminPassword,
      admin.passwordHash,
    );
    if (!passwordValid) {
      throw new ForbiddenException('Mot de passe administrateur incorrect');
    }

    // confirmationText is already validated by @Equals in the DTO

    return this.prisma.$transaction(async (tx) => {
      // Snapshot before
      const products = await tx.product.findMany({
        where: { deletedAt: null },
        select: { id: true, quantity: true },
      });

      const previousTotal = products.reduce((sum, p) => sum + p.quantity, 0);
      const productsImpacted = products.filter((p) => p.quantity !== 0).length;

      // Zero out all quantities
      await tx.product.updateMany({
        where: { deletedAt: null },
        data: { quantity: 0 },
      });

      await this.auditLogs.audit({
        action: 'stock.inventory_reset',
        entity: 'Product',
        userId: adminId,
        oldValue: { totalQuantity: previousTotal },
        newValue: { totalQuantity: 0 },
        metadata: {
          adminId,
          date: new Date().toISOString(),
          previousTotal,
          newTotal: 0,
          productsImpacted,
        },
      }, tx);

      return {
        success: true,
        previousTotal,
        productsImpacted,
        message: `Remise à zéro effectuée. ${productsImpacted} produit(s) impacté(s).`,
      };
    });
  }

  async applyMovement(
    client: DbClient,
    input: {
      productId: string;
      type: StockMovementType;
      quantity: number;
      reason?: string;
      userId?: string;
    },
  ) {
    const product = await client.product.findUniqueOrThrow({
      where: { id: input.productId },
    });
    const signedQuantity = this.signedQuantity(input.type, input.quantity);
    const newQuantity = product.quantity + signedQuantity;

    if (newQuantity < 0) {
      throw new BadRequestException('Product quantity cannot become negative');
    }

    const movement = await client.stockMovement.create({
      data: {
        productId: input.productId,
        type: input.type,
        quantity: input.quantity,
        previousQuantity: product.quantity,
        newQuantity,
        reason: input.reason,
        reference: await this.references.generate(
          this.prefixForMovement(input.type),
          'stockMovement',
          client,
        ),
        userId: input.userId,
      },
    });

    await client.product.update({
      where: { id: input.productId },
      data: { quantity: newQuantity },
    });
    await this.ensureStockAlert(client, product, newQuantity);
    return movement;
  }

  private prefixForMovement(type: StockMovementType) {
    if (
      type === StockMovementType.ADJUSTMENT ||
      type === StockMovementType.INVENTORY_CORRECTION
    ) {
      return 'COR';
    }
    if (type === StockMovementType.PURCHASE_RECEPTION) {
      return 'REC';
    }
    return 'STK';
  }

  private signedQuantity(type: StockMovementType, quantity: number) {
    const negativeTypes: StockMovementType[] = [
      StockMovementType.EXIT,
      StockMovementType.SALE,
      StockMovementType.SUPPLIER_RETURN,
    ];
    return negativeTypes.includes(type) ? -quantity : quantity;
  }

  private async ensureStockAlert(
    client: DbClient,
    product: { id: string; name: string; reference: string; minStock: number },
    quantity: number,
  ) {
    if (quantity > product.minStock) {
      return;
    }

    const alertDate = new Date();
    const alertType =
      quantity === 0 ? AlertType.OUT_OF_STOCK : AlertType.LOW_STOCK;
    await client.alert.create({
      data: {
        productId: product.id,
        designation: product.name,
        reference: product.reference,
        currentStock: quantity,
        minimumStock: product.minStock,
        type: alertType,
        title:
          quantity === 0
            ? 'Produit en rupture de stock'
            : 'Stock faible détecté',
        message: [
          `Produit : ${product.name}`,
          `Référence : ${product.reference}`,
          `Stock actuel : ${quantity}`,
          `Seuil minimum : ${product.minStock}`,
          `Date de l'alerte : ${alertDate.toLocaleString('fr-FR')}`,
          '',
          `Alerte : le stock est ${quantity === 0 ? 'épuisé' : 'inférieur ou égal au seuil minimum'}.`,
        ].join('\n'),
        createdAt: alertDate,
      },
    });
  }
}
