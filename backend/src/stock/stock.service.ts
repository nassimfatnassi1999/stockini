import { BadRequestException, Injectable } from '@nestjs/common';
import { AlertType, Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockAdjustmentDto, StockChangeDto } from './dto/stock.dto';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  entry(dto: StockChangeDto, userId?: string) {
    return this.prisma.$transaction((tx) =>
      this.applyMovement(tx, {
        productId: dto.productId,
        type: StockMovementType.ENTRY,
        quantity: dto.quantity,
        reason: dto.reason,
        reference: dto.reference,
        userId,
      }),
    );
  }

  exit(dto: StockChangeDto, userId?: string) {
    return this.prisma.$transaction((tx) =>
      this.applyMovement(tx, {
        productId: dto.productId,
        type: StockMovementType.EXIT,
        quantity: dto.quantity,
        reason: dto.reason,
        reference: dto.reference,
        userId,
      }),
    );
  }

  adjustment(dto: StockAdjustmentDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({ where: { id: dto.productId } });
      const delta = dto.newQuantity - product.quantity;
      const movement = await tx.stockMovement.create({
        data: {
          productId: dto.productId,
          type: StockMovementType.ADJUSTMENT,
          quantity: Math.abs(delta),
          previousQuantity: product.quantity,
          newQuantity: dto.newQuantity,
          reason: dto.reason,
          reference: dto.reference,
          userId,
        },
      });
      await tx.product.update({ where: { id: dto.productId }, data: { quantity: dto.newQuantity } });
      await this.ensureStockAlert(tx, dto.productId, dto.newQuantity, product.minStock);
      return movement;
    });
  }

  history(productId?: string) {
    return this.prisma.stockMovement.findMany({
      where: productId ? { productId } : undefined,
      include: { product: true, user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async applyMovement(
    client: DbClient,
    input: {
      productId: string;
      type: StockMovementType;
      quantity: number;
      reason?: string;
      reference?: string;
      userId?: string;
    },
  ) {
    const product = await client.product.findUniqueOrThrow({ where: { id: input.productId } });
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
        reference: input.reference,
        userId: input.userId,
      },
    });

    await client.product.update({
      where: { id: input.productId },
      data: { quantity: newQuantity },
    });
    await this.ensureStockAlert(client, input.productId, newQuantity, product.minStock);
    return movement;
  }

  private signedQuantity(type: StockMovementType, quantity: number) {
    const negativeTypes: StockMovementType[] = [
      StockMovementType.EXIT,
      StockMovementType.SALE,
      StockMovementType.SUPPLIER_RETURN,
    ];
    return negativeTypes.includes(type) ? -quantity : quantity;
  }

  private async ensureStockAlert(client: DbClient, productId: string, quantity: number, minStock: number) {
    if (quantity > minStock) {
      return;
    }

    await client.alert.create({
      data: {
        productId,
        type: quantity === 0 ? AlertType.OUT_OF_STOCK : AlertType.LOW_STOCK,
        title: quantity === 0 ? 'Produit en rupture' : 'Stock faible',
        message: `Le stock du produit est ${quantity}, seuil minimum ${minStock}.`,
      },
    });
  }
}
