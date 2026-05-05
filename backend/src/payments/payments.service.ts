import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { CreatePaymentDto, UpdatePaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
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
      include: { sale: true, purchase: true, customer: true, supplier: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.payment.findUniqueOrThrow({
      where: { id },
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

  remove(id: string) {
    return this.prisma.payment.delete({ where: { id } });
  }
}
