import { DatabaseService, MAX_BACKUPS, type BackupInfo } from './database.service';

describe('DatabaseService backup retention', () => {
  const backup = (position: number): BackupInfo => ({
    filename: `backup-2026-07-0${position}-02-00-00.zip`,
    size: position,
    createdAt: new Date(Date.UTC(2026, 6, position, 2)).toISOString(),
    createdBy: 'system',
    type: 'full',
    path: `/backups/backup-${position}.zip`,
    status: 'valid',
  });

  function makeService(backups: BackupInfo[]) {
    const remove = jest.fn().mockResolvedValue(undefined);
    const service = Object.create(DatabaseService.prototype) as DatabaseService;

    Object.assign(service, {
      backupStorage: { remove },
      logger: { log: jest.fn(), error: jest.fn() },
    });
    jest.spyOn(service, 'listBackups').mockResolvedValue(backups);

    return { service, remove };
  }

  it(`keeps the ${MAX_BACKUPS} newest backups and deletes all older ones`, async () => {
    const backups = [7, 6, 5, 4, 3, 2, 1].map(backup);
    const { service, remove } = makeService(backups);

    await (service as unknown as { applyBackupRetention(): Promise<void> })
      .applyBackupRetention();

    expect(remove.mock.calls.map(([filename]) => filename)).toEqual(
      backups.slice(MAX_BACKUPS).map(({ filename }) => filename),
    );
  });

  it('does not reject when deleting an expired backup fails', async () => {
    const backups = [4, 3, 2, 1].map(backup);
    const { service, remove } = makeService(backups);
    remove.mockRejectedValueOnce(new Error('permission denied'));

    await expect(
      (service as unknown as { applyBackupRetention(): Promise<void> })
        .applyBackupRetention(),
    ).resolves.toBeUndefined();
  });
});
