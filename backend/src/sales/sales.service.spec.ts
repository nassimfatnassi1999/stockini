import { BadRequestException } from '@nestjs/common';
import {
  CaisseMovementType,
  DocumentType,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { SalesService } from './sales.service';

describe('SalesService document references', () => {
  const product = {
    id: 'product-1',
    name: 'Produit test',
    quantity: 50,
    purchasePrice: 100,
    salePrice: 140, // HT = purchaseHT × 1.4
    tva: 19,
  };

  // unitPrice = purchaseHT × 1.4 = 140 (auto-calculé, aucune permission requise)
  const AUTO_UNIT_PRICE = 140;
  // TTC = netHt × (1 + TVA%) = 140 × 1.19 = 166.6
  const AUTO_NET_HT = 140;
  const AUTO_TAX = 26.6;
  const AUTO_TOTAL_TTC = 166.6;

  function buildService() {
    const references = {
      peekNextSimpleReference: jest.fn((prefix: string) =>
        Promise.resolve(`${prefix}-001`),
      ),
      generateSimple: jest.fn((prefix: string) =>
        Promise.resolve(`${prefix}-001`),
      ),
      generate: jest.fn((prefix: string) => Promise.resolve(`${prefix}-001`)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      product: {
        findMany: jest.fn().mockResolvedValue([product]),
        update: jest.fn().mockResolvedValue(product),
      },
      sale: {
        create: jest.fn(({ data }: { data: any }) =>
          Promise.resolve({
            id: 'sale-1',
            ...data,
            items: data.items.create.map((item: any, index: number) => ({
              id: `sale-item-${index + 1}`,
              saleId: 'sale-1',
              ...item,
            })),
            customer: null,
            seller: null,
            payments: [],
          }),
        ),
        update: jest.fn(({ data }: { data: any }) =>
          Promise.resolve({
            id: 'sale-1',
            ...tx.sale.create.mock.calls[0][0].data,
            ...data,
            items: tx.sale.create.mock.calls[0][0].data.items.create,
            payments: [],
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
        findFirstOrThrow: jest.fn(),
      },
      payment: {
        create: jest.fn(({ data }: { data: any }) =>
          Promise.resolve({ id: 'payment-1', ...data }),
        ),
      },
      saleItem: {
        findMany: jest.fn((args: any) => {
          if (args?.select?.saleId)
            return Promise.resolve([{ saleId: 'sale-1' }]);
          return Promise.resolve([
            {
              id: 'sale-item-1',
              saleId: 'sale-1',
              productId: product.id,
              quantity: 1,
              unitPrice: AUTO_UNIT_PRICE,
              discountPercent: 0,
              product,
              sale: {
                id: 'sale-1',
                invoiceNumber:
                  tx.sale.create.mock.calls[0][0].data.invoiceNumber,
                documentType: tx.sale.create.mock.calls[0][0].data.documentType,
                customerId: 'customer-1',
                discount: 0,
                updatedAt: new Date('2026-05-14T00:00:00.000Z'),
              },
            },
          ]);
        }),
      },
      productPriceHistory: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    tx.sale.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({
        id: where.id,
        invoiceNumber: tx.sale.create.mock.calls[0][0].data.invoiceNumber,
        documentType: tx.sale.create.mock.calls[0][0].data.documentType,
        paymentStatus: tx.sale.create.mock.calls[0][0].data.paymentStatus,
        status: tx.sale.create.mock.calls[0][0].data.status,
        items: [],
        customer: null,
        seller: null,
        payments: [],
      }),
    );

    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };

    const service = new SalesService(
      prisma as any,
      { applyMovement: jest.fn().mockResolvedValue({}) } as any,
      references as any,
      { assertActiveOption: jest.fn() } as any,
      { recordMovement: jest.fn().mockResolvedValue({}) } as any,
      { assertClientNotLocked: jest.fn().mockResolvedValue(undefined), recalculateClientLockStatus: jest.fn().mockResolvedValue(undefined) } as any,
      { audit: jest.fn().mockResolvedValue(undefined) } as any,
    );

    return {
      service,
      references,
      tx,
      stockService: (service as any).stockService,
      caisseService: (service as any).caisseService,
      settings: (service as any).settings,
    };
  }

  it.each([
    [DocumentType.FACTURE, 'FAC', 'FAC-001'],
    [DocumentType.DEVIS, 'DEV', 'DEV-001'],
    [DocumentType.BON_COMMANDE, 'BC', 'BC-001'],
    [DocumentType.BON_LIVRAISON, 'BL', 'BL-001'],
  ])(
    'creates %s with recalculated HT/TVA/TTC and exact %s reference',
    async (documentType, prefix, expectedReference) => {
      const { service, references, tx } = buildService();

      const sale = await service.create({
        documentType,
        customerId: 'customer-1',
        paidAmount: 0,
        discount: 999, // ignored — backend recalculates
        tax: 999,      // ignored — backend recalculates
        items: [{ productId: product.id, quantity: 1, unitPrice: AUTO_UNIT_PRICE }],
      });

      expect(references.generateSimple).toHaveBeenCalledWith(
        prefix,
        'sale',
        tx,
      );
      expect(tx.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceNumber: expectedReference,
            documentType,
            paymentStatus: (
              [DocumentType.FACTURE, DocumentType.BON_LIVRAISON] as DocumentType[]
            ).includes(documentType)
              ? PaymentStatus.UNPAID
              : null,
            subtotal: AUTO_NET_HT,
            discount: 0,
            tax: AUTO_TAX,
            total: AUTO_TOTAL_TTC,
            status: (
              [DocumentType.FACTURE, DocumentType.BON_LIVRAISON] as DocumentType[]
            ).includes(documentType)
              ? SaleStatus.COMPLETED
              : SaleStatus.DRAFT,
          }),
        }),
      );
      expect(sale).toEqual(
        expect.objectContaining({
          invoiceNumber: expectedReference,
          documentType,
        }),
      );
    },
  );

  it('rejects AVOIR creation through /sales with a clear error', async () => {
    const { service } = buildService();

    await expect(
      service.create({
        documentType: DocumentType.AVOIR,
        customerId: 'customer-1',
        paidAmount: 0,
        items: [{ productId: product.id, quantity: 1, unitPrice: AUTO_UNIT_PRICE }],
      }),
    ).rejects.toThrow('Un avoir doit être créé via le module Avoirs');
  });

  it('rejects payment on DEVIS', async () => {
    const { service } = buildService();

    await expect(
      service.create({
        documentType: DocumentType.DEVIS,
        customerId: 'customer-1',
        paidAmount: 10,
        paymentMethod: PaymentMethod.CASH,
        items: [{ productId: product.id, quantity: 1, unitPrice: AUTO_UNIT_PRICE }],
      }),
    ).rejects.toThrow("DEVIS n'accepte pas de paiement");
  });

  it('creates initial payment and caisse movement for paid FACTURE', async () => {
    const { service, tx, caisseService, settings } = buildService();

    await service.create({
      documentType: DocumentType.FACTURE,
      customerId: 'customer-1',
      paidAmount: AUTO_TOTAL_TTC,
      paymentMethod: PaymentMethod.CASH,
      items: [{ productId: product.id, quantity: 1, unitPrice: AUTO_UNIT_PRICE }],
    });

    expect(settings.assertActiveOption).toHaveBeenCalledWith(
      'payment_methods',
      PaymentMethod.CASH,
    );
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CUSTOMER_PAYMENT',
          method: PaymentMethod.CASH,
          amount: AUTO_TOTAL_TTC,
          cashImpactDone: true,
        }),
      }),
    );
    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: CaisseMovementType.ENCAISSEMENT_VENTE,
        montant: AUTO_TOTAL_TTC,
      }),
    );
  });

  it.each([DocumentType.FACTURE, DocumentType.BON_LIVRAISON])(
    'decrements stock once on %s creation',
    async (documentType) => {
      const { service, tx, stockService } = buildService();

      await service.create({
        documentType,
        customerId: 'customer-1',
        paidAmount: 0,
        items: [{ productId: product.id, quantity: 1, unitPrice: AUTO_UNIT_PRICE }],
      });

      expect(stockService.applyMovement).toHaveBeenCalledTimes(1);
      expect(stockService.applyMovement).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          productId: product.id,
          type: StockMovementType.SALE,
          quantity: 1,
        }),
      );
    },
  );

  it('returns the next simple reference preview for each document type', async () => {
    const { service, references } = buildService();

    await expect(
      service.getNextReference(DocumentType.FACTURE),
    ).resolves.toEqual({
      reference: 'FAC-001',
    });

    expect(references.peekNextSimpleReference).toHaveBeenCalledWith(
      'FAC',
      'sale',
    );
  });

  it('rejects unsupported document types with a clear 400 error', async () => {
    const { service } = buildService();

    await expect(
      service.getNextReference('BON_RECEPTION' as DocumentType),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getNextReference('BON_RECEPTION' as DocumentType),
    ).rejects.toThrow('Type de document invalide: BON_RECEPTION');
  });
});
