import { BadRequestException } from '@nestjs/common';
import { CaisseMovementType, Prisma, PurchaseStatus } from '@prisma/client';
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

    const service = new PurchasesService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
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

    const service = new PurchasesService(prisma, {} as any, {} as any, {} as any, caisseService);
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
    const service = new PurchasesService(prisma, {} as any, {} as any, {} as any, {} as any);

    await expect(service.cancel('purchase-1')).rejects.toThrow(BadRequestException);
  });
});
