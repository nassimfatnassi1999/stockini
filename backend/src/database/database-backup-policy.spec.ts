import { BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { createHash } from 'crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DATABASE_BACKUP_TYPE,
  DATABASE_BACKUP_VERSION,
  DatabaseService,
} from './database.service';

type ObjectStore = Map<string, Buffer>;

describe('DatabaseService full PostgreSQL + MinIO backups', () => {
  let directory: string;
  let service: DatabaseService;
  let objects: ObjectStore;
  let minio: {
    bucket: string;
    bucketExists: jest.Mock;
    ensureBucketOrThrow: jest.Mock;
    listAllObjects: jest.Mock;
    getObject: jest.Mock;
    putObject: jest.Mock;
    removeObject: jest.Mock;
  };

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'stockini-full-backup-'));
    objects = new Map([
      ['invoices/2026/facture-1.pdf', Buffer.from('pdf-one')],
      ['credit-notes/avoir-1.pdf', Buffer.from('pdf-two')],
    ]);
    minio = {
      bucket: 'generated-documents',
      bucketExists: jest.fn().mockResolvedValue(true),
      ensureBucketOrThrow: jest.fn().mockResolvedValue(undefined),
      listAllObjects: jest
        .fn()
        .mockImplementation(() => Promise.resolve([...objects.keys()])),
      getObject: jest
        .fn()
        .mockImplementation((_bucket: string, key: string) =>
          Promise.resolve(Buffer.from(objects.get(key) ?? Buffer.alloc(0))),
        ),
      putObject: jest
        .fn()
        .mockImplementation(
          (_bucket: string, key: string, buffer: Buffer, _mime: string) => {
            objects.set(key, Buffer.from(buffer));
            return Promise.resolve();
          },
        ),
      removeObject: jest
        .fn()
        .mockImplementation((_bucket: string, key: string) => {
          objects.delete(key);
          return Promise.resolve();
        }),
    };

    service = Object.create(DatabaseService.prototype) as DatabaseService;
    Object.assign(service, {
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      restoreInProgress: false,
      backupInProgress: false,
      minio,
      backupStorage: {
        directory,
        ensureAccessible: jest.fn().mockResolvedValue(undefined),
        destination: jest.fn((filename: string) =>
          Promise.resolve(path.join(directory, filename)),
        ),
      },
      prisma: {
        $queryRawUnsafe: jest
          .fn()
          .mockResolvedValue([{ server_version: '16.4' }]),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        $connect: jest.fn().mockResolvedValue(undefined),
      },
      audit: { create: jest.fn().mockResolvedValue(undefined) },
      assertDatabaseReachable: jest.fn().mockResolvedValue(undefined),
      assertBackupDiskSpace: jest.fn().mockResolvedValue(undefined),
      dumpPostgres: jest.fn((outputPath: string) =>
        writeFileSync(outputPath, Buffer.from('PGDMP-test-database')),
      ),
      getPostgresConnection: jest.fn(() => ({
        host: 'postgres',
        port: '5432',
        user: 'stockini',
        password: 'not-logged',
        database: 'stockini',
      })),
      commandVersion: jest.fn(() => 'pg_dump (PostgreSQL) 16.4'),
      applyBackupRetention: jest.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates and verifies a complete ZIP while preserving object paths', async () => {
    const result = await service.createDatabaseBackup();
    const zip = new AdmZip(result.path);
    const names = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.entryName)
      .sort();
    const manifest = JSON.parse(
      zip.getEntry('manifest.json')!.getData().toString('utf8'),
    ) as {
      backupVersion: number;
      type: string;
      databaseName: string;
      minioFileCount: number;
      minioSizeBytes: number;
      totalSizeBytes: number;
      containsDatabase: boolean;
      containsMinio: boolean;
    };

    expect(names).toEqual([
      'database/postgres.dump',
      'manifest.json',
      'minio/generated-documents/credit-notes/avoir-1.pdf',
      'minio/generated-documents/invoices/2026/facture-1.pdf',
    ]);
    expect(manifest).toMatchObject({
      backupVersion: DATABASE_BACKUP_VERSION,
      type: DATABASE_BACKUP_TYPE,
      databaseName: 'stockini',
      minioFileCount: 2,
      containsDatabase: true,
      containsMinio: true,
    });
    expect(manifest.minioSizeBytes).toBeGreaterThan(0);
    expect(manifest.totalSizeBytes).toBeGreaterThan(manifest.minioSizeBytes);
    expect(result.containsMinio).toBe(true);
  });

  it('creates a valid backup when the MinIO bucket is empty', async () => {
    objects.clear();
    const result = await service.createDatabaseBackup();
    const zip = new AdmZip(result.path);
    const manifest = JSON.parse(
      zip.getEntry('manifest.json')!.getData().toString('utf8'),
    ) as { minioFileCount: number; minioSizeBytes: number };

    expect(zip.getEntry('minio/generated-documents/')).not.toBeNull();
    expect(manifest.minioFileCount).toBe(0);
    expect(manifest.minioSizeBytes).toBe(0);
  });

  it('publishes no ZIP and cleans temporary files when PostgreSQL fails', async () => {
    Object.assign(service, {
      dumpPostgres: jest.fn(() => {
        throw new Error('postgres unavailable');
      }),
    });
    const before = new Set(
      readdirSync(os.tmpdir()).filter((name) => name.startsWith('backup-')),
    );

    await expect(service.createDatabaseBackup()).rejects.toThrow(
      'postgres unavailable',
    );

    const leaked = readdirSync(os.tmpdir()).filter(
      (name) => name.startsWith('backup-') && !before.has(name),
    );
    expect(leaked).toEqual([]);
    expect(
      readdirSync(directory).filter((name) => name.endsWith('.zip')),
    ).toEqual([]);
  });

  it('publishes no ZIP when one MinIO object cannot be downloaded', async () => {
    minio.getObject.mockRejectedValueOnce(new Error('S3 timeout'));

    await expect(service.createDatabaseBackup()).rejects.toThrow(
      'Sauvegarde MinIO impossible',
    );
    expect(
      readdirSync(directory).filter((name) => name.endsWith('.zip')),
    ).toEqual([]);
  });

  it('restores PostgreSQL and replaces MinIO from a validated full archive', async () => {
    const backup = await service.createDatabaseBackup();
    const archive = readFileSync(backup.path);
    objects.clear();
    objects.set('stale.pdf', Buffer.from('stale'));
    Object.assign(service, {
      preparePostgresForRestore: jest.fn(),
      restorePostgres: jest.fn(),
      deployCurrentMigrations: jest.fn(),
      validateRestoredDatabase: jest.fn().mockResolvedValue(undefined),
    });

    const result = await service.restoreDatabaseBackup(archive);

    expect(result.backupType).toBe(DATABASE_BACKUP_TYPE);
    expect(result.containsMinio).toBe(true);
    expect(objects.has('stale.pdf')).toBe(false);
    expect(objects.get('invoices/2026/facture-1.pdf')).toEqual(
      Buffer.from('pdf-one'),
    );
    expect(result.restored).toContain('minio/generated-documents/');
  });

  it('rolls back PostgreSQL and MinIO when the MinIO restore fails', async () => {
    const backup = await service.createDatabaseBackup();
    const archive = readFileSync(backup.path);
    objects.clear();
    objects.set('stale.pdf', Buffer.from('state-before-restore'));
    minio.putObject.mockRejectedValueOnce(new Error('S3 write failed'));
    const restorePostgres = jest.fn();
    Object.assign(service, {
      preparePostgresForRestore: jest.fn(),
      restorePostgres,
      deployCurrentMigrations: jest.fn(),
      validateRestoredDatabase: jest.fn().mockResolvedValue(undefined),
    });

    await expect(service.restoreDatabaseBackup(archive)).rejects.toThrow(
      'S3 write failed',
    );

    expect(restorePostgres).toHaveBeenCalledTimes(2);
    expect([...objects.keys()]).toEqual(['stale.pdf']);
    expect(objects.get('stale.pdf')).toEqual(
      Buffer.from('state-before-restore'),
    );
  });

  it('fails before pg_dump when the PostgreSQL client major differs', async () => {
    Object.assign(service, {
      commandVersion: jest.fn(() => 'pg_dump (PostgreSQL) 18.4'),
    });
    const dumpPostgres = (service as unknown as { dumpPostgres: jest.Mock })
      .dumpPostgres;

    await expect(service.createDatabaseBackup()).rejects.toThrow(
      'serveur 16, pg_dump 18',
    );
    expect(dumpPostgres).not.toHaveBeenCalled();
  });

  it('refuses a corrupt manifest before any PostgreSQL mutation', async () => {
    const backup = await service.createDatabaseBackup();
    const zip = new AdmZip(backup.path);
    const manifest = JSON.parse(
      zip.getEntry('manifest.json')!.getData().toString('utf8'),
    ) as { checksums: Record<string, string> };
    manifest.checksums['database/postgres.dump'] = '0'.repeat(64);
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
    const preparePostgresForRestore = jest.fn();
    Object.assign(service, { preparePostgresForRestore });

    await expect(
      service.restoreDatabaseBackup(zip.toBuffer()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(preparePostgresForRestore).not.toHaveBeenCalled();
  });

  it('refuses invalid ZIP data', async () => {
    await expect(
      service.restoreDatabaseBackup(Buffer.from('not-a-zip')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses path traversal entries', () => {
    const zip = new AdmZip();
    zip.addFile('../outside.txt', Buffer.from('bad'));
    const rawZip = zip.toBuffer();
    const loaded = new AdmZip(rawZip);
    const internals = service as unknown as {
      assertSafeBackupEntries(candidate: AdmZip): void;
    };

    expect(() => internals.assertSafeBackupEntries(loaded)).toThrow(
      BadRequestException,
    );
    expect(existsSync(path.join(directory, 'outside.txt'))).toBe(false);
  });

  it('detects a checksum mismatch for a MinIO object', async () => {
    const backup = await service.createDatabaseBackup();
    const zip = new AdmZip(backup.path);
    zip.updateFile(
      'minio/generated-documents/invoices/2026/facture-1.pdf',
      Buffer.from('tampered'),
    );
    const preparePostgresForRestore = jest.fn();
    Object.assign(service, { preparePostgresForRestore });

    await expect(service.restoreDatabaseBackup(zip.toBuffer())).rejects.toThrow(
      'Checksum SHA-256 invalide',
    );
    expect(preparePostgresForRestore).not.toHaveBeenCalled();
  });

  it('uses SHA-256 checksums in the generated manifest', async () => {
    const backup = await service.createDatabaseBackup();
    const zip = new AdmZip(backup.path);
    const dump = zip.getEntry('database/postgres.dump')!.getData();
    const manifest = JSON.parse(
      zip.getEntry('manifest.json')!.getData().toString('utf8'),
    ) as { checksumAlgorithm: string; checksums: Record<string, string> };

    expect(manifest.checksumAlgorithm).toBe('sha256');
    expect(manifest.checksums['database/postgres.dump']).toBe(
      createHash('sha256').update(dump).digest('hex'),
    );
  });
});
