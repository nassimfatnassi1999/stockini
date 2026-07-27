import { AlertsService } from './alerts.service';

describe('AlertsService bulk deletion', () => {
  it.each([0, 248])(
    'supprime toutes les alertes et retourne deletedCount=%i',
    async (count) => {
      const tx = {
        alert: { deleteMany: jest.fn().mockResolvedValue({ count }) },
      };
      const transaction = async <T>(
        callback: (client: typeof tx) => Promise<T>,
      ): Promise<T> => callback(tx);
      const prisma = { $transaction: jest.fn(transaction) };
      const service = new AlertsService(
        prisma as never,
        {} as never,
        { lockAlerts: jest.fn().mockResolvedValue(0) } as never,
      );

      await expect(service.removeAll()).resolves.toEqual({
        success: true,
        deletedCount: count,
      });
      expect(tx.alert.deleteMany).toHaveBeenCalledWith();
    },
  );
});
