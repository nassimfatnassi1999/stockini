import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CaisseMovementType,
  DocumentType,
  PaymentStatus,
  PaymentType,
  SaleStatus,
} from '@prisma/client';
import { CaisseService } from '../caisse/caisse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { PayPurchaseDto, PaySaleDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
    private readonly settings: SettingsService,
    private readonly caisseService: CaisseService,
  ) {}

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

  async remove(id: string, userId?: string) {
    this.logger.log(`DELETE /payments/${id} called by ${userId ?? 'unknown'}`);
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirstOrThrow({
        where: { id, deletedAt: null },
        include: {
          sale: { select: { id: true, total: true, invoiceNumber: true } },
          purchase: { select: { id: true, total: true, orderNumber: true } },
        },
      });

      // Reverse caisse if this payment actually hit the caisse
      if (payment.cashImpactDone) {
        if (payment.type === PaymentType.CUSTOMER_PAYMENT) {
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_VENTE,
            montant: -Number(payment.amount),
            motif: `Annulation paiement ${payment.reference}`,
            referenceDoc: payment.reference,
            userId,
          });
        } else if (payment.type === PaymentType.SUPPLIER_PAYMENT) {
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_ACHAT,
            montant: Number(payment.amount),
            motif: `Annulation paiement ${payment.reference}`,
            referenceDoc: payment.reference,
            userId,
          });
        }
      }

      // Soft delete
      await tx.payment.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: userId },
      });

      // Recalculate sale totals
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

      // Recalculate purchase totals
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

      this.logger.log(`Payment ${id} soft-deleted by ${userId ?? 'unknown'}`);
      return { id };
    });
  }

  async paySale(saleId: string, dto: PaySaleDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirstOrThrow({
        where: { id: saleId, deletedAt: null },
      });

      if (
        sale.documentType === DocumentType.DEVIS ||
        sale.documentType === DocumentType.AVOIR
      ) {
        throw new BadRequestException(
          `Le type ${sale.documentType} n'accepte pas de paiement`,
        );
      }
      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Impossible de payer un document annulé');
      }

      const remaining = Number(sale.remainingAmount);

      if (dto.amount > remaining + 0.001) {
        throw new BadRequestException(
          `Le montant ne peut pas dépasser le reste à payer (${remaining.toFixed(3)} DT)`,
        );
      }

      const newPaidAmount = Number(sale.paidAmount) + dto.amount;
      const newRemainingAmount = Math.max(
        Number(sale.total) - newPaidAmount,
        0,
      );
      const newStatus = this.computePaymentStatus(
        Number(sale.total),
        newPaidAmount,
      );

      const payRef = await this.references.generate('PAY', 'payment', tx);
      const payment = await tx.payment.create({
        data: {
          reference: payRef,
          type: PaymentType.CUSTOMER_PAYMENT,
          method: dto.method,
          amount: dto.amount,
          cashImpactDone: true,
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

      await this.caisseService.recordMovement(tx, {
        type: CaisseMovementType.ENCAISSEMENT_VENTE,
        montant: dto.amount,
        motif: `Encaissement vente ${payment.sale?.invoiceNumber ?? saleId}`,
        referenceDoc: payRef,
        userId,
      });

      return payment;
    });
  }

  async payPurchase(purchaseId: string, dto: PayPurchaseDto, userId?: string) {
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
      const newRemainingAmount = Math.max(
        Number(purchase.total) - newPaidAmount,
        0,
      );
      const newStatus = this.computePaymentStatus(
        Number(purchase.total),
        newPaidAmount,
      );

      const payRef = await this.references.generate('EXP', 'payment', tx);
      const payment = await tx.payment.create({
        data: {
          reference: payRef,
          type: PaymentType.SUPPLIER_PAYMENT,
          method: dto.method,
          amount: dto.amount,
          cashImpactDone: true,
          purchaseId,
          supplierId: purchase.supplierId,
          note: dto.note,
        },
        include: { purchase: { include: { supplier: true } }, supplier: true },
      });

      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          paymentStatus: newStatus,
        },
      });

      await this.caisseService.recordMovement(tx, {
        type: CaisseMovementType.DECAISSEMENT_ACHAT,
        montant: -dto.amount,
        motif: `Paiement fournisseur ${payment.purchase?.supplier?.name ?? purchaseId}`,
        referenceDoc: payRef,
        userId,
      });

      return payment;
    });
  }

  private computePaymentStatus(
    total: number,
    paidAmount: number,
  ): PaymentStatus {
    if (paidAmount <= 0) return PaymentStatus.UNPAID;
    if (paidAmount >= total) return PaymentStatus.PAID;
    return PaymentStatus.PARTIAL;
  }
}
