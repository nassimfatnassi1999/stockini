import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CaisseMovementType,
  DocumentType,
  PaymentStatus,
  PaymentType,
  Prisma,
  PurchaseDocumentType,
  SaleStatus,
  SurplusDisposition,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CaisseService } from '../caisse/caisse.service';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import { SettingsService } from '../settings/settings.service';
import {
  ClearPaymentHistoryDto,
  PaymentQueryDto,
  PayPurchaseDto,
  PaySaleDto,
} from './dto/payment.dto';
import { commercialTotalFinal } from '../common/utils/commercial-document';
import { calculatePaymentAmounts } from '../common/utils/payment-status';
import {
  getPurchasePaymentSummary,
  getSupplierDebtMap,
  serializePaymentSummary,
  syncPurchasePaymentState,
} from '../common/services/purchase-payment-state';
import { allocateCustomerPayment, tnd } from '../common/utils/customer-payment';
import { buildPaginatedResponse } from '../common/utils/pagination.util';

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
    const limit = query?.limit ?? 10;
    const skip = (page - 1) * limit;

    const andConditions: Prisma.PaymentWhereInput[] = [];

    if (query?.search) {
      andConditions.push({
        OR: [
          { reference: { contains: query.search, mode: 'insensitive' } },
          {
            sale: {
              invoiceNumber: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            customer: { name: { contains: query.search, mode: 'insensitive' } },
          },
          {
            supplier: { name: { contains: query.search, mode: 'insensitive' } },
          },
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
    const allowedSortFields: Record<
      string,
      Prisma.PaymentOrderByWithRelationInput
    > = {
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
    const orderBy: Prisma.PaymentOrderByWithRelationInput = (query?.sortBy &&
      allowedSortFields[query.sortBy]) || { createdAt: 'desc' };

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

    return buildPaginatedResponse(data, page, limit, total);
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
          sale: {
            select: {
              id: true,
              total: true,
              stampDuty: true,
              totalRefunded: true,
              isConsolidated: true,
              invoiceNumber: true,
            },
          },
          purchase: {
            select: {
              id: true,
              total: true,
              stampDuty: true,
              orderNumber: true,
            },
          },
        },
      });

      // Reverse caisse if this payment actually hit the caisse — use same account as original payment
      if (payment.cashImpactDone) {
        if (payment.type === PaymentType.CUSTOMER_PAYMENT) {
          const received = new Prisma.Decimal(
            payment.amountReceived ?? payment.amount,
          );
          const changeReturned = new Prisma.Decimal(
            payment.changeReturned ?? 0,
          );
          const retainedSurplus = new Prisma.Decimal(
            payment.retainedSurplus ?? 0,
          );
          const customerCredit = new Prisma.Decimal(
            payment.customerCreditCreated ?? 0,
          );
          const mainReceipt = retainedSurplus.gt(0)
            ? new Prisma.Decimal(payment.amountApplied ?? payment.amount)
            : received;
          await this.caisseService.recordMovement(tx, {
            type: CaisseMovementType.ANNULATION_VENTE,
            montant: mainReceipt.negated().toNumber(),
            motif: `Annulation paiement ${payment.reference}`,
            referenceDoc: payment.reference,
            userId,
            paymentMethod: payment.method,
          });
          if (changeReturned.gt(0)) {
            await this.caisseService.recordMovement(tx, {
              type: CaisseMovementType.ANNULATION_ACHAT,
              montant: changeReturned.toNumber(),
              motif: `Annulation monnaie rendue ${payment.reference}`,
              referenceDoc: `REV-CHANGE-${payment.reference}`,
              userId,
              paymentMethod: payment.method,
            });
          }
          if (retainedSurplus.gt(0)) {
            await this.caisseService.recordMovement(tx, {
              type: CaisseMovementType.ANNULATION_VENTE,
              montant: retainedSurplus.negated().toNumber(),
              motif: `Annulation surplus ${payment.reference}`,
              referenceDoc: `REV-SURPLUS-${payment.reference}`,
              userId,
              paymentMethod: payment.method,
            });
          }
          if (customerCredit.gt(0) && payment.customerId) {
            await tx.customer.update({
              where: { id: payment.customerId },
              data: { creditBalance: { decrement: customerCredit } },
            });
          }
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
          _sum: { amountApplied: true },
        });
        let historicalPaid = new Prisma.Decimal(0);
        if (payment.sale.isConsolidated) {
          const sourcePayments = await tx.payment.aggregate({
            where: {
              deletedAt: null,
              sale: {
                consolidationMemberships: {
                  some: { consolidatedSaleId: payment.saleId!, active: true },
                },
              },
            },
            _sum: { amountApplied: true },
          });
          historicalPaid = new Prisma.Decimal(
            sourcePayments._sum.amountApplied ?? 0,
          );
        }
        const newPaid = historicalPaid
          .plus(agg._sum.amountApplied ?? 0)
          .toNumber();
        const saleTotal =
          commercialTotalFinal(payment.sale.total, payment.sale.stampDuty) -
          Number(payment.sale.totalRefunded ?? 0);
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
        await syncPurchasePaymentState(tx, {
          ...payment.purchase,
          supplierId: payment.supplierId!,
        });
      }

      await this.auditLogs.audit(
        {
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
          newValue: {
            deletedAt: new Date().toISOString(),
            deletedBy: userId ?? null,
          },
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
        },
        tx,
      );

      this.logger.log(`Payment ${id} soft-deleted by ${userId ?? 'unknown'}`);
      return { id, customerId: payment.customerId };
    });

    // Recalcule verrouillage après suppression paiement (la dette peut réapparaître)
    if (result.customerId) {
      await this.customersService.recalculateClientLockStatus(
        result.customerId,
      );
    }

    return { id: result.id };
  }

  async paySale(saleId: string, dto: PaySaleDto, userId?: string) {
    const execute = () => this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const existing = await tx.payment.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { sale: true, customer: true },
        });
        if (existing) {
          if (existing.saleId !== saleId) {
            throw new BadRequestException(
              'Cette clé d’idempotence appartient à un autre document',
            );
          }
          return existing;
        }
      }
      // CREDIT cannot be used as a later payment method — no treasury event.
      if (dto.method === 'CREDIT') {
        throw new BadRequestException(
          'Le mode CREDIT ne peut pas être utilisé pour un paiement ultérieur. Utilisez CASH, CHEQUE, BANK_TRANSFER ou CARD.',
        );
      }

      const sale = await tx.sale.findFirstOrThrow({
        where: { id: saleId, deletedAt: null },
        include: {
          consolidationMemberships: {
            where: { active: true },
            select: { consolidatedSale: { select: { invoiceNumber: true } } },
          },
        },
      });

      if ((sale.consolidationMemberships ?? []).length) {
        throw new BadRequestException(
          `Ce document est inclus dans ${sale.consolidationMemberships[0].consolidatedSale.invoiceNumber}. Le paiement doit être enregistré sur le regroupement.`,
        );
      }

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

      const saleTotalFinal = commercialTotalFinal(sale.total, sale.stampDuty);
      const netAfterCredits = tnd(
        Prisma.Decimal.max(
          new Prisma.Decimal(saleTotalFinal).minus(sale.totalRefunded ?? 0),
          0,
        ),
      );
      // Recalculate from active applied payments: cached paid/remaining values may
      // contain legacy overpayments.
      const activePayments =
        typeof tx.payment.aggregate === 'function'
          ? await tx.payment.aggregate({
              where: {
                saleId,
                deletedAt: null,
                type: PaymentType.CUSTOMER_PAYMENT,
              },
              _sum: { amountApplied: true, amount: true },
            })
          : { _sum: { amountApplied: sale.paidAmount, amount: sale.paidAmount } };
      const appliedBefore = tnd(
        activePayments._sum.amountApplied ??
          activePayments._sum.amount ??
          sale.paidAmount,
      );
      const remainingBefore = tnd(
        Prisma.Decimal.max(netAfterCredits.minus(appliedBefore), 0),
      );
      const allocation = allocateCustomerPayment({
        remainingBefore,
        amountReceived: dto.amountReceived ?? dto.amount ?? 0,
        method: dto.method,
        surplusDisposition: dto.surplusDisposition,
        hasCustomer: Boolean(sale.customerId),
      });
      const newPaidAmount = tnd(appliedBefore.plus(allocation.amountApplied));

      const payRef = await this.references.generate('PAY', 'payment', tx);
      const payment = await tx.payment.create({
        data: {
          reference: payRef,
          type: PaymentType.CUSTOMER_PAYMENT,
          method: dto.method,
          amount: allocation.amountApplied.toNumber(),
          amountReceived: allocation.amountReceived.toNumber(),
          amountApplied: allocation.amountApplied.toNumber(),
          changeDue: allocation.changeDue.toNumber(),
          changeReturned: allocation.changeReturned.toNumber(),
          retainedSurplus: allocation.retainedSurplus.toNumber(),
          customerCreditCreated: allocation.customerCreditCreated.toNumber(),
          remainingBefore: allocation.remainingBefore.toNumber(),
          remainingAfter: allocation.remainingAfter.toNumber(),
          surplusDisposition: allocation.surplusDisposition,
          idempotencyKey: dto.idempotencyKey,
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
          paidAmount: newPaidAmount.toNumber(),
          remainingAmount: allocation.remainingAfter.toNumber(),
          paymentStatus: allocation.paymentStatus,
        },
      });

      const isReturned =
        allocation.surplusDisposition === SurplusDisposition.RETURNED;
      const isCashSurplus =
        allocation.surplusDisposition === SurplusDisposition.CASH_SURPLUS;
      await this.caisseService.recordMovement(tx, {
        type: CaisseMovementType.ENCAISSEMENT_VENTE,
        montant: isReturned
          ? allocation.amountReceived.toNumber()
          : isCashSurplus
            ? allocation.amountApplied.toNumber()
            : allocation.amountReceived.toNumber(),
        motif: `Encaissement vente ${payment.sale?.invoiceNumber ?? saleId}`,
        referenceDoc: payRef,
        userId,
        paymentMethod: dto.method as string,
      });
      if (allocation.changeReturned.gt(0)) {
        await this.caisseService.recordMovement(tx, {
          type: CaisseMovementType.CUSTOMER_CHANGE_OUT,
          montant: allocation.changeReturned.negated().toNumber(),
          motif: `Monnaie rendue pour ${payment.sale?.invoiceNumber ?? saleId}`,
          referenceDoc: `CHANGE-${payRef}`,
          userId,
          paymentMethod: dto.method,
        });
      }
      if (allocation.retainedSurplus.gt(0)) {
        await this.caisseService.recordMovement(tx, {
          type: CaisseMovementType.CASH_SURPLUS_IN,
          montant: allocation.retainedSurplus.toNumber(),
          motif: `Surplus non rendu pour ${payment.sale?.invoiceNumber ?? saleId}`,
          referenceDoc: `SURPLUS-${payRef}`,
          userId,
          paymentMethod: dto.method,
        });
      }
      if (allocation.customerCreditCreated.gt(0) && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: {
            creditBalance: {
              increment: allocation.customerCreditCreated,
            },
          },
        });
      }

      await this.auditLogs.audit(
        {
          action: 'payment.sale_payment',
          entity: 'Payment',
          entityId: payment.id,
          userId,
          newValue: {
            id: payment.id,
            reference: payRef,
            amountReceived: allocation.amountReceived.toNumber(),
            amountApplied: allocation.amountApplied.toNumber(),
            changeReturned: allocation.changeReturned.toNumber(),
            retainedSurplus: allocation.retainedSurplus.toNumber(),
            customerCreditCreated: allocation.customerCreditCreated.toNumber(),
            method: dto.method,
            type: PaymentType.CUSTOMER_PAYMENT,
          },
          metadata: {
            paymentId: payment.id,
            reference: payRef,
            amountReceived: allocation.amountReceived.toNumber(),
            amountApplied: allocation.amountApplied.toNumber(),
            surplusDisposition: allocation.surplusDisposition,
            method: dto.method,
            saleId,
            invoiceNumber: payment.sale?.invoiceNumber ?? null,
            customerId: payment.customerId ?? null,
          },
        },
        tx,
      );

      return payment;
    });
    const result = await execute().catch(async (error: unknown) => {
      const isDuplicateIdempotencyKey =
        dto.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      if (!isDuplicateIdempotencyKey) throw error;
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { sale: true, customer: true },
      });
      if (!existing || existing.saleId !== saleId) throw error;
      return existing;
    });

    // Recalcule verrouillage après paiement (la dette peut être soldée)
    if (result.customerId) {
      await this.customersService.recalculateClientLockStatus(
        result.customerId,
      );
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

      // Ne jamais faire confiance au cache paidAmount/remainingAmount : il peut
      // être ancien. Les paiements actifs liés sont recalculés sous transaction.
      const beforePayment = await getPurchasePaymentSummary(tx, purchase);
      const remaining = beforePayment.remainingAmount;
      const requestedAmount = new Prisma.Decimal(dto.amount).toDecimalPlaces(
        3,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      if (requestedAmount.lte(0)) {
        throw new BadRequestException(
          'Le montant doit être au minimum de 0,001 DT',
        );
      }

      if (requestedAmount.gt(remaining)) {
        throw new BadRequestException(
          `Le montant ne peut pas dépasser le reste à payer (${remaining.toFixed(3)} DT)`,
        );
      }

      const payRef = await this.references.generate('EXP', 'payment', tx);
      const payment = await tx.payment.create({
        data: {
          reference: payRef,
          type: PaymentType.SUPPLIER_PAYMENT,
          method: dto.method,
          amount: requestedAmount,
          cashImpactDone: true,
          purchaseId,
          supplierId: purchase.supplierId,
          note: dto.note,
        },
        include: { purchase: { include: { supplier: true } }, supplier: true },
      });

      const summary = await syncPurchasePaymentState(tx, purchase);

      await this.caisseService.recordMovement(tx, {
        type: CaisseMovementType.DECAISSEMENT_ACHAT,
        montant: -requestedAmount.toNumber(),
        motif: `Paiement fournisseur ${payment.purchase?.supplier?.name ?? purchaseId}`,
        referenceDoc: payRef,
        userId,
        paymentMethod: dto.method as string,
      });

      await this.auditLogs.audit(
        {
          action: 'payment.purchase_payment',
          entity: 'Payment',
          entityId: payment.id,
          userId,
          newValue: {
            id: payment.id,
            reference: payRef,
            amount: requestedAmount.toNumber(),
            method: dto.method,
            type: PaymentType.SUPPLIER_PAYMENT,
          },
          metadata: {
            paymentId: payment.id,
            reference: payRef,
            amount: requestedAmount.toNumber(),
            method: dto.method,
            purchaseId,
            orderNumber: payment.purchase?.orderNumber ?? null,
            supplierId: purchase.supplierId,
            supplierName: payment.purchase?.supplier?.name ?? null,
            ...serializePaymentSummary(summary),
          },
        },
        tx,
      );

      const supplierDebts = await getSupplierDebtMap(tx, [purchase.supplierId]);
      return {
        ...payment,
        ...serializePaymentSummary(summary),
        supplierDebt: (
          supplierDebts.get(purchase.supplierId) ?? new Prisma.Decimal(0)
        ).toFixed(3),
      };
    });
  }

  async clearCustomerPaymentsHistory(
    dto: ClearPaymentHistoryDto,
    userId: string,
  ) {
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
        filtersJson: {
          dateFrom: dto.dateFrom,
          dateTo: dto.dateTo,
          customerId: dto.customerId,
        } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Customer payment history cleared by ${userId}: ${count} records`,
    );
    return { count };
  }

  async clearSupplierPaymentsHistory(
    dto: ClearPaymentHistoryDto,
    userId: string,
  ) {
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
        filtersJson: {
          dateFrom: dto.dateFrom,
          dateTo: dto.dateTo,
          supplierId: dto.supplierId,
        } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Supplier payment history cleared by ${userId}: ${count} records`,
    );
    return { count };
  }

  private computePaymentStatus(
    total: number,
    paidAmount: number,
  ): PaymentStatus {
    return calculatePaymentAmounts(total, paidAmount).paymentStatus;
  }
}
