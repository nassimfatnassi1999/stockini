import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PaymentStatus, PaymentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { CreatePaymentDto, PayPurchaseDto, PaySaleDto, UpdatePaymentDto } from './dto/payment.dto';

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
    this.logger.log(`DELETE /payments/${id} called by ${userId ?? 'unknown'}`);
    await this.prisma.payment.delete({ where: { id } });
    this.logger.log(`Payment ${id} permanently deleted by ${userId ?? 'unknown'}`);
    return { id };
  }

  async paySale(saleId: string, dto: PaySaleDto) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirstOrThrow({
        where: { id: saleId, deletedAt: null },
      });

      const remaining = Number(sale.remainingAmount);

      if (dto.amount > remaining + 0.001) {
        throw new BadRequestException(
          `Le montant ne peut pas dépasser le reste à payer (${remaining.toFixed(3)} DT)`,
        );
      }

      const newPaidAmount = Number(sale.paidAmount) + dto.amount;
      const newRemainingAmount = Math.max(Number(sale.total) - newPaidAmount, 0);
      const newStatus = this.computePaymentStatus(Number(sale.total), newPaidAmount);

      const payment = await tx.payment.create({
        data: {
          reference: await this.references.generate('PAY', 'payment', tx),
          type: PaymentType.CUSTOMER_PAYMENT,
          method: dto.method,
          amount: dto.amount,
          saleId,
          customerId: sale.customerId ?? undefined,
          note: dto.note,
        },
        include: { sale: true, customer: true },
      });

      await tx.sale.update({
        where: { id: saleId },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          paymentStatus: newStatus,
        },
      });

      return payment;
    });
  }

  async payPurchase(purchaseId: string, dto: PayPurchaseDto) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirstOrThrow({
        where: { id: purchaseId, deletedAt: null },
      });

      const remaining = Number(purchase.remainingAmount);

      if (dto.amount > remaining + 0.001) {
        throw new BadRequestException(
          `Le montant ne peut pas dépasser le reste à payer (${remaining.toFixed(3)} DT)`,
        );
      }

      const newPaidAmount = Number(purchase.paidAmount) + dto.amount;
      const newRemainingAmount = Math.max(Number(purchase.total) - newPaidAmount, 0);
      const newStatus = this.computePaymentStatus(Number(purchase.total), newPaidAmount);

      const payment = await tx.payment.create({
        data: {
          reference: await this.references.generate('EXP', 'payment', tx),
          type: PaymentType.SUPPLIER_PAYMENT,
          method: dto.method,
          amount: dto.amount,
          purchaseId,
          supplierId: purchase.supplierId,
          note: dto.note,
        },
        include: { purchase: true, supplier: true },
      });

      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          paymentStatus: newStatus,
        },
      });

      return payment;
    });
  }

  private computePaymentStatus(total: number, paidAmount: number): PaymentStatus {
    if (paidAmount <= 0) return PaymentStatus.UNPAID;
    if (paidAmount >= total) return PaymentStatus.PAID;
    return PaymentStatus.PARTIAL;
  }
}
