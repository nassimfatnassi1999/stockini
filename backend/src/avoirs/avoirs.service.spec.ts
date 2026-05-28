import { BadRequestException } from '@nestjs/common';
import {
  CaisseMovementType,
  CreditNoteStatus,
  DocumentType,
  PaymentMethod,
  PaymentType,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { AvoirsService } from './avoirs.service';
import { calculateCreditNoteTotals } from '../credit-notes/utils/credit-note-calculation.util';

describe('AvoirsService', () => {
  const product = {
    id: 'product-1',
    reference: 'P-001',
    name: 'Produit test',
    tva: 19,
  };
  const saleItem = {
    id: 'sale-item-1',
    productId: product.id,
    quantity: 2,
    unitPrice: 100,
    product,
  };
  const sale = {
    id: 'sale-1',
    invoiceNumber: 'FAC-001',
    customerId: 'customer-1',
    total: 238,
    status: SaleStatus.COMPLETED,
    documentType: DocumentType.FACTURE,
    stockImpactDone: true,
    items: [saleItem],
  };

  function buildService(returnedQuantity = 0) {
    const references = {
      generateSimple: jest.fn().mockResolvedValue('AV-001'),
      generate: jest.fn().mockResolvedValue('AV-PAY-001'),
    };
    const stockService = { applyMovement: jest.fn().mockResolvedValue({}) };
    const caisseService = { recordMovement: jest.fn().mockResolvedValue({}) };

    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      sale: {
        findFirst: jest.fn().mockResolvedValue(sale),
        findUniqueOrThrow: jest.fn().mockResolvedValue(sale),
        update: jest.fn().mockResolvedValue({}),
      },
      creditNoteItem: {
        groupBy: jest.fn().mockResolvedValue(
          returnedQuantity > 0
            ? [
                {
                  saleItemId: saleItem.id,
                  _sum: { quantiteRetournee: returnedQuantity },
                },
              ]
            : [],
        ),
      },
      creditNote: {
        create: jest.fn(({ data }) =>
          Promise.resolve({ id: 'avoir-1', ...data }),
        ),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: 119 } }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'avoir-1' }),
      },
      payment: {
        create: jest.fn(({ data }) =>
          Promise.resolve({
            id: 'payment-1',
            reference: data.reference,
            ...data,
          }),
        ),
      },
      customer: { update: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      sale: { findFirst: jest.fn() },
      creditNoteItem: { groupBy: jest.fn() },
      creditNote: { findMany: jest.fn(), findUnique: jest.fn() },
    };

    const service = new AvoirsService(
      prisma as any,
      stockService as any,
      references as any,
      {} as any,
      {} as any,
      {} as any,
      caisseService as any,
    );

    return { service, tx, stockService, caisseService };
  }

  it('calculates TVA totals centrally', () => {
    expect(
      calculateCreditNoteTotals([
        { quantity: 2, unitPriceHt: 100, tvaRate: 19 },
        { quantity: 1, unitPriceHt: 50, tvaRate: 7 },
      ]),
    ).toEqual({ totalHt: 250, totalTva: 41.5, totalTtc: 291.5 });
  });

  it('creates a partial cash refund with stock restore, caisse output and partial status', async () => {
    const { service, tx, stockService, caisseService } = buildService();

    await service.create({
      saleId: sale.id,
      customerId: sale.customerId,
      refundMethod: 'CASH',
      items: [
        {
          productId: product.id,
          saleItemId: saleItem.id,
          quantiteRetournee: 1,
        },
      ],
    });

    expect(tx.creditNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 100,
          tax: 19,
          total: 119,
          montantRembourse: 119,
          statut: CreditNoteStatus.REFUNDED,
        }),
      }),
    );
    expect(stockService.applyMovement).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: StockMovementType.CUSTOMER_RETURN,
        quantity: 1,
      }),
    );
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: PaymentType.CREDIT_NOTE_REFUND,
          method: PaymentMethod.CASH,
          cashImpactDone: true,
        }),
      }),
    );
    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: CaisseMovementType.ANNULATION_VENTE,
        montant: -119,
      }),
    );
    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: sale.id },
      data: { status: SaleStatus.PARTIALLY_REFUNDED },
    });
  });

  it('creates customer credit without caisse movement', async () => {
    const { service, tx, caisseService } = buildService();

    await service.create({
      saleId: sale.id,
      customerId: sale.customerId,
      refundMethod: 'CUSTOMER_CREDIT',
      items: [
        {
          productId: product.id,
          saleItemId: saleItem.id,
          quantiteRetournee: 1,
        },
      ],
    });

    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: sale.customerId },
      data: { creditBalance: { increment: 119 } },
    });
    expect(caisseService.recordMovement).not.toHaveBeenCalled();
  });

  it('rejects excessive double return quantities before side effects', async () => {
    const { service, tx, stockService } = buildService(2);

    await expect(
      service.create({
        saleId: sale.id,
        customerId: sale.customerId,
        refundMethod: 'CASH',
        items: [
          {
            productId: product.id,
            saleItemId: saleItem.id,
            quantiteRetournee: 1,
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.creditNote.create).not.toHaveBeenCalled();
    expect(stockService.applyMovement).not.toHaveBeenCalled();
  });
});
