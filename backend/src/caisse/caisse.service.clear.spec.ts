import { CaisseMovementType } from '@prisma/client';
import { CaisseService } from './caisse.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildService(countResult = 5) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    caisseMovement: {
      count: jest.fn().mockResolvedValue(countResult),
      updateMany: jest.fn().mockResolvedValue({ count: countResult }),
    },
    historyClearLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
    caisseConfig: { findFirst: jest.fn().mockResolvedValue({ id: 'cfg', solde: 1000 }) },
  };
  const references = {} as any;
  const customers = { getTotalClientDebt: jest.fn() } as any;
  const auditLogs = { create: jest.fn(), audit: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new CaisseService(prisma, references, customers, auditLogs);
  return { service, prisma };
}

// ─── Tests clearHistory ────────────────────────────────────────────────────────

describe('CaisseService.clearHistory', () => {
  it('retourne le nombre de lignes masquées', async () => {
    const { service } = buildService(7);
    const result = await service.clearHistory({}, 'admin-1');
    expect(result.count).toBe(7);
  });

  it('applique updateMany avec clearedAt et clearedBy', async () => {
    const { service, prisma } = buildService(3);
    await service.clearHistory({}, 'admin-1');

    expect(prisma.caisseMovement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clearedAt: null }),
        data: expect.objectContaining({ clearedBy: 'admin-1' }),
      }),
    );
  });

  it('ne touche pas aux lignes déjà cleared (count=0 → pas de updateMany)', async () => {
    const { service, prisma } = buildService(0);
    await service.clearHistory({}, 'admin-1');
    expect(prisma.caisseMovement.updateMany).not.toHaveBeenCalled();
  });

  it('ne modifie pas le solde CaisseConfig', async () => {
    const { service, prisma } = buildService(3);
    await service.clearHistory({}, 'admin-1');
    expect(prisma.caisseConfig.findFirst).not.toHaveBeenCalled();
  });

  it('filtre par type si fourni', async () => {
    const { service, prisma } = buildService(2);
    await service.clearHistory({ type: CaisseMovementType.DEPOT_MANUEL }, 'admin-1');

    expect(prisma.caisseMovement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: CaisseMovementType.DEPOT_MANUEL }),
      }),
    );
  });

  it('filtre par plage de dates si dateFrom / dateTo fournis', async () => {
    const { service, prisma } = buildService(2);
    await service.clearHistory({ dateFrom: '2026-01-01', dateTo: '2026-06-01' }, 'admin-1');

    const callWhere = prisma.caisseMovement.updateMany.mock.calls[0][0].where;
    expect(callWhere.createdAt).toBeDefined();
    expect(callWhere.createdAt.gte).toBeInstanceOf(Date);
    expect(callWhere.createdAt.lte).toBeInstanceOf(Date);
  });

  it('crée un HistoryClearLog avec module=caisse_movements', async () => {
    const { service, prisma } = buildService(4);
    await service.clearHistory({}, 'admin-99');

    expect(prisma.historyClearLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ module: 'caisse_movements', userId: 'admin-99', count: 4 }),
      }),
    );
  });

  it('data.updateMany ne contient PAS montant, ancienSolde, nouveauSolde', async () => {
    const { service, prisma } = buildService(3);
    await service.clearHistory({}, 'admin-1');

    const callData = prisma.caisseMovement.updateMany.mock.calls[0][0].data;
    expect(Object.keys(callData)).not.toContain('montant');
    expect(Object.keys(callData)).not.toContain('ancienSolde');
    expect(Object.keys(callData)).not.toContain('nouveauSolde');
  });
});
