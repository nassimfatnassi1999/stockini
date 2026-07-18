import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CaisseMovementType,
  DocumentType,
  PaymentStatus,
  PaymentType,
  Prisma,
  PurchaseDocumentType,
  SaleStatus,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CaisseService } from '../caisse/caisse.service';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import { ClearPaymentHistoryDto, PaymentQueryDto, PayPurchaseDto, PaySaleDto } from './dto/payment.dto';
import { commercialTotalFinal } from '../common/utils/commercial-document';
import { calculatePaymentAmounts } from '../common/utils/payment-status';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
    private readonly settings: SettingsService,
    private readonly caisseService: CaisseService,
    private readonly customersService: CustomersService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(query?: PaymentQueryDto) {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(100, Math.max(1, query?.limit ?? 20));
    const skip = (page - 1) * limit;

    const andConditions: Prisma.PaymentWhereInput[] = [];

    if (query?.search) {
      andConditions.push({
        OR: [
          { reference: { contains: query.search, mode: 'insensitive' } },
          { sale: { invoiceNumber: { contains: query.search, mode: 'insensitive' } } },
          { customer: { name: { contains: query.search, mode: 'insensitive' } } },
          { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      clearedAt: null,
      ...(query?.type && { type: query.type }),
      ...(query?.method && { method: query.method }),
      ...(query?.customerId && { customerId: query.customerId }),
      ...(query?.supplierId && { supplierId: query.supplierId }),
      ...((query?.dateFrom || query?.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
      ...(andConditions.length > 0 && { AND: andConditions }),
    };

    const sortOrder = query?.sortOrder ?? 'desc';
    const allowedSortFields: Record<string, Prisma.PaymentOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder },
      date: { createdAt: sortOrder },
      totalTtc: { sale: { total: sortOrder } },
      amount: { amount: sortOrder },
      paidAmount: { sale: { paidAmount: sortOrder } },
      remainingAmount: { sale: { remainingAmount: sortOrder } },
      clientName: { customer: { name: sortOrder } },
      customer: { customer: { name: sortOrder } },
      reference: { reference: sortOrder },
      status: { sale: { paymentStatus: sortOrder } },
    };
    const orderBy: Prisma.PaymentOrderByWithRelationInput =
      (query?.sortBy && allowedSortFields[query.sortBy]) || { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: { sale: true, purchase: true, customer: true, supplier: true },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findOne(id: string) {
    return this.prisma.payment.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: { sale: true, purchase: true, customer: true, supplier: true },
    });
  }

  async remove(id: string, userId?: string) {
    this.logger.log(`DELETE /payments/${id} called by ${userId ?? 'unknown'}`);
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirstOrThrow({
        where: { id, deletedAt: null },
        include: {
          sale: { select: { id: true, total: true, stampDuty: true, invoiceNumber: true } },
          purchase: { select: { id: true, total: true, stampDuty: true, orderNumber: true } },
        },
      });

      // Reverse caisse if this payment actually hit the caisse — use same account as original payment
      if (payment.cashImpactDone) {
        if (payment.type === PaymentType.CUSTOMER_PAYMENT) {
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_VENTE,
            montant: -Number(payment.amount),
            motif: `Annulation paiement ${payment.reference}`,
            referenceDoc: payment.reference,
            userId,
            paymentMethod: payment.method,
          });
        } else if (payment.type === PaymentType.SUPPLIER_PAYMENT) {
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_ACHAT,
            montant: Number(payment.amount),
            motif: `Annulation paiement ${payment.reference}`,
            referenceDoc: payment.reference,
            userId,
            paymentMethod: payment.method,
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
        const saleTotal = commercialTotalFinal(payment.sale.total, payment.sale.stampDuty);
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
        const purchaseTotal = commercialTotalFinal(payment.purchase.total, payment.purchase.stampDuty);
        await tx.purchase.update({
          where: { id: payment.purchaseId },
          data: {
            paidAmount: newPaid,
            remainingAmount: Math.max(purchaseTotal - newPaid, 0),
            paymentStatus: this.computePaymentStatus(purchaseTotal, newPaid),
          },
        });
      }

      await this.auditLogs.audit({
        action: 'payment.deleted',
        entity: 'Payment',
        entityId: payment.id,
        userId,
        oldValue: {
          id: payment.id,
          reference: payment.reference,
          amount: Number(payment.amount),
          method: payment.method,
          type: payment.type,
          deletedAt: null,
        },
        newValue: { deletedAt: new Date().toISOString(), deletedBy: userId ?? null },
        metadata: {
          paymentId: payment.id,
          reference: payment.reference,
          amount: Number(payment.amount),
          method: payment.method,
          type: payment.type,
          saleId: payment.saleId ?? null,
          invoiceNumber: payment.sale?.invoiceNumber ?? null,
          purchaseId: payment.purchaseId ?? null,
          orderNumber: payment.purchase?.orderNumber ?? null,
        },
      }, tx);

      this.logger.log(`Payment ${id} soft-deleted by ${userId ?? 'unknown'}`);
      return { id, customerId: payment.customerId };
    });

    // Recalcule verrouillage après suppression paiement (la dette peut réapparaître)
    if (result.customerId) {
      await this.customersService.recalculateClientLockStatus(result.customerId);
    }

    return { id: result.id };
  }

  async paySale(saleId: string, dto: PaySaleDto, userId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // CREDIT cannot be used as a later payment method — no treasury event.
      if (dto.method === 'CREDIT') {
        throw new BadRequestException(
          'Le mode CREDIT ne peut pas être utilisé pour un paiement ultérieur. Utilisez CASH, CHEQUE, BANK_TRANSFER ou CARD.',
        );
      }

      const sale = await tx.sale.findFirstOrThrow({
        where: { id: saleId, deletedAt: null },
      });

      if (
        sale.documentType === DocumentType.DEVIS ||
        sale.documentType === DocumentType.BON_COMMANDE ||
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
      const saleTotalFinal = commercialTotalFinal(sale.total, sale.stampDuty);
      const newRemainingAmount = Math.max(
        saleTotalFinal - newPaidAmount,
        0,
      );
      const newStatus = this.computePaymentStatus(
        saleTotalFinal,
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
        paymentMethod: dto.method as string,
      });

      await this.auditLogs.audit({
        action: 'payment.sale_payment',
        entity: 'Payment',
        entityId: payment.id,
        userId,
        newValue: {
          id: payment.id,
          reference: payRef,
          amount: dto.amount,
          method: dto.method,
          type: PaymentType.CUSTOMER_PAYMENT,
        },
        metadata: {
          paymentId: payment.id,
          reference: payRef,
          amount: dto.amount,
          method: dto.method,
          saleId,
          invoiceNumber: payment.sale?.invoiceNumber ?? null,
          customerId: payment.customerId ?? null,
        },
      }, tx);

      return payment;
    });

    // Recalcule verrouillage après paiement (la dette peut être soldée)
    if (result.customerId) {
      await this.customersService.recalculateClientLockStatus(result.customerId);
    }

    return result;
  }

  async payPurchase(purchaseId: string, dto: PayPurchaseDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      // CREDIT cannot be used for supplier payments — no treasury event.
      if (dto.method === 'CREDIT') {
        throw new BadRequestException(
          'Le mode CREDIT ne peut pas être utilisé pour un paiement fournisseur. Utilisez CASH, CHEQUE, BANK_TRANSFER ou CARD.',
        );
      }

      const purchase = await tx.purchase.findFirstOrThrow({
        where: { id: purchaseId, deletedAt: null },
      });

      if (purchase.documentType === PurchaseDocumentType.BON_COMMANDE) {
        throw new BadRequestException(
          'Un bon de commande ne peut pas être payé. Transformez-le en bon de réception ou facture fournisseur.',
        );
      }

      const remaining = Number(purchase.remainingAmount);

      if (dto.amount > remaining + 0.001) {
        throw new BadRequestException(
          `Le montant ne peut pas dépasser le reste à payer (${remaining.toFixed(3)} DT)`,
        );
      }

      const newPaidAmount = Number(purchase.paidAmount) + dto.amount;
      const purchaseTotalFinal = commercialTotalFinal(purchase.total, purchase.stampDuty);
      const newRemainingAmount = Math.max(
        purchaseTotalFinal - newPaidAmount,
        0,
      );
      const newStatus = this.computePaymentStatus(
        purchaseTotalFinal,
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
        paymentMethod: dto.method as string,
      });

      await this.auditLogs.audit({
        action: 'payment.purchase_payment',
        entity: 'Payment',
        entityId: payment.id,
        userId,
        newValue: {
          id: payment.id,
          reference: payRef,
          amount: dto.amount,
          method: dto.method,
          type: PaymentType.SUPPLIER_PAYMENT,
        },
        metadata: {
          paymentId: payment.id,
          reference: payRef,
          amount: dto.amount,
          method: dto.method,
          purchaseId,
          orderNumber: payment.purchase?.orderNumber ?? null,
          supplierId: purchase.supplierId,
          supplierName: payment.purchase?.supplier?.name ?? null,
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          paymentStatus: newStatus,
        },
      }, tx);

      return payment;
    });
  }

  async clearCustomerPaymentsHistory(dto: ClearPaymentHistoryDto, userId: string) {
    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      clearedAt: null,
      type: PaymentType.CUSTOMER_PAYMENT,
      ...((dto.dateFrom || dto.dateTo) && {
        createdAt: {
          ...(dto.dateFrom && { gte: new Date(dto.dateFrom) }),
          ...(dto.dateTo && { lte: new Date(dto.dateTo) }),
        },
      }),
      ...(dto.customerId && { customerId: dto.customerId }),
    };

    const count = await this.prisma.payment.count({ where });
    if (count > 0) {
      await this.prisma.payment.updateMany({
        where,
        data: { clearedAt: new Date(), clearedBy: userId },
      });
    }

    await this.prisma.historyClearLog.create({
      data: {
        module: 'customer_payments',
        userId,
        count,
        filtersJson: { dateFrom: dto.dateFrom, dateTo: dto.dateTo, customerId: dto.customerId } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Customer payment history cleared by ${userId}: ${count} records`);
    return { count };
  }

  async clearSupplierPaymentsHistory(dto: ClearPaymentHistoryDto, userId: string) {
    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      clearedAt: null,
      type: PaymentType.SUPPLIER_PAYMENT,
      ...((dto.dateFrom || dto.dateTo) && {
        createdAt: {
          ...(dto.dateFrom && { gte: new Date(dto.dateFrom) }),
          ...(dto.dateTo && { lte: new Date(dto.dateTo) }),
        },
      }),
      ...(dto.supplierId && { supplierId: dto.supplierId }),
    };

    const count = await this.prisma.payment.count({ where });
    if (count > 0) {
      await this.prisma.payment.updateMany({
        where,
        data: { clearedAt: new Date(), clearedBy: userId },
      });
    }

    await this.prisma.historyClearLog.create({
      data: {
        module: 'supplier_payments',
        userId,
        count,
        filtersJson: { dateFrom: dto.dateFrom, dateTo: dto.dateTo, supplierId: dto.supplierId } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Supplier payment history cleared by ${userId}: ${count} records`);
    return { count };
  }

  private computePaymentStatus(
    total: number,
    paidAmount: number,
  ): PaymentStatus {
    return calculatePaymentAmounts(total, paidAmount).paymentStatus;
  }
}
