import { BadRequestException, ConflictException } from '@nestjs/common';
import { CaisseMovementType, Prisma, TreasuryAccount } from '@prisma/client';
import { CaisseService } from './caisse.service';

const D = (value: number) => new Prisma.Decimal(value);
const createdAt = new Date('2026-07-30T10:00:00.000Z');

function movement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'movement-b',
    type: CaisseMovementType.DEPOT_MANUEL,
    treasuryAccount: TreasuryAccount.PHYSICAL_CASH,
    montant: D(500),
    ancienSolde: D(3000),
    nouveauSolde: D(3500),
    motif: 'Erreur',
    referenceDoc: null,
    expenseId: null,
    creditNoteId: null,
    paymentMethod: null,
    userId: 'cashier-1',
    user: {
      id: 'cashier-1',
      fullName: 'Caissier',
      email: 'cashier@test.local',
    },
    createdAt,
    clearedAt: null,
    clearedBy: null,
    isManualAdjustment: true,
    deletedAt: null,
    deletedById: null,
    deletionReason: null,
    ...overrides,
  };
}

function buildService(
  target = movement(),
  following: ReturnType<typeof movement>[] = [],
) {
  const configState = {
    id: 'cfg-1',
    solde: D(3600),
    soldeBanque: D(1200),
    allowNegative: false,
    allowNegativeBanque: false,
  };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'admin-1',
        fullName: 'Admin Principal',
        email: 'admin@test.local',
      }),
    },
    caisseMovement: {
      findUnique: jest.fn().mockResolvedValue(target),
      findMany: jest.fn().mockResolvedValue(following),
      update: jest.fn().mockResolvedValue({}),
    },
    caisseConfig: {
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve(configState)),
      update: jest.fn().mockImplementation(({ data }) => {
        Object.assign(configState, data);
        return Promise.resolve(configState);
      }),
      create: jest.fn(),
    },
  };
  const prisma: any = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const auditLogs = { audit: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new CaisseService(
    prisma,
    {} as any,
    {} as any,
    auditLogs,
    {} as any,
  );
  return { service, prisma, tx, auditLogs, configState };
}

describe('CaisseService.deleteMovement', () => {
  it.each([CaisseMovementType.DEPOT_MANUEL, CaisseMovementType.RETRAIT_MANUEL])(
    'un ADMIN peut supprimer un mouvement manuel %s',
    async (type) => {
      const { service, tx } = buildService(movement({ type }));
      await expect(
        service.deleteMovement('movement-b', 'Erreur de saisie', 'admin-1'),
      ).resolves.toEqual(expect.objectContaining({ movementId: 'movement-b' }));
      expect(tx.caisseMovement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'movement-b' },
          data: expect.objectContaining({
            deletedById: 'admin-1',
            deletionReason: 'Erreur de saisie',
          }),
        }),
      );
    },
  );

  it.each([
    CaisseMovementType.ENCAISSEMENT_VENTE,
    CaisseMovementType.DECAISSEMENT_ACHAT,
  ])('refuse un mouvement métier %s', async (type) => {
    const { service } = buildService(
      movement({ type, isManualAdjustment: false }),
    );
    await expect(
      service.deleteMovement('movement-b', 'Erreur', 'admin-1'),
    ).rejects.toThrow('opération métier');
  });

  it('exige un motif non vide', async () => {
    const { service, prisma } = buildService();
    await expect(
      service.deleteMovement('movement-b', '   ', 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retourne un conflit si le mouvement est déjà supprimé', async () => {
    const { service } = buildService(movement({ deletedAt: new Date() }));
    await expect(
      service.deleteMovement('movement-b', 'Doublon', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recalcule les soldes suivants par ordre chronologique et le solde global', async () => {
    const next = movement({
      id: 'movement-c',
      montant: D(100),
      ancienSolde: D(3500),
      nouveauSolde: D(3600),
      createdAt: new Date('2026-07-30T11:00:00.000Z'),
    });
    const { service, tx } = buildService(movement(), [next]);
    const result = await service.deleteMovement(
      'movement-b',
      'Montant incorrect',
      'admin-1',
    );

    expect(tx.caisseMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(tx.caisseMovement.update).toHaveBeenCalledWith({
      where: { id: 'movement-c' },
      data: expect.objectContaining({
        ancienSolde: D(3000),
        nouveauSolde: D(3100),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        soldeCaisse: 3100,
        soldeBanque: 1200,
        soldeGlobal: 4300,
      }),
    );
  });

  it('journalise le snapshot complet, le motif, l’administrateur et l’IP', async () => {
    const { service, auditLogs } = buildService();
    await service.deleteMovement(
      'movement-b',
      'Mouvement créé en double',
      'admin-1',
      {
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    );
    expect(auditLogs.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CASH_MOVEMENT_DELETED',
        entityId: 'movement-b',
        userId: 'admin-1',
        userName: 'Admin Principal',
        oldValue: expect.objectContaining({
          id: 'movement-b',
          montant: '500',
          ancienSolde: '3000',
          nouveauSolde: '3500',
        }),
        metadata: expect.objectContaining({
          deletionReason: 'Mouvement créé en double',
        }),
        ipAddress: '127.0.0.1',
      }),
      expect.anything(),
    );
  });

  it('propage un échec de recalcul afin que la transaction PostgreSQL fasse rollback', async () => {
    const incompatible = movement({
      id: 'legacy-x',
      type: 'LEGACY_UNKNOWN',
      createdAt: new Date('2026-07-30T12:00:00.000Z'),
    });
    const { service, auditLogs } = buildService(movement(), [incompatible]);
    await expect(
      service.deleteMovement('movement-b', 'Erreur', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(auditLogs.audit).not.toHaveBeenCalled();
  });
});
