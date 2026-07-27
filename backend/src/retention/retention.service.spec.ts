import { RetentionService } from './retention.service';

type RawCall = [TemplateStringsArray, ...unknown[]];

function sqlText(call: RawCall): string {
  const query = call[0] as { strings?: string[] } | string[];
  return Array.from('strings' in query ? (query.strings ?? []) : query).join(
    '?',
  );
}

describe('RetentionService', () => {
  function setup(deletedCount = 0) {
    const rawCalls: RawCall[] = [];
    const executeRaw = jest.fn(
      (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<number> => {
        rawCalls.push([strings, ...values]);
        return Promise.resolve(rawCalls.length === 1 ? 0 : deletedCount);
      },
    );
    const tx = {
      $executeRaw: executeRaw,
    };
    const transaction = async <T>(
      callback: (client: typeof tx) => Promise<T>,
    ): Promise<T> => callback(tx);
    const prisma = {
      $transaction: jest.fn(transaction),
    };
    return {
      service: new RetentionService(prisma as never),
      prisma,
      tx,
      rawCalls,
    };
  }

  it.each([
    ['table vide', 0],
    ['exactement 1000 lignes', 0],
    ['1001 lignes', 1],
    ['1035 lignes', 35],
  ])('retourne le surplus supprimé — %s', async (_case, deletedCount) => {
    const { service, tx } = setup(deletedCount);
    await expect(service.cleanupOldAlerts()).resolves.toBe(deletedCount);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('conserve les 1000 plus récentes avec un ordre déterministe', async () => {
    const { service, rawCalls } = setup(35);
    await service.cleanupOldAuditLogs();
    const deleteSql = sqlText(rawCalls[1]);
    expect(deleteSql).toContain('ORDER BY "createdAt" DESC, "id" DESC');
    expect(deleteSql).toContain('OFFSET ?');
  });

  it('est idempotent lorsqu’il est relancé', async () => {
    const executeRaw = jest.fn((): Promise<number> => Promise.resolve(0));
    executeRaw.mockResolvedValue(0);
    const tx = { $executeRaw: executeRaw };
    const transaction = async <T>(
      callback: (client: typeof tx) => Promise<T>,
    ): Promise<T> => callback(tx);
    const prisma = { $transaction: jest.fn(transaction) };
    const service = new RetentionService(prisma as never);
    await expect(service.cleanupOldAlerts()).resolves.toBe(0);
    await expect(service.cleanupOldAlerts()).resolves.toBe(0);
  });

  it('prend un advisory lock avant chaque suppression concurrente', async () => {
    const first = setup(1);
    const second = setup(1);
    await Promise.all([
      first.service.cleanupOldAuditLogs(),
      second.service.cleanupOldAuditLogs(),
    ]);
    expect(sqlText(first.rawCalls[0])).toContain('pg_advisory_xact_lock');
    expect(sqlText(second.rawCalls[0])).toContain('pg_advisory_xact_lock');
  });
});
