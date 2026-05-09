import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { CreatePaymentDto, UpdatePaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
    private readonly settings: SettingsService,
  ) {}

  async create(dto: CreatePaymentDto) {
    await this.settings.assertActiveOption('payment_types', dto.type);
    await this.settings.assertActiveOption('payment_methods', dto.method);
    return this.prisma.$transaction(async (tx) =>
      tx.payment.create({
        data: {
          ...dto,
          reference: await this.references.generate('PAY', 'payment', tx),
        },
      }),
    );
  }

  findAll() {
    return this.prisma.payment.findMany({
      where: { deletedAt: null },
      include: { sale: true, purchase: true, customer: true, supplier: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.payment.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: { sale: true, purchase: true, customer: true, supplier: true },
    });
  }

  async update(id: string, dto: UpdatePaymentDto) {
    await this.settings.assertActiveOption('payment_types', dto.type);
    await this.settings.assertActiveOption('payment_methods', dto.method);
    return this.prisma.payment.update({
      where: { id },
      data: dto,
      include: { sale: true, purchase: true, customer: true, supplier: true },
    });
  }

  async remove(id: string, userId?: string) {
    this.logger.log(`DELETE /payments/${id} soft-delete called by ${userId ?? 'unknown'}`);
    const payment = await this.prisma.payment.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId ?? null },
    });
    this.logger.log(
      `Payment ${payment.id} soft-deleted at ${payment.deletedAt?.toISOString() ?? 'null'}`,
    );
    return payment;
  }
}
