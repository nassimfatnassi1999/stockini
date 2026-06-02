import { BadRequestException } from '@nestjs/common';
import { CaisseMovementType, DocumentType, PaymentStatus, PaymentType, SaleStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';

// ─── Helpers pour clearHistory ────────────────────────────────────────────────

function buildClearService(countResult = 3) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    payment: {
      count: jest.fn().mockResolvedValue(countResult),
      updateMany: jest.fn().mockResolvedValue({ count: countResult }),
    },
    historyClearLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
  };
  const references = {} as any;
  const settings = {} as any;
  const caisseService = {} as any;
  const service = new PaymentsService(prisma, references, settings, caisseService);
  return { service, prisma };
}

// ─── Tests clearCustomerPaymentsHistory ──────────────────────────────────────

describe('PaymentsService.clearCustomerPaymentsHistory', () => {
  it('applique updateMany avec clearedAt et clearedBy sur CUSTOMER_PAYMENT', async () => {
    const { service, prisma } = buildClearService(5);
    const result = await service.clearCustomerPaymentsHistory({}, 'user-1');

    expect(result.count).toBe(5);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: PaymentType.CUSTOMER_PAYMENT, clearedAt: null }),
        data: expect.objectContaining({ clearedBy: 'user-1' }),
      }),
    );
  });

  it('ne touche pas aux paiements déjà cleared', async () => {
    const { service, prisma } = buildClearService(0);
    const result = await service.clearCustomerPaymentsHistory({}, 'user-1');

    expect(result.count).toBe(0);
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('crée un HistoryClearLog avec le bon module et userId', async () => {
    const { service, prisma } = buildClearService(2);
    await service.clearCustomerPaymentsHistory({ dateFrom: '2026-01-01' }, 'user-admin');

    expect(prisma.historyClearLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ module: 'customer_payments', userId: 'user-admin', count: 2 }),
      }),
    );
  });

  it('ne modifie pas les soldes (updateMany cible uniquement les colonnes cleared)', async () => {
    const { service, prisma } = buildClearService(3);
    await service.clearCustomerPaymentsHistory({}, 'user-1');

    const updateCall = prisma.payment.updateMany.mock.calls[0][0];
    expect(Object.keys(updateCall.data)).toEqual(expect.arrayContaining(['clearedAt', 'clearedBy']));
    expect(Object.keys(updateCall.data)).not.toContain('amount');
    expect(Object.keys(updateCall.data)).not.toContain('paidAmount');
  });
});

// ─── Tests clearSupplierPaymentsHistory ──────────────────────────────────────

describe('PaymentsService.clearSupplierPaymentsHistory', () => {
  it('applique updateMany avec clearedAt et clearedBy sur SUPPLIER_PAYMENT', async () => {
    const { service, prisma } = buildClearService(4);
    const result = await service.clearSupplierPaymentsHistory({}, 'user-1');

    expect(result.count).toBe(4);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: PaymentType.SUPPLIER_PAYMENT, clearedAt: null }),
        data: expect.objectContaining({ clearedBy: 'user-1' }),
      }),
    );
  });

  it('filtre par supplierId si fourni', async () => {
    const { service, prisma } = buildClearService(1);
    await service.clearSupplierPaymentsHistory({ supplierId: 'sup-99' }, 'user-1');

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ supplierId: 'sup-99' }),
      }),
    );
  });

  it('crée un HistoryClearLog avec le bon module', async () => {
    const { service, prisma } = buildClearService(2);
    await service.clearSupplierPaymentsHistory({}, 'user-x');

    expect(prisma.historyClearLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ module: 'supplier_payments', userId: 'user-x' }),
      }),
    );
  });
});

// ─── Tests paySale ────────────────────────────────────────────────────────────

describe('PaymentsService.paySale', () => {
  function buildSaleService(
    sale: {
      total: number;
      paidAmount: number;
      remainingAmount: number;
      documentType?: string;
      status?: string;
    },
    opts: { caisseThrows?: boolean } = {},
  ) {
    const saleRow = {
      id: 'sale-1',
      customerId: 'customer-1',
      invoiceNumber: 'FAC-001',
      documentType: sale.documentType ?? DocumentType.FACTURE,
      status: sale.status ?? SaleStatus.COMPLETED,
      ...sale,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      sale: {
        findFirstOrThrow: jest.fn().mockResolvedValue(saleRow),
        update: jest.fn(({ data }: { data: any }) =>
          Promise.resolve({ ...saleRow, ...data }),
        ),
      },
      payment: {
        create: jest.fn(({ data }: { data: any }) =>
          Promise.resolve({
            id: 'payment-1',
            ...data,
            sale: { ...saleRow, invoiceNumber: 'FAC-001' },
            customer: { id: 'customer-1', name: 'Client Test' },
          }),
        ),
      },
    };

    const prisma = {
      $transaction: jest.fn((cb: (tx: any) => any) => cb(tx)),
    } as any;
    const references = {
      generate: jest.fn().mockResolvedValue('PAY-001'),
    } as any;
    const settings = {} as any;
    const caisseService = {
      recordMovement: jest.fn(() =>
        opts.caisseThrows
          ? Promise.reject(new Error('Solde insuffisant'))
          : Promise.resolve({}),
      ),
    } as any;

    const service = new PaymentsService(prisma, references, settings, caisseService);
    return { service, tx, caisseService };
  }

  it('facture non payée → statut UNPAID initial, reste à payer = total', async () => {
    const { service, tx } = buildSaleService({ total: 200, paidAmount: 0, remainingAmount: 200 });

    await service.paySale('sale-1', { amount: 50, method: 'CASH' as any });

    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidAmount: 50,
          remainingAmount: 150,
          paymentStatus: PaymentStatus.PARTIAL,
        }),
      }),
    );
  });

  it('paiement partiel → statut PARTIAL et reste à payer réduit', async () => {
    const { service, tx } = buildSaleService({ total: 100, paidAmount: 0, remainingAmount: 100 });

    await service.paySale('sale-1', { amount: 40, method: 'CASH' as any });

    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale-1' },
        data: {
          paidAmount: 40,
          remainingAmount: 60,
          paymentStatus: PaymentStatus.PARTIAL,
        },
      }),
    );
  });

  it('paiement total → statut PAID et reste à payer = 0', async () => {
    const { service, tx } = buildSaleService({ total: 100, paidAmount: 60, remainingAmount: 40 });

    await service.paySale('sale-1', { amount: 40, method: 'CASH' as any });

    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          paidAmount: 100,
          remainingAmount: 0,
          paymentStatus: PaymentStatus.PAID,
        },
      }),
    );
  });

  it('crée un paiement CUSTOMER_PAYMENT lié à la vente et au client', async () => {
    const { service, tx } = buildSaleService({ total: 100, paidAmount: 0, remainingAmount: 100 });

    await service.paySale('sale-1', { amount: 30, method: 'BANK_TRANSFER' as any });

    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: PaymentType.CUSTOMER_PAYMENT,
          saleId: 'sale-1',
          customerId: 'customer-1',
          amount: 30,
        }),
      }),
    );
  });

  it('crée un mouvement caisse positif ENCAISSEMENT_VENTE', async () => {
    const { service, caisseService } = buildSaleService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await service.paySale('sale-1', { amount: 50, method: 'CASH' as any });

    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: CaisseMovementType.ENCAISSEMENT_VENTE,
        montant: 50,
      }),
    );
  });

  it('rejette un paiement supérieur au reste à payer', async () => {
    const { service } = buildSaleService({ total: 100, paidAmount: 80, remainingAmount: 20 });

    await expect(
      service.paySale('sale-1', { amount: 50, method: 'CASH' as any }),
    ).rejects.toThrow(/reste à payer/);
  });

  it('rejette un paiement sur un document DEVIS', async () => {
    const { service } = buildSaleService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
      documentType: DocumentType.DEVIS,
    });

    await expect(
      service.paySale('sale-1', { amount: 50, method: 'CASH' as any }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejette un paiement sur une vente annulée', async () => {
    const { service } = buildSaleService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
      status: SaleStatus.CANCELLED,
    });

    await expect(
      service.paySale('sale-1', { amount: 50, method: 'CASH' as any }),
    ).rejects.toThrow(/annulé/);
  });

  it('rollback : propage l\'erreur si le mouvement caisse échoue', async () => {
    const { service } = buildSaleService(
      { total: 100, paidAmount: 0, remainingAmount: 100 },
      { caisseThrows: true },
    );

    await expect(
      service.paySale('sale-1', { amount: 30, method: 'CASH' as any }),
    ).rejects.toThrow('Solde insuffisant');
  });

  it('CREDIT → lève BadRequestException, aucun mouvement caisse créé', async () => {
    const { service, caisseService } = buildSaleService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await expect(
      service.paySale('sale-1', { amount: 100, method: 'CREDIT' as any }),
    ).rejects.toThrow(BadRequestException);

    expect(caisseService.recordMovement).not.toHaveBeenCalled();
  });

  it('CREDIT → paidAmount et remainingAmount ne changent pas', async () => {
    const { service, tx } = buildSaleService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await expect(
      service.paySale('sale-1', { amount: 100, method: 'CREDIT' as any }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.sale.update).not.toHaveBeenCalled();
  });

  it('paiement CASH ultérieur → mouvement PHYSICAL_CASH avec bon paymentMethod', async () => {
    const { service, caisseService } = buildSaleService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await service.paySale('sale-1', { amount: 100, method: 'CASH' as any });

    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: CaisseMovementType.ENCAISSEMENT_VENTE,
        montant: 100,
        paymentMethod: 'CASH',
      }),
    );
  });

  it('paiement BANK_TRANSFER ultérieur → paymentMethod transmis à recordMovement', async () => {
    const { service, caisseService } = buildSaleService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await service.paySale('sale-1', { amount: 60, method: 'BANK_TRANSFER' as any });

    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentMethod: 'BANK_TRANSFER' }),
    );
  });
});

// ─── Tests payPurchase ────────────────────────────────────────────────────────

/**
 * Tests du paiement fournisseur : mise à jour paidAmount/paymentStatus,
 * mouvement caisse négatif (sortie) et rollback transactionnel.
 */
describe('PaymentsService.payPurchase', () => {
  function buildService(
    purchase: {
      total: number;
      paidAmount: number;
      remainingAmount: number;
    },
    opts: { caisseThrows?: boolean } = {},
  ) {
    const purchaseRow = {
      id: 'purchase-1',
      supplierId: 'supplier-1',
      orderNumber: 'ACH-001',
      ...purchase,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      purchase: {
        findFirstOrThrow: jest.fn().mockResolvedValue(purchaseRow),
        update: jest.fn(({ data }: { data: any }) =>
          Promise.resolve({ ...purchaseRow, ...data }),
        ),
      },
      payment: {
        create: jest.fn(({ data }: { data: any }) =>
          Promise.resolve({
            id: 'payment-1',
            ...data,
            purchase: { ...purchaseRow, supplier: { name: 'Fournisseur X' } },
          }),
        ),
      },
    };

    const prisma = {
      $transaction: jest.fn((cb: (tx: any) => any) => cb(tx)),
    } as any;
    const references = {
      generate: jest.fn().mockResolvedValue('EXP-001'),
    } as any;
    const settings = {} as any;
    const caisseService = {
      recordMovement: jest.fn(() =>
        opts.caisseThrows
          ? Promise.reject(new Error('Solde insuffisant'))
          : Promise.resolve({}),
      ),
    } as any;

    const service = new PaymentsService(
      prisma,
      references,
      settings,
      caisseService,
    );
    return { service, tx, caisseService };
  }

  it('met le statut à PARTIAL pour un paiement partiel et réduit le reste à payer', async () => {
    const { service, tx } = buildService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await service.payPurchase('purchase-1', {
      amount: 40,
      method: 'CASH' as any,
    });

    expect(tx.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'purchase-1' },
        data: {
          paidAmount: 40,
          remainingAmount: 60,
          paymentStatus: PaymentStatus.PARTIAL,
        },
      }),
    );
  });

  it('met le statut à PAID quand le reste à payer atteint 0', async () => {
    const { service, tx } = buildService({
      total: 100,
      paidAmount: 60,
      remainingAmount: 40,
    });

    await service.payPurchase('purchase-1', {
      amount: 40,
      method: 'CASH' as any,
    });

    expect(tx.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          paidAmount: 100,
          remainingAmount: 0,
          paymentStatus: PaymentStatus.PAID,
        },
      }),
    );
  });

  it('crée un mouvement caisse négatif (sortie) de type DECAISSEMENT_ACHAT', async () => {
    const { service, caisseService } = buildService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await service.payPurchase('purchase-1', {
      amount: 30,
      method: 'CASH' as any,
    });

    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: CaisseMovementType.DECAISSEMENT_ACHAT,
        montant: -30,
      }),
    );
  });

  it('crée le paiement de type SUPPLIER_PAYMENT rattaché au fournisseur', async () => {
    const { service, tx } = buildService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await service.payPurchase('purchase-1', {
      amount: 30,
      method: 'CASH' as any,
    });

    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: PaymentType.SUPPLIER_PAYMENT,
          purchaseId: 'purchase-1',
          supplierId: 'supplier-1',
          amount: 30,
        }),
      }),
    );
  });

  it('rejette un paiement supérieur au reste à payer', async () => {
    const { service } = buildService({
      total: 100,
      paidAmount: 90,
      remainingAmount: 10,
    });

    await expect(
      service.payPurchase('purchase-1', { amount: 50, method: 'CASH' as any }),
    ).rejects.toThrow(/reste à payer/);
  });

  it('rollback : propage l\'erreur si le mouvement caisse échoue', async () => {
    const { service } = buildService(
      { total: 100, paidAmount: 0, remainingAmount: 100 },
      { caisseThrows: true },
    );

    await expect(
      service.payPurchase('purchase-1', { amount: 30, method: 'CASH' as any }),
    ).rejects.toThrow('Solde insuffisant');
  });

  it('CREDIT → lève BadRequestException, aucun mouvement caisse créé', async () => {
    const { service, caisseService } = buildService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await expect(
      service.payPurchase('purchase-1', { amount: 100, method: 'CREDIT' as any }),
    ).rejects.toThrow(BadRequestException);

    expect(caisseService.recordMovement).not.toHaveBeenCalled();
  });

  it('paiement CHECK fournisseur → paymentMethod transmis à recordMovement', async () => {
    const { service, caisseService } = buildService({
      total: 100,
      paidAmount: 0,
      remainingAmount: 100,
    });

    await service.payPurchase('purchase-1', { amount: 50, method: 'CHECK' as any });

    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentMethod: 'CHECK' }),
    );
  });
});
