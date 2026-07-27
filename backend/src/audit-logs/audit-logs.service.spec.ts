import { AuditLogsService } from './audit-logs.service';

describe('AuditLogsService deletion and retention', () => {
  it.each([0, 248])(
    'purge la table et retourne deletedCount=%i sans recréer de log',
    async (count) => {
      const tx = {
        auditLog: {
          deleteMany: jest.fn().mockResolvedValue({ count }),
          create: jest.fn(),
        },
      };
      const transaction = async <T>(
        callback: (client: typeof tx) => Promise<T>,
      ): Promise<T> => callback(tx);
      const prisma = { $transaction: jest.fn(transaction) };
      const retention = {
        cleanupOldAuditLogs: jest.fn(),
        lockAuditLogs: jest.fn().mockResolvedValue(0),
      };
      const service = new AuditLogsService(prisma as never, retention as never);

      await expect(
        service.removeAll({ id: 'admin-1', email: 'admin@example.test' }),
      ).resolves.toEqual({ success: true, deletedCount: count });
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(retention.cleanupOldAuditLogs).not.toHaveBeenCalled();
      expect(retention.lockAuditLogs).toHaveBeenCalledWith(tx);
    },
  );

  it('nettoie une fois après la création, sans créer récursivement un audit', async () => {
    const prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    };
    const retention = { cleanupOldAuditLogs: jest.fn().mockResolvedValue(1) };
    const service = new AuditLogsService(prisma as never, retention as never);

    await service.audit({ action: 'test.created', entity: 'Test' });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(retention.cleanupOldAuditLogs).toHaveBeenCalledTimes(1);
  });
});
