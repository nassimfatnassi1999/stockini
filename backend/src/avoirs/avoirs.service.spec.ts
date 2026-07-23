import { BadRequestException } from '@nestjs/common';
import {
  CaisseMovementType,
  DocumentType,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  SaleCreditStatus,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { AvoirsService } from './avoirs.service';

describe('AvoirsService - avoirs traçables', () => {
  const productA = {
    id: 'product-a',
    reference: 'A',
    name: 'Produit A',
    tva: 19,
  };
  const productB = {
    id: 'product-b',
    reference: 'B',
    name: 'Produit B',
    tva: 19,
  };

  const item = (
    id: string,
    saleId: string,
    product = productA,
    quantity = 5,
    unitPrice = 20,
  ) => ({
    id,
    saleId,
    productId: product.id,
    designation: product.name,
    quantity,
    unitPrice,
    finalUnitPrice: unitPrice,
    total: quantity * unitPrice,
    discountPercent: 0,
    marginPercent: null,
    tvaPercent: 19,
    product,
  });

  const normalSale = (overrides: Record<string, unknown> = {}) => ({
    id: 'sale-1',
    invoiceNumber: 'FAC-001',
    customerId: 'customer-1',
    customer: { name: 'Client' },
    clientType: 'PERSISTENT',
    subtotal: 100,
    tax: 19,
    total: 119,
    stampDuty: 1,
    paidAmount: 120,
    remainingAmount: 0,
    creditedAmount: 0,
    creditedQuantity: 0,
    totalInitialTtc: null,
    totalCurrentTtc: null,
    effectiveTotal: null,
    status: SaleStatus.COMPLETED,
    documentType: DocumentType.FACTURE,
    stockImpactDone: true,
    isConsolidated: false,
    consolidationStatus: null,
    consolidationSources: [],
    items: [item('item-1', 'sale-1')],
    ...overrides,
  });

  function harness(options?: {
    sale?: ReturnType<typeof normalSale>;
    returned?: Array<{
      originalSaleItemId?: string | null;
      saleItemId?: string | null;
      quantiteRetournee: number;
    }>;
    settled?: number;
    stockFailure?: Error;
    cashFailure?: Error;
  }) {
    const sale = options?.sale ?? normalSale();
    const references = {
      generateSalesDocumentNumber: jest.fn().mockResolvedValue('AV-001'),
      generate: jest.fn().mockResolvedValue('AV-PAY-001'),
    };
    const stockService = {
      applyMovement: options?.stockFailure
        ? jest.fn().mockRejectedValue(options.stockFailure)
        : jest.fn().mockResolvedValue({ id: 'stock-movement' }),
    };
    const caisseService = {
      recordMovement: options?.cashFailure
        ? jest.fn().mockRejectedValue(options.cashFailure)
        : jest.fn().mockResolvedValue({ id: 'cash-movement' }),
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      sale: {
        findFirst: jest.fn().mockResolvedValue(sale),
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue(sale),
      },
      creditNoteItem: {
        findMany: jest.fn().mockResolvedValue(options?.returned ?? []),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { totalTtc: 0, quantiteRetournee: 0 } }),
      },
      creditNote: {
        create: jest.fn(({ data }) =>
          Promise.resolve({ id: 'credit-1', ...data }),
        ),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'credit-1' }),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { total: 0, stampDuty: 0 } }),
      },
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: options?.settled ?? 0 } }),
        create: jest.fn(({ data }) =>
          Promise.resolve({ id: 'payment-1', ...data }),
        ),
      },
      customer: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: any) => Promise<unknown>) =>
        callback(tx),
      ),
      sale: { findFirst: jest.fn() },
      creditNoteItem: { findMany: jest.fn() },
      payment: { aggregate: jest.fn() },
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

  const createOne = (
    service: AvoirsService,
    refundMethod:
      | 'CASH'
      | 'BANK_TRANSFER'
      | 'CUSTOMER_CREDIT'
      | 'NONE' = 'CASH',
    extra: Record<string, unknown> = {},
  ) =>
    service.create({
      saleId: 'sale-1',
      refundMethod,
      items: [
        {
          saleItemId: 'item-1',
          productId: productA.id,
          quantiteRetournee: 1,
        },
      ],
      ...extra,
    });

  it('crée un avoir partiel sans rembourser automatiquement le timbre', async () => {
    const { service, tx, stockService } = harness();
    await createOne(service);

    expect(tx.creditNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: expect.objectContaining({}),
          stampDuty: expect.objectContaining({}),
          refundMethod: 'CASH',
          consolidatedDocumentId: null,
        }),
      }),
    );
    const data = tx.creditNote.create.mock.calls[0][0].data;
    expect(Number(data.total)).toBe(23.8);
    expect(Number(data.stampDuty)).toBe(0);
    expect(Number(data.montantRembourse)).toBe(23.8);
    expect(stockService.applyMovement).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: StockMovementType.RETURN_IN,
        sourceType: 'CREDIT_NOTE',
        creditNoteId: 'credit-1',
        originalSaleId: 'sale-1',
        originalSaleItemId: 'item-1',
      }),
    );
  });

  it('réduit uniquement la dette d’un document non payé', async () => {
    const { service, tx, caisseService } = harness({
      sale: normalSale({ paidAmount: 0, remainingAmount: 120 }),
    });
    await createOne(service);

    const data = tx.creditNote.create.mock.calls[0][0].data;
    expect(Number(data.debtReductionAmount)).toBe(23.8);
    expect(Number(data.montantRembourse)).toBe(0);
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(caisseService.recordMovement).not.toHaveBeenCalled();
  });

  it('plafonne le remboursement au trop-payé après réduction de dette', async () => {
    const { service, tx, caisseService } = harness({
      sale: normalSale({ paidAmount: 80, remainingAmount: 40 }),
    });
    await service.create({
      saleId: 'sale-1',
      refundMethod: 'CASH',
      items: [
        {
          saleItemId: 'item-1',
          productId: productA.id,
          quantiteRetournee: 3,
        },
      ],
    });

    const data = tx.creditNote.create.mock.calls[0][0].data;
    expect(Number(data.total)).toBe(71.4);
    expect(Number(data.debtReductionAmount)).toBe(40);
    expect(Number(data.montantRembourse)).toBe(31.4);
    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: CaisseMovementType.REFUND_OUT,
        montant: -31.4,
      }),
    );
  });

  it('crée un crédit client sans mouvement de caisse', async () => {
    const { service, tx, caisseService } = harness();
    await createOne(service, 'CUSTOMER_CREDIT');

    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: PaymentType.CREDIT_NOTE_REFUND,
          method: PaymentMethod.CREDIT,
          cashImpactDone: false,
        }),
      }),
    );
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: { creditBalance: { increment: expect.anything() } },
    });
    expect(caisseService.recordMovement).not.toHaveBeenCalled();
  });

  it('route un remboursement banque avec un seul mouvement négatif', async () => {
    const { service, tx, caisseService } = harness();
    await createOne(service, 'BANK_TRANSFER');

    expect(caisseService.recordMovement).toHaveBeenCalledTimes(1);
    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: CaisseMovementType.REFUND_OUT,
        paymentMethod: 'BANK_TRANSFER',
        creditNoteId: 'credit-1',
      }),
    );
  });

  it('refuse un retour supérieur à la quantité restante', async () => {
    const { service, tx } = harness({
      returned: [
        { originalSaleItemId: 'item-1', quantiteRetournee: 4 },
      ],
    });
    await expect(
      service.create({
        saleId: 'sale-1',
        refundMethod: 'NONE',
        items: [
          {
            saleItemId: 'item-1',
            productId: productA.id,
            quantiteRetournee: 2,
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });

  it('autorise un deuxième avoir sur la quantité restante', async () => {
    const { service, tx } = harness({
      returned: [
        { originalSaleItemId: 'item-1', quantiteRetournee: 3 },
      ],
    });
    await createOne(service, 'NONE');
    expect(tx.creditNote.create).toHaveBeenCalled();
  });

  it('ne rembourse le timbre unique que sur un retour total explicite', async () => {
    const { service, tx } = harness();
    await service.create({
      saleId: 'sale-1',
      refundMethod: 'CASH',
      refundStampDuty: true,
      items: [
        {
          saleItemId: 'item-1',
          productId: productA.id,
          quantiteRetournee: 5,
        },
      ],
    });
    const data = tx.creditNote.create.mock.calls[0][0].data;
    expect(Number(data.stampDuty)).toBe(1);
    expect(Number(data.montantRembourse)).toBe(120);
    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creditStatus: SaleCreditStatus.FULL,
          paymentStatus: PaymentStatus.PAID,
        }),
      }),
    );
  });

  it('refuse le timbre sur un avoir partiel', async () => {
    const { service } = harness();
    await expect(
      createOne(service, 'CASH', { refundStampDuty: true }),
    ).rejects.toThrow(/timbre fiscal/);
  });

  it.each([
    [DocumentType.BON_LIVRAISON, false, 'BL'],
    [DocumentType.FACTURE, false, 'Facture'],
  ])('accepte un document normal %s', async (documentType) => {
    const { service } = harness({
      sale: normalSale({ documentType }),
    });
    await expect(createOne(service, 'NONE')).resolves.toBeDefined();
  });

  it.each([
    [DocumentType.BON_LIVRAISON, 'BLG'],
    [DocumentType.FACTURE, 'FACG'],
  ])(
    'alloue en FIFO un retour consolidé %s sur les lignes sources',
    async (documentType) => {
      const source1 = {
        id: 'bl-1',
        total: 60,
        stampDuty: 1,
        stockImpactDone: true,
        items: [item('bl1-a', 'bl-1', productA, 3)],
      };
      const source2 = {
        id: 'bl-2',
        total: 40,
        stampDuty: 1,
        stockImpactDone: true,
        items: [item('bl2-a', 'bl-2', productA, 2)],
      };
      const source3 = {
        id: 'bl-3',
        total: 80,
        stampDuty: 1,
        stockImpactDone: true,
        items: [item('bl3-b', 'bl-3', productB, 4)],
      };
      const consolidated = normalSale({
        id: 'sale-1',
        invoiceNumber: 'GRP-001',
        documentType,
        isConsolidated: true,
        stockImpactDone: false,
        consolidationStatus: 'ACTIVE',
        items: [],
        consolidationSources: [
          { sourceReference: 'BL1', sourceSale: source1 },
          { sourceReference: 'BL2', sourceSale: source2 },
          { sourceReference: 'BL3', sourceSale: source3 },
        ],
      });
      const { service, tx } = harness({ sale: consolidated });
      await service.create({
        saleId: 'sale-1',
        refundMethod: 'NONE',
        items: [
          { productId: productA.id, quantiteRetournee: 4 },
          { productId: productB.id, quantiteRetournee: 1 },
        ],
      });

      const createdItems = tx.creditNote.create.mock.calls[0][0].data.items.create;
      expect(
        createdItems.map((line: any) => [
          line.sourceReference,
          line.quantiteRetournee,
          line.originalSaleItemId,
        ]),
      ).toEqual([
        ['BL1', 3, 'bl1-a'],
        ['BL2', 1, 'bl2-a'],
        ['BL3', 1, 'bl3-b'],
      ]);
    },
  );

  it.each([
    ['stock', { stockFailure: new Error('stock failed') }],
    ['caisse', { cashFailure: new Error('cash failed') }],
  ])('propage une erreur %s pour rollback de la transaction', async (_, failure) => {
    const { service, tx } = harness(failure);
    await expect(createOne(service)).rejects.toThrow(/failed/);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
