import { BadRequestException } from '@nestjs/common';
import { CaisseMovementType, TreasuryAccount } from '@prisma/client';
import { CaisseService, resolveAccount } from './caisse.service';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildConfig(soldeCaisse: number, soldeBanque = 0, allowNegative = false, allowNegativeBanque = false) {
  return { id: 'cfg-1', solde: soldeCaisse, soldeBanque, allowNegative, allowNegativeBanque };
}

function buildTx(soldeCaisse: number, soldeBanque = 0, allowNegative = false, allowNegativeBanque = false) {
  const config = buildConfig(soldeCaisse, soldeBanque, allowNegative, allowNegativeBanque);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx: any = {
    caisseConfig: {
      findFirst: jest.fn().mockResolvedValue(config),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...config, ...data })),
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
  const auditLogs = { create: jest.fn(), audit: jest.fn().mockResolvedValue(undefined) } as any;
  return { service: new CaisseService(prisma, references, customers, auditLogs), prisma };
}

// ─── resolveAccount unit tests ────────────────────────────────────────────────

describe('resolveAccount()', () => {
  it('CASH → PHYSICAL_CASH', () => {
    expect(resolveAccount('CASH')).toBe(TreasuryAccount.PHYSICAL_CASH);
  });

  it('undefined → PHYSICAL_CASH', () => {
    expect(resolveAccount(undefined)).toBe(TreasuryAccount.PHYSICAL_CASH);
  });

  it('CARD → BANK_TREASURY', () => {
    expect(resolveAccount('CARD')).toBe(TreasuryAccount.BANK_TREASURY);
  });

  it('BANK_TRANSFER → BANK_TREASURY', () => {
    expect(resolveAccount('BANK_TRANSFER')).toBe(TreasuryAccount.BANK_TREASURY);
  });

  it('CHECK → BANK_TREASURY', () => {
    expect(resolveAccount('CHECK')).toBe(TreasuryAccount.BANK_TREASURY);
  });

  it('explicit override prend le dessus sur paymentMethod', () => {
    expect(resolveAccount('CASH', TreasuryAccount.BANK_TREASURY)).toBe(TreasuryAccount.BANK_TREASURY);
  });

  it('CREDIT → PHYSICAL_CASH fallback (recordMovement le bloquera en amont)', () => {
    expect(resolveAccount('CREDIT')).toBe(TreasuryAccount.PHYSICAL_CASH);
  });
});

// ─── recordMovement dual-account tests ───────────────────────────────────────

describe('CaisseService.recordMovement — dual account', () => {
  it('paiement CASH → solde caisse physique modifié, pas banque', async () => {
    const { service } = buildService();
    const tx = buildTx(500, 1000);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.ENCAISSEMENT_VENTE,
      montant: 200,
      paymentMethod: 'CASH',
      referenceDoc: 'PAY-001',
    });

    expect(mv.treasuryAccount).toBe(TreasuryAccount.PHYSICAL_CASH);
    expect(mv.ancienSolde).toBe(500);
    expect(mv.nouveauSolde).toBe(700);
    expect(tx.caisseConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { solde: 700 } }),
    );
    expect(tx.caisseConfig.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { soldeBanque: expect.anything() } }),
    );
  });

  it('paiement BANK_TRANSFER → solde banque modifié, pas caisse physique', async () => {
    const { service } = buildService();
    const tx = buildTx(500, 1000);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.ENCAISSEMENT_VENTE,
      montant: 300,
      paymentMethod: 'BANK_TRANSFER',
      referenceDoc: 'PAY-002',
    });

    expect(mv.treasuryAccount).toBe(TreasuryAccount.BANK_TREASURY);
    expect(mv.ancienSolde).toBe(1000);
    expect(mv.nouveauSolde).toBe(1300);
    expect(tx.caisseConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { soldeBanque: 1300 } }),
    );
  });

  it('paiement CHECK → banque', async () => {
    const { service } = buildService();
    const tx = buildTx(200, 800);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.DECAISSEMENT_ACHAT,
      montant: -150,
      paymentMethod: 'CHECK',
    });

    expect(mv.treasuryAccount).toBe(TreasuryAccount.BANK_TREASURY);
    expect(mv.ancienSolde).toBe(800);
    expect(mv.nouveauSolde).toBe(650);
  });

  it('paiement CARD → banque', async () => {
    const { service } = buildService();
    const tx = buildTx(200, 400);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.ENCAISSEMENT_VENTE,
      montant: 100,
      paymentMethod: 'CARD',
    });

    expect(mv.treasuryAccount).toBe(TreasuryAccount.BANK_TREASURY);
    expect(mv.ancienSolde).toBe(400);
    expect(mv.nouveauSolde).toBe(500);
  });

  it('retrait caisse physique ne touche pas le solde banque', async () => {
    const { service } = buildService();
    const tx = buildTx(400, 1000);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.RETRAIT_MANUEL,
      montant: -100,
      treasuryAccount: TreasuryAccount.PHYSICAL_CASH,
    });

    expect(mv.ancienSolde).toBe(400);
    expect(mv.nouveauSolde).toBe(300);
    expect(tx.caisseConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { solde: 300 } }),
    );
  });

  it('retrait banque ne touche pas le solde caisse physique', async () => {
    const { service } = buildService();
    const tx = buildTx(400, 1000);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.RETRAIT_MANUEL,
      montant: -200,
      treasuryAccount: TreasuryAccount.BANK_TREASURY,
    });

    expect(mv.ancienSolde).toBe(1000);
    expect(mv.nouveauSolde).toBe(800);
    expect(tx.caisseConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { soldeBanque: 800 } }),
    );
  });

  it('refuse solde caisse physique négatif si allowNegative=false', async () => {
    const { service } = buildService();
    const tx = buildTx(100, 1000, false);

    await expect(
      service.recordMovement(tx, {
        type: CaisseMovementType.DECAISSEMENT_ACHAT,
        montant: -500,
        paymentMethod: 'CASH',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse solde banque négatif si allowNegativeBanque=false', async () => {
    const { service } = buildService();
    const tx = buildTx(1000, 100, false, false);

    await expect(
      service.recordMovement(tx, {
        type: CaisseMovementType.DECAISSEMENT_ACHAT,
        montant: -500,
        paymentMethod: 'BANK_TRANSFER',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('autorise solde banque négatif si allowNegativeBanque=true', async () => {
    const { service } = buildService();
    const tx = buildTx(1000, 100, false, true);

    const mv = await service.recordMovement(tx, {
      type: CaisseMovementType.DECAISSEMENT_ACHAT,
      montant: -500,
      paymentMethod: 'BANK_TRANSFER',
    });

    expect(mv.nouveauSolde).toBe(-400);
  });

  it('CREDIT → lève BadRequestException, aucun mouvement créé', async () => {
    const { service } = buildService();
    const tx = buildTx(500, 1000);

    await expect(
      service.recordMovement(tx, {
        type: CaisseMovementType.ENCAISSEMENT_VENTE,
        montant: 100,
        paymentMethod: 'CREDIT',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.caisseMovement.create).not.toHaveBeenCalled();
    expect(tx.caisseConfig.update).not.toHaveBeenCalled();
  });

  it('CREDIT → solde caisse et banque inchangés', async () => {
    const { service } = buildService();
    const tx = buildTx(500, 1000);

    await expect(
      service.recordMovement(tx, {
        type: CaisseMovementType.ENCAISSEMENT_VENTE,
        montant: 200,
        paymentMethod: 'CREDIT',
      }),
    ).rejects.toThrow(BadRequestException);

    // Balances must remain untouched
    expect(tx.caisseConfig.update).not.toHaveBeenCalled();
  });

  it('soldes caisse et banque sont indépendants', async () => {
    const { service } = buildService();
    const tx = buildTx(500, 1000);

    // Cash payment
    const mv1 = await service.recordMovement(tx, {
      type: CaisseMovementType.ENCAISSEMENT_VENTE,
      montant: 200,
      paymentMethod: 'CASH',
    });
    expect(mv1.ancienSolde).toBe(500);
    expect(mv1.nouveauSolde).toBe(700);

    // Bank payment — independent balance
    const tx2 = buildTx(700, 1000);
    const mv2 = await service.recordMovement(tx2, {
      type: CaisseMovementType.ENCAISSEMENT_VENTE,
      montant: 300,
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(mv2.ancienSolde).toBe(1000);
    expect(mv2.nouveauSolde).toBe(1300);
  });
});

// ─── Legacy recordMovement unit tests (unchanged behaviour) ───────────────────

describe('CaisseService.recordMovement — legacy (no paymentMethod = PHYSICAL_CASH)', () => {
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
    expect(mv.treasuryAccount).toBe(TreasuryAccount.PHYSICAL_CASH);
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
    expect(mv.montant).toBe(300);
  });

  it('refuse un solde négatif si allowNegative=false', async () => {
    const { service } = buildService();
    const tx = buildTx(100, 0, false);

    await expect(
      service.recordMovement(tx, {
        type: CaisseMovementType.DECAISSEMENT_ACHAT,
        montant: -500,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('autorise un solde négatif si allowNegative=true', async () => {
    const { service } = buildService();
    const tx = buildTx(100, 0, true);

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
});

// ─── getTransactions direction mapping ────────────────────────────────────────

describe('CaisseService.getTransactions — direction', () => {
  function buildServiceWithMovements(movements: any[]) {
    const prisma: any = {
      caisseMovement: {
        findMany: jest.fn().mockResolvedValue(movements),
        count: jest.fn().mockResolvedValue(movements.length),
      },
      caisseConfig: { findFirst: jest.fn().mockResolvedValue({ id: 'cfg', solde: 1000, soldeBanque: 500 }) },
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
    treasuryAccount: TreasuryAccount.PHYSICAL_CASH,
  };

  const directionCases: [string, 'IN' | 'OUT'][] = [
    ['ENCAISSEMENT_VENTE', 'IN'],
    ['DEPOT_MANUEL', 'IN'],
    ['ANNULATION_ACHAT', 'IN'],
    ['DECAISSEMENT_ACHAT', 'OUT'],
    ['RETRAIT_MANUEL', 'OUT'],
    ['ANNULATION_VENTE', 'OUT'],
  ];

  test.each(directionCases)('%s → direction = %s', async (type, expectedDir) => {
    const service = buildServiceWithMovements([{ ...baseRow, type }]);
    const result = await service.getTransactions({});
    expect(result.data[0].direction).toBe(expectedDir);
  });

  it('retourne treasuryAccount dans chaque ligne', async () => {
    const service = buildServiceWithMovements([
      { ...baseRow, type: 'ENCAISSEMENT_VENTE', treasuryAccount: TreasuryAccount.BANK_TREASURY },
    ]);
    const result = await service.getTransactions({});
    expect(result.data[0].account).toBe(TreasuryAccount.BANK_TREASURY);
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
