import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { BackupStorageService } from './backup-storage.service';

describe('BackupStorageService', () => {
  let directory: string;
  let service: BackupStorageService;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'stockini-backups-'));
    service = new BackupStorageService(
      new ConfigService({ BACKUP_DIRECTORY: directory }),
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('resolves and reads a local VPS-style backup', async () => {
    const filename = 'backup-2026-07-03-12-30-01-123.zip';
    await writeFile(path.join(directory, filename), Buffer.from('zip'));

    await expect(service.read(filename)).resolves.toEqual(Buffer.from('zip'));
    await expect(service.resolveExisting(filename)).resolves.toBe(
      path.join(directory, filename),
    );
  });

  it.each(['../backup-2026-07-03-12-30.zip', 'folder/backup-2026-07-03-12-30.zip', 'backup.sql']) (
    'rejects unsafe filename %s',
    async (filename) => {
      await expect(service.resolveExisting(filename)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('returns an explicit not-found error', async () => {
    await expect(
      service.resolveExisting('backup-2026-07-03-12-30.zip'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
