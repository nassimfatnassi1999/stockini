import { BadRequestException } from '@nestjs/common';
import { CaisseMovementType, PaymentStatus, Prisma, PurchaseDocumentType, PurchaseStatus } from '@prisma/client';
import { PurchasesService } from './purchases.service';

/**
 * Tests de la liste « Factures fournisseurs à payer » :
 * - inclut les factures non payées et partiellement payées (reste à payer > 0)
 * - exclut les factures totalement payées et les achats annulés
 * - agrège le total des restes à payer côté backend (Decimal)
 */
describe('PurchasesService.findPayable', () => {
  function buildService(
    rows: Array<{ id: string; remainingAmount: number; paymentStatus: PurchaseStatus | string }>,
    sumRemaining: number,
  ) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { remainingAmount: new Prisma.Decimal(sumRemaining) },
    });
    const prisma = { purchase: { findMany, aggregate } } as any;

    const auditLogs = { audit: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new PurchasesService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      auditLogs,
    );
    return { service, findMany, aggregate };
  }

  it('filtre sur reste à payer > 0 et exclut les achats annulés', async () => {
    const { service, findMany } = buildService(
      [
        { id: 'p1', remainingAmount: 100, paymentStatus: 'UNPAID' },
        { id: 'p2', remainingAmount: 40, paymentStatus: 'PARTIAL' },
      ],
      140,
    );

    const result = await service.findPayable();

    const where = findMany.mock.calls[0][0].where;
    expect(where.remainingAmount).toEqual({ gt: 0 });
    expect(where.status).toEqual({ not: PurchaseStatus.CANCELLED });
    expect(where.deletedAt).toBeNull();
    // Règle métier: les BON_COMMANDE doivent être exclus des factures à payer
    expect(where.documentType).toEqual({ not: PurchaseDocumentType.BON_COMMANDE });

    expect(result.count).toBe(2);
    expect(result.totalRemaining).toBe('140.000');
  });

  it('renvoie 0.000 quand il n\'y a aucune facture à payer', async () => {
    const { service } = buildService([], 0);
    const result = await service.findPayable();
    expect(result.count).toBe(0);
    expect(result.totalRemaining).toBe('0.000');
  });

  it('applique le filtre fournisseur et statut de paiement', async () => {
    const { service, findMany } = buildService([], 0);

    await service.findPayable({
      supplierId: 'supplier-1',
      paymentStatus: 'PARTIAL' as any,
      search: 'ACH',
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.supplierId).toBe('supplier-1');
    expect(where.paymentStatus).toBe('PARTIAL');
    expect(where.OR).toBeDefined();
  });
});

// ─── PurchasesService.cancel() ────────────────────────────────────────────────

describe('PurchasesService.cancel', () => {
  function buildCancelService(payments: Array<{ id: string; method: string; amount: number; cashImpactDone: boolean }>) {
    const purchase = {
      id: 'purchase-1',
      orderNumber: 'ACH-001',
      total: new Prisma.Decimal(100),
      status: PurchaseStatus.RECEIVED,
      items: [],
      payments,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      purchase: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(purchase),
        update: jest.fn().mockResolvedValue({ ...purchase, status: PurchaseStatus.CANCELLED }),
      },
      payment: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      $transaction: jest.fn((cb: (tx: any) => any) => cb(tx)),
    } as any;

    const caisseService = {
      recordMovement: jest.fn().mockResolvedValue({}),
    } as any;

    const auditLogs = { audit: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new PurchasesService(prisma, {} as any, {} as any, {} as any, caisseService, auditLogs);
    return { service, tx, caisseService };
  }

  it('annulation CASH → paymentMethod CASH transmis à recordMovement (PHYSICAL_CASH)', async () => {
    const { service, caisseService } = buildCancelService([
      { id: 'pay-1', method: 'CASH', amount: 100, cashImpactDone: true },
    ]);

    await service.cancel('purchase-1');

    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: CaisseMovementType.ANNULATION_ACHAT,
        paymentMethod: 'CASH',
        montant: 100,
      }),
    );
  });

  it('annulation BANK_TRANSFER → paymentMethod BANK_TRANSFER transmis (BANK_TREASURY)', async () => {
    const { service, caisseService } = buildCancelService([
      { id: 'pay-1', method: 'BANK_TRANSFER', amount: 80, cashImpactDone: true },
    ]);

    await service.cancel('purchase-1');

    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: CaisseMovementType.ANNULATION_ACHAT,
        paymentMethod: 'BANK_TRANSFER',
        montant: 80,
      }),
    );
  });

  it('annulation CHECK → paymentMethod CHECK transmis (BANK_TREASURY)', async () => {
    const { service, caisseService } = buildCancelService([
      { id: 'pay-1', method: 'CHECK', amount: 50, cashImpactDone: true },
    ]);

    await service.cancel('purchase-1');

    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentMethod: 'CHECK' }),
    );
  });

  it('paiement cashImpactDone=false → aucun mouvement caisse créé', async () => {
    const { service, caisseService } = buildCancelService([
      { id: 'pay-1', method: 'CASH', amount: 100, cashImpactDone: false },
    ]);

    await service.cancel('purchase-1');

    expect(caisseService.recordMovement).not.toHaveBeenCalled();
  });

  it('paiements multiples → un mouvement par paiement avec sa propre méthode', async () => {
    const { service, caisseService } = buildCancelService([
      { id: 'pay-1', method: 'CASH', amount: 40, cashImpactDone: true },
      { id: 'pay-2', method: 'BANK_TRANSFER', amount: 60, cashImpactDone: true },
    ]);

    await service.cancel('purchase-1');

    expect(caisseService.recordMovement).toHaveBeenCalledTimes(2);
    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentMethod: 'CASH', montant: 40 }),
    );
    expect(caisseService.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentMethod: 'BANK_TRANSFER', montant: 60 }),
    );
  });

  it('achat déjà annulé → lève BadRequestException', async () => {
    const purchase = {
      id: 'purchase-1',
      orderNumber: 'ACH-001',
      total: new Prisma.Decimal(100),
      status: PurchaseStatus.CANCELLED,
      items: [],
      payments: [],
    };
    const prisma = {
      $transaction: jest.fn((cb: (tx: any) => any) =>
        cb({
          purchase: { findUniqueOrThrow: jest.fn().mockResolvedValue(purchase) },
        } as any),
      ),
    } as any;
    const auditLogs = { audit: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new PurchasesService(prisma, {} as any, {} as any, {} as any, {} as any, auditLogs);

    await expect(service.cancel('purchase-1')).rejects.toThrow(BadRequestException);
  });
});

// ─── PurchasesService.transform() ────────────────────────────────────────────

/**
 * Règle métier : la transformation BC → BR/FACTURE active la dette fournisseur.
 * Le service doit réécrire explicitement paymentStatus=UNPAID, paidAmount=0,
 * remainingAmount=total afin que le document apparaisse dans "Factures à payer".
 */
describe('PurchasesService.transform', () => {
  function buildTransformService(purchase: {
    status: PurchaseStatus;
    documentType: PurchaseDocumentType;
    total: number;
    items?: Array<{ id: string; quantity: number; receivedQuantity: number; productId: string; unitCost: Prisma.Decimal }>;
  }) {
    const purchaseRow = {
      id: 'purchase-1',
      orderNumber: 'ACH-001',
      supplierId: 'supplier-1',
      supplier: { name: 'Fournisseur Test' },
      status: purchase.status,
      documentType: purchase.documentType,
      total: new Prisma.Decimal(purchase.total),
      items: purchase.items ?? [],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      purchase: {
        findFirstOrThrow: jest.fn().mockResolvedValue(purchaseRow),
        update: jest.fn(({ data }: { data: any }) =>
          Promise.resolve({ ...purchaseRow, ...data }),
        ),
      },
      purchaseItem: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      $transaction: jest.fn((cb: (tx: any) => any) => cb(tx)),
    } as any;

    const stockService = { applyMovement: jest.fn().mockResolvedValue({}) } as any;
    const auditLogs = { audit: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new PurchasesService(prisma, stockService, {} as any, {} as any, {} as any, auditLogs);
    return { service, tx, stockService };
  }

  it('BC → BR : met paymentStatus=UNPAID, paidAmount=0, remainingAmount=total', async () => {
    const { service, tx } = buildTransformService({
      status: PurchaseStatus.ORDERED,
      documentType: PurchaseDocumentType.BON_COMMANDE,
      total: 200,
      items: [],
    });

    await service.transform('purchase-1', { targetType: 'BON_RECEPTION' });

    const updateCall = tx.purchase.update.mock.calls[0][0];
    expect(updateCall.data.documentType).toBe(PurchaseDocumentType.BON_RECEPTION);
    expect(updateCall.data.status).toBe(PurchaseStatus.RECEIVED);
    expect(updateCall.data.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(updateCall.data.paidAmount).toBe(0);
    expect(Number(updateCall.data.remainingAmount)).toBe(200);
  });

  it('BC → FACTURE_FOURNISSEUR : met paymentStatus=UNPAID, status inchangé', async () => {
    const { service, tx } = buildTransformService({
      status: PurchaseStatus.ORDERED,
      documentType: PurchaseDocumentType.BON_COMMANDE,
      total: 150,
      items: [],
    });

    await service.transform('purchase-1', { targetType: 'FACTURE_FOURNISSEUR' });

    const updateCall = tx.purchase.update.mock.calls[0][0];
    expect(updateCall.data.documentType).toBe(PurchaseDocumentType.FACTURE_FOURNISSEUR);
    expect(updateCall.data.status).toBe(PurchaseStatus.ORDERED);
    expect(updateCall.data.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(updateCall.data.paidAmount).toBe(0);
    expect(Number(updateCall.data.remainingAmount)).toBe(150);
  });

  it('document déjà transformé en BR → lève BadRequestException', async () => {
    const { service } = buildTransformService({
      status: PurchaseStatus.RECEIVED,
      documentType: PurchaseDocumentType.BON_RECEPTION,
      total: 100,
    });

    await expect(
      service.transform('purchase-1', { targetType: 'FACTURE_FOURNISSEUR' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('achat annulé → lève BadRequestException, aucune mise à jour', async () => {
    const { service, tx } = buildTransformService({
      status: PurchaseStatus.CANCELLED,
      documentType: PurchaseDocumentType.BON_COMMANDE,
      total: 100,
    });

    await expect(
      service.transform('purchase-1', { targetType: 'BON_RECEPTION' }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.purchase.update).not.toHaveBeenCalled();
  });
});

// ─── PurchasesService.receive() — activation documentType ────────────────────

/**
 * Règle métier : dès qu'un article est réceptionné sur un BC, le document doit
 * automatiquement devenir un BON_RECEPTION avec paymentStatus=UNPAID.
 * C'est la correction du bug "Paiement reste '—' après réception".
 */
describe('PurchasesService.receive — activation documentType', () => {
  function buildReceiveService(purchase: {
    status: PurchaseStatus;
    documentType: PurchaseDocumentType;
    total: number;
    items: Array<{ id: string; quantity: number; receivedQuantity: number; productId: string; unitCost: Prisma.Decimal }>;
  }) {
    const purchaseRow = {
      id: 'purchase-1',
      orderNumber: 'ACH-001',
      supplierId: 'supplier-1',
      total: new Prisma.Decimal(purchase.total),
      status: purchase.status,
      documentType: purchase.documentType,
      items: purchase.items,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      purchase: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(purchaseRow),
        update: jest.fn(({ data }: { data: any }) =>
          Promise.resolve({ ...purchaseRow, ...data }),
        ),
      },
      purchaseItem: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockImplementation(() => {
          return Promise.resolve(
            purchase.items.map((item) => ({
              ...item,
              receivedQuantity: item.receivedQuantity + 1,
            })),
          );
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn((cb: (tx: any) => any) => cb(tx)),
    } as any;

    const stockService = { applyMovement: jest.fn().mockResolvedValue({}) } as any;
    const auditLogs = { audit: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new PurchasesService(prisma, stockService, {} as any, {} as any, {} as any, auditLogs);
    return { service, tx };
  }

  it('BC + réception complète → documentType=BON_RECEPTION, paymentStatus=UNPAID, remainingAmount=total', async () => {
    const item = { id: 'item-1', quantity: 5, receivedQuantity: 0, productId: 'prod-1', unitCost: new Prisma.Decimal(100) };
    const { service, tx } = buildReceiveService({
      status: PurchaseStatus.ORDERED,
      documentType: PurchaseDocumentType.BON_COMMANDE,
      total: 500,
      items: [item],
    });

    // findMany retourne l'item comme entièrement reçu
    tx.purchaseItem.findMany.mockResolvedValue([{ ...item, receivedQuantity: 5 }]);

    await service.receive('purchase-1', { items: [{ purchaseItemId: 'item-1', quantity: 5 }] });

    const updateCall = tx.purchase.update.mock.calls[0][0];
    expect(updateCall.data.documentType).toBe(PurchaseDocumentType.BON_RECEPTION);
    expect(updateCall.data.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(updateCall.data.paidAmount).toBe(0);
    expect(Number(updateCall.data.remainingAmount)).toBe(500);
    expect(updateCall.data.status).toBe(PurchaseStatus.RECEIVED);
  });

  it('BC déjà BON_RECEPTION → documentType non modifié lors d\'une réception supplémentaire', async () => {
    const item = { id: 'item-1', quantity: 5, receivedQuantity: 3, productId: 'prod-1', unitCost: new Prisma.Decimal(100) };
    const { service, tx } = buildReceiveService({
      status: PurchaseStatus.PARTIALLY_RECEIVED,
      documentType: PurchaseDocumentType.BON_RECEPTION,
      total: 500,
      items: [item],
    });

    tx.purchaseItem.findMany.mockResolvedValue([{ ...item, receivedQuantity: 5 }]);

    await service.receive('purchase-1', { items: [{ purchaseItemId: 'item-1', quantity: 2 }] });

    const updateCall = tx.purchase.update.mock.calls[0][0];
    // Pas de modification du documentType si c'est déjà un BR
    expect(updateCall.data.documentType).toBeUndefined();
    expect(updateCall.data.paymentStatus).toBeUndefined();
  });

  it('achat annulé → lève BadRequestException', async () => {
    const { service } = buildReceiveService({
      status: PurchaseStatus.CANCELLED,
      documentType: PurchaseDocumentType.BON_COMMANDE,
      total: 100,
      items: [],
    });

    await expect(
      service.receive('purchase-1', { items: [{ purchaseItemId: 'item-1', quantity: 1 }] }),
    ).rejects.toThrow(BadRequestException);
  });
});
