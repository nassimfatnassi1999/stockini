import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ReferenceClient = PrismaService | Prisma.TransactionClient;

type ReferenceTarget =
  | 'sale'
  | 'purchase'
  | 'stockMovement'
  | 'payment'
  | 'customer'
  | 'supplier'
  | 'product';

const TARGETS: Record<ReferenceTarget, { delegate: string; field: string }> = {
  sale: { delegate: 'sale', field: 'invoiceNumber' },
  purchase: { delegate: 'purchase', field: 'orderNumber' },
  stockMovement: { delegate: 'stockMovement', field: 'reference' },
  payment: { delegate: 'payment', field: 'reference' },
  customer: { delegate: 'customer', field: 'reference' },
  supplier: { delegate: 'supplier', field: 'reference' },
  product: { delegate: 'product', field: 'reference' },
};

@Injectable()
export class ReferenceGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(
    prefix: string,
    target: ReferenceTarget,
    client: ReferenceClient = this.prisma,
  ) {
    const year = new Date().getFullYear();
    const counter = await client.referenceCounter.upsert({
      where: { prefix_year: { prefix, year } },
      update: { sequence: { increment: 1 } },
      create: { prefix, year, sequence: 1 },
    });

    const lastExistingSequence = await this.findLastExistingSequence(
      client,
      prefix,
      year,
      target,
    );
    const sequence = Math.max(counter.sequence, lastExistingSequence + 1);

    if (sequence !== counter.sequence) {
      await client.referenceCounter.update({
        where: { prefix_year: { prefix, year } },
        data: { sequence },
      });
    }

    return this.format(prefix, year, sequence);
  }

  private async findLastExistingSequence(
    client: ReferenceClient,
    prefix: string,
    year: number,
    target: ReferenceTarget,
  ) {
    const config = TARGETS[target];
    const referencePrefix = `${prefix}-${year}-`;
    const delegate = (client as any)[config.delegate];
    const latest = await delegate.findFirst({
      where: { [config.field]: { startsWith: referencePrefix } },
      orderBy: { [config.field]: 'desc' },
      select: { [config.field]: true },
    });
    const value = latest?.[config.field];
    if (!value || typeof value !== 'string') {
      return 0;
    }
    const sequence = Number(value.split('-')[2]);
    return Number.isFinite(sequence) ? sequence : 0;
  }

  private format(prefix: string, year: number, sequence: number) {
    return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
  }
}
