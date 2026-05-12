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
  | 'product'
  | 'creditNote';

const TARGETS: Record<ReferenceTarget, { delegate: string; field: string }> = {
  sale: { delegate: 'sale', field: 'invoiceNumber' },
  purchase: { delegate: 'purchase', field: 'orderNumber' },
  stockMovement: { delegate: 'stockMovement', field: 'reference' },
  payment: { delegate: 'payment', field: 'reference' },
  customer: { delegate: 'customer', field: 'reference' },
  supplier: { delegate: 'supplier', field: 'reference' },
  product: { delegate: 'product', field: 'idProduct' },
  creditNote: { delegate: 'creditNote', field: 'numero' },
};

// Passager (INDIVIDUAL): CLI-YEAR-001 (3-digit)
// Other types:           CLI-YEAR-0001 (4-digit)
const CUSTOMER_COUNTER_KEY = (type: string) =>
  type === 'INDIVIDUAL' ? 'CLIP' : 'CLIB';
const CUSTOMER_PADDING = (type: string) => (type === 'INDIVIDUAL' ? 3 : 4);

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

  /**
   * Generate a customer reference with type-specific format:
   *   INDIVIDUAL → CLI-YEAR-001  (3-digit padding, counter key CLIP)
   *   others     → CLI-YEAR-0001 (4-digit padding, counter key CLIB)
   * Must be called inside a Prisma transaction for atomicity.
   */
  async generateForCustomer(
    type: string,
    tx: ReferenceClient = this.prisma,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const counterKey = CUSTOMER_COUNTER_KEY(type);
    const padding = CUSTOMER_PADDING(type);
    const prefixStr = `CLI-${year}-`;

    const counter = await tx.referenceCounter.upsert({
      where: { prefix_year: { prefix: counterKey, year } },
      update: { sequence: { increment: 1 } },
      create: { prefix: counterKey, year, sequence: 1 },
    });

    const lastSeq = await this.findLastCustomerSequence(tx, year, padding);
    const sequence = Math.max(counter.sequence, lastSeq + 1);

    if (sequence !== counter.sequence) {
      await tx.referenceCounter.update({
        where: { prefix_year: { prefix: counterKey, year } },
        data: { sequence },
      });
    }

    return `${prefixStr}${String(sequence).padStart(padding, '0')}`;
  }

  /**
   * Returns the next reference that would be generated for a given type,
   * without incrementing the counter. Used for form preview only.
   */
  async peekNextCustomerReference(type: string): Promise<string> {
    const year = new Date().getFullYear();
    const counterKey = CUSTOMER_COUNTER_KEY(type);
    const padding = CUSTOMER_PADDING(type);
    const prefixStr = `CLI-${year}-`;

    const [counter, lastSeq] = await Promise.all([
      this.prisma.referenceCounter.findUnique({
        where: { prefix_year: { prefix: counterKey, year } },
      }),
      this.findLastCustomerSequence(this.prisma, year, padding),
    ]);

    const nextSeq = Math.max((counter?.sequence ?? 0) + 1, lastSeq + 1);
    return `${prefixStr}${String(nextSeq).padStart(padding, '0')}`;
  }

  private async findLastCustomerSequence(
    client: ReferenceClient,
    year: number,
    padding: number,
  ): Promise<number> {
    const prefixStr = `CLI-${year}-`;
    const totalLength = prefixStr.length + padding;

    const all: Array<{ reference: string }> = await (
      client as any
    ).customer.findMany({
      where: { reference: { startsWith: prefixStr } },
      select: { reference: true },
    });

    return all
      .filter((c) => c.reference.length === totalLength)
      .reduce((max, c) => {
        const seq = Number(c.reference.slice(prefixStr.length));
        return Number.isFinite(seq) ? Math.max(max, seq) : max;
      }, 0);
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
