import { BadRequestException } from '@nestjs/common';
import { CaisseMovementType } from '@prisma/client';
import { CaisseService } from './caisse.service';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildConfig(solde: number, allowNegative = false) {
  return { id: 'cfg-1', solde, allowNegative };
}

function buildTx(solde: number, allowNegative = false) {
  const config = buildConfig(solde, allowNegative);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx: any = {
    caisseConfig: {
      findFirst: jest.fn().mockResolvedValue(config),
      update: jest.fn().mockResolvedValue({ ...config }),
      create: jest.fn().mockResolvedValue({ ...config }),
    },
    caisseMovement: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mv-1', ...data })),
    },
  };
  return tx;
}

function buildService() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    $transaction: jest.fn((fn: (tx: any) => Promise<any>) => fn({})),
    caisseConfig: { findFirst: jest.fn() },
    caisseMovement: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    historyClearLog: { create: jest.fn() },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const references = {} as any;
  const customers = { getTotalClientDebt: jest.fn() } as any;
  const auditLogs = { create: jest.fn() } as any;
  return { service: new CaisseService(prisma, references, customers, auditLogs), prisma };
}

// ─── recordMovement unit tests ────────────────────────────────────────────────

describe('CaisseService.recordMovement', () => {
  it('ENCAISSEMENT_VENTE: ancienSolde + montant = nouveauSolde (IN)', async () => {
    const { service } = buildService();
    const tx = buildTx(500);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.ENCAISSEMENT_VENTE,
      montant: 200,
      referenceDoc: 'PAY-001',
    });

    expect(mv.ancienSolde).toBe(500);
    expect(mv.nouveauSolde).toBe(700);
    expect(mv.montant).toBe(200);
    expect(tx.caisseConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { solde: 700 } }),
    );
  });

  it('DECAISSEMENT_ACHAT: ancienSolde - |montant| = nouveauSolde (OUT)', async () => {
    const { service } = buildService();
    const tx = buildTx(1000);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.DECAISSEMENT_ACHAT,
      montant: -300,
      referenceDoc: 'EXP-001',
    });

    expect(mv.ancienSolde).toBe(1000);
    expect(mv.nouveauSolde).toBe(700);
    expect(mv.montant).toBe(300); // stored as absolute value
  });

  it('RETRAIT_MANUEL: réduction correcte du solde', async () => {
    const { service } = buildService();
    const tx = buildTx(400);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.RETRAIT_MANUEL,
      montant: -100,
      motif: 'Retrait caisse',
    });

    expect(mv.ancienSolde).toBe(400);
    expect(mv.nouveauSolde).toBe(300);
  });

  it('DEPOT_MANUEL: augmentation correcte du solde', async () => {
    const { service } = buildService();
    const tx = buildTx(200);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.DEPOT_MANUEL,
      montant: 150,
      motif: 'Dépôt initial',
    });

    expect(mv.ancienSolde).toBe(200);
    expect(mv.nouveauSolde).toBe(350);
  });

  it('ANNULATION_VENTE: remboursement client réduit le solde (OUT)', async () => {
    const { service } = buildService();
    const tx = buildTx(800);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.ANNULATION_VENTE,
      montant: -250,
      motif: 'Annulation paiement PAY-005',
      referenceDoc: 'PAY-005',
    });

    expect(mv.ancienSolde).toBe(800);
    expect(mv.nouveauSolde).toBe(550);
    expect(mv.montant).toBe(250);
  });

  it('ANNULATION_ACHAT: reversal paiement fournisseur augmente le solde (IN)', async () => {
    const { service } = buildService();
    const tx = buildTx(300);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.ANNULATION_ACHAT,
      montant: 180,
      motif: 'Annulation paiement EXP-002',
      referenceDoc: 'EXP-002',
    });

    expect(mv.ancienSolde).toBe(300);
    expect(mv.nouveauSolde).toBe(480);
    expect(mv.montant).toBe(180);
  });

  it('refuse un solde négatif si allowNegative=false', async () => {
    const { service } = buildService();
    const tx = buildTx(100, false);

    await expect(
      service.recordMovement(tx, {
        type: CaisseMovementType.DECAISSEMENT_ACHAT,
        montant: -500,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('autorise un solde négatif si allowNegative=true', async () => {
    const { service } = buildService();
    const tx = buildTx(100, true);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.DECAISSEMENT_ACHAT,
      montant: -500,
    });

    expect(mv.nouveauSolde).toBe(-400);
  });

  it('crée CaisseConfig si elle n\'existe pas encore', async () => {
    const { service } = buildService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      caisseConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'new-cfg', solde: 200 }),
      },
      caisseMovement: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mv-1', ...data })),
      },
    };

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.DEPOT_MANUEL,
      montant: 200,
    });

    expect(tx.caisseConfig.create).toHaveBeenCalled();
    expect(tx.caisseConfig.update).not.toHaveBeenCalled();
    expect(mv.ancienSolde).toBe(0);
    expect(mv.nouveauSolde).toBe(200);
  });

  it('séquence de mouvements: balances cohérentes ordre chronologique', async () => {
    const { service } = buildService();

    // Simulate three sequential movements sharing the same tx
    const tx1 = buildTx(0);
    const mv1 = await service.recordMovement(tx1, {
      type: CaisseMovementType.ENCAISSEMENT_VENTE,
      montant: 500,
    });
    // After mv1: solde = 500, but tx1 update mock doesn't persist across calls
    // Test that each movement snapshot is correct independently
    expect(mv1.ancienSolde).toBe(0);
    expect(mv1.nouveauSolde).toBe(500);

    const tx2 = buildTx(500);
    const mv2 = await service.recordMovement(tx2, {
      type: CaisseMovementType.DECAISSEMENT_ACHAT,
      montant: -200,
    });
    expect(mv2.ancienSolde).toBe(500);
    expect(mv2.nouveauSolde).toBe(300);

    const tx3 = buildTx(300);
    const mv3 = await service.recordMovement(tx3, {
      type: CaisseMovementType.RETRAIT_MANUEL,
      montant: -50,
    });
    expect(mv3.ancienSolde).toBe(300);
    expect(mv3.nouveauSolde).toBe(250);
  });
});

// ─── getTransactions direction mapping ────────────────────────────────────────

describe('CaisseService.getTransactions — direction', () => {
  function buildServiceWithMovements(movements: any[]) {
    const prisma: any = {
      caisseMovement: {
        findMany: jest.fn().mockResolvedValue(movements),
        count: jest.fn().mockResolvedValue(movements.length),
      },
      caisseConfig: { findFirst: jest.fn().mockResolvedValue({ id: 'cfg', solde: 1000 }) },
    };
    const service = new CaisseService(prisma, {} as any, { getTotalClientDebt: jest.fn() } as any, { create: jest.fn() } as any);
    return service;
  }

  const baseRow = {
    id: '1',
    createdAt: new Date(),
    referenceDoc: null,
    motif: null,
    user: null,
    ancienSolde: 100,
    nouveauSolde: 200,
    montant: 100,
  };

  const directionCases: [string, 'IN' | 'OUT'][] = [
    ['ENCAISSEMENT_VENTE', 'IN'],
    ['DEPOT_MANUEL', 'IN'],
    ['ANNULATION_ACHAT', 'IN'],     // reversal of supplier payment = cash IN
    ['DECAISSEMENT_ACHAT', 'OUT'],
    ['RETRAIT_MANUEL', 'OUT'],
    ['ANNULATION_VENTE', 'OUT'],    // refund to customer = cash OUT
  ];

  test.each(directionCases)('%s → direction = %s', async (type, expectedDir) => {
    const service = buildServiceWithMovements([{ ...baseRow, type }]);
    const result = await service.getTransactions({});
    expect(result.data[0].direction).toBe(expectedDir);
  });

  it('CASH_RESET avec ancienSolde > 0 → direction OUT', async () => {
    const service = buildServiceWithMovements([
      { ...baseRow, type: 'CASH_RESET', ancienSolde: 500, nouveauSolde: 0 },
    ]);
    const result = await service.getTransactions({});
    expect(result.data[0].direction).toBe('OUT');
  });

  it('CASH_RESET avec ancienSolde < 0 → direction IN', async () => {
    const service = buildServiceWithMovements([
      { ...baseRow, type: 'CASH_RESET', ancienSolde: -200, nouveauSolde: 0 },
    ]);
    const result = await service.getTransactions({});
    expect(result.data[0].direction).toBe('IN');
  });
});
