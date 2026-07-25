import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { BackupStorageService } from './backup-storage.service';
import { IndependentExportsService } from './independent-exports.service';

describe('IndependentExportsService', () => {
  let root: string;
  let service: IndependentExportsService;
  let audit: { create: jest.Mock };
  let prisma: {
    $disconnect: jest.Mock;
    $connect: jest.Mock;
    $queryRaw: jest.Mock;
    generatedDocument: { findMany: jest.Mock };
  };
  let minio: {
    bucket: string;
    bucketExists: jest.Mock;
    listAllObjects: jest.Mock;
    getObject: jest.Mock;
    statObject: jest.Mock;
    ensureBucketOrThrow: jest.Mock;
    removeObject: jest.Mock;
    putObjectWithMetadata: jest.Mock;
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'stockini-independent-'));
    const config = new ConfigService({
      BACKUP_DIRECTORY: root,
      MINIO_BUCKETS: 'documents,attachments',
    });
    audit = { create: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      $disconnect: jest.fn().mockResolvedValue(undefined),
      $connect: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { table_name: 'User' },
          { table_name: 'Product' },
          { table_name: 'Sale' },
          { table_name: '_prisma_migrations' },
        ]),
      generatedDocument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    minio = {
      bucket: 'documents',
      bucketExists: jest.fn().mockResolvedValue(true),
      listAllObjects: jest
        .fn()
        .mockImplementation((bucket: string) =>
          Promise.resolve(
            bucket === 'documents'
              ? ['clients/123/factures/FAC-2026-001.pdf']
              : ['images/logo.png'],
          ),
        ),
      getObject: jest
        .fn()
        .mockImplementation((_bucket: string, key: string) =>
          Promise.resolve(Buffer.from(`content:${key}`)),
        ),
      statObject: jest.fn().mockResolvedValue({
        size: 10,
        contentType: 'application/octet-stream',
        metaData: { owner: 'stockini' },
      }),
      ensureBucketOrThrow: jest.fn().mockResolvedValue(undefined),
      removeObject: jest.fn().mockResolvedValue(undefined),
      putObjectWithMetadata: jest.fn().mockResolvedValue(undefined),
    };
    const storage = new BackupStorageService(config);
    service = new IndependentExportsService(
      config,
      prisma as never,
      minio as never,
      audit as never,
      storage,
    );
    service.onModuleInit();
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const validDump = (target: string, suffix = 'valid') =>
    writeFileSync(target, Buffer.from(`PGDMP-${suffix}`));

  it('creates and atomically replaces the single PostgreSQL dump', async () => {
    jest
      .spyOn(service as never, 'runPgDump' as never)
      .mockImplementation((target: string) => validDump(target, 'new'));

    const result = await service.createPostgresExport('MANUAL');
    const file = service.postgresDownloadPath();

    expect(result.filename).toBe('stockini-postgresql-latest.dump');
    expect(readFileSync(file).toString()).toBe('PGDMP-new');
    expect(service.listPostgresExports()).toHaveLength(1);
  });

  it('keeps the last valid PostgreSQL dump when replacement fails', async () => {
    const destination = path.join(
      root,
      'postgresql',
      'stockini-postgresql-latest.dump',
    );
    validDump(destination, 'old');
    jest
      .spyOn(service as never, 'runPgDump' as never)
      .mockImplementation(() => {
        throw new Error('failure containing password=secret');
      });

    await expect(service.createPostgresExport('MANUAL')).rejects.toThrow(
      'La création du dump PostgreSQL a échoué.',
    );
    expect(readFileSync(destination).toString()).toBe('PGDMP-old');
  });

  it('rejects two concurrent PostgreSQL exports', async () => {
    (service as unknown as { postgresBusy: boolean }).postgresBusy = true;
    await expect(
      service.createPostgresExport('SCHEDULED'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('exports several MinIO buckets with exact keys and checksums', async () => {
    const manifest = await service.createMinioExport();
    const zip = new AdmZip(service.minioDownloadPath());

    expect(manifest.buckets).toEqual(['documents', 'attachments']);
    expect(manifest.objectCount).toBe(2);
    expect(
      zip.getEntry('objects/documents/clients/123/factures/FAC-2026-001.pdf'),
    ).not.toBeNull();
    expect(
      manifest.objects.every((object) => object.checksumSha256.length === 64),
    ).toBe(true);
  });

  it('rejects a corrupt or non-Stockini MinIO ZIP', async () => {
    const file = path.join(root, 'bad.zip');
    const zip = new AdmZip();
    zip.addFile('other.txt', Buffer.from('x'));
    zip.writeZip(file);

    await expect(service.importMinio(file, 'bad.zip')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects Zip Slip paths before any MinIO restoration', async () => {
    const file = path.join(root, 'zip-slip.zip');
    const zip = new AdmZip();
    zip.addFile('../outside.txt', Buffer.from('bad'));
    zip.writeZip(file);

    await expect(
      service.importMinio(file, 'zip-slip.zip'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(minio.putObjectWithMetadata).not.toHaveBeenCalled();
  });

  it('restores exact MinIO keys in merge mode', async () => {
    await service.createMinioExport();
    const result = await service.restoreMinio('server', 'MERGE', 'RESTAURER');

    expect(result.restored).toBe(2);
    expect(minio.removeObject).not.toHaveBeenCalled();
    expect(minio.putObjectWithMetadata).toHaveBeenCalledWith(
      'documents',
      'clients/123/factures/FAC-2026-001.pdf',
      expect.any(Buffer),
      'application/octet-stream',
      { owner: 'stockini' },
    );
  });

  it('creates a PostgreSQL safety dump before a successful restore', async () => {
    const destination = path.join(
      root,
      'postgresql',
      'stockini-postgresql-latest.dump',
    );
    validDump(destination, 'source');
    const dump = jest
      .spyOn(service as never, 'runPgDump' as never)
      .mockImplementation((target: string) => validDump(target, 'safety'));
    const restore = jest
      .spyOn(service as never, 'runPgRestore' as never)
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as never, 'deployCurrentMigrations' as never)
      .mockImplementation(() => undefined);

    const result = await service.restorePostgres('server', 'RESTAURER');

    expect(dump.mock.invocationCallOrder[0]).toBeLessThan(
      restore.mock.invocationCallOrder[0],
    );
    expect(result.checks).toContain('critical-tables');
  });
});
