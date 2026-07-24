import AdmZip from 'adm-zip';
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DATABASE_BACKUP_TYPE,
  DATABASE_BACKUP_VERSION,
  DatabaseService,
} from './database.service';

describe('DatabaseService DATABASE_ONLY policy', () => {
  let directory: string;
  let service: DatabaseService;

  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'stockini-db-policy-'));
    service = Object.create(DatabaseService.prototype) as DatabaseService;
    Object.assign(service, {
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const manifestFor = (dump: Buffer) => ({
    backupVersion: DATABASE_BACKUP_VERSION,
    type: DATABASE_BACKUP_TYPE,
    createdAt: new Date().toISOString(),
    applicationVersion: 'test',
    postgresServerVersion: '16',
    pgDumpVersion: '16',
    databaseFormat: 'custom',
    databaseFile: 'database.dump',
    containsDatabase: true,
    containsMinio: false,
    containsGeneratedDocuments: false,
    documentsMustBeRegenerated: true,
    prismaMigrationCount: 1,
    schemaFingerprint: 'test',
    checksumAlgorithm: 'sha256',
    checksums: {
      'database.dump': createHash('sha256').update(dump).digest('hex'),
    },
  });

  it('creates a ZIP containing only database.dump and backup-manifest.json', () => {
    const dumpPath = path.join(directory, 'database.dump');
    const manifestPath = path.join(directory, 'backup-manifest.json');
    const zipPath = path.join(directory, 'backup.zip');
    const dump = Buffer.from('PGDMP-test-database');
    writeFileSync(dumpPath, dump);
    writeFileSync(manifestPath, JSON.stringify(manifestFor(dump)));

    const internals = service as unknown as {
      createDatabaseZip(
        dumpPath: string,
        manifestPath: string,
        zipPath: string,
      ): void;
      validateDatabaseZip(zipPath: string): void;
    };
    internals.createDatabaseZip(dumpPath, manifestPath, zipPath);
    expect(() => internals.validateDatabaseZip(zipPath)).not.toThrow();

    const entries = new AdmZip(zipPath)
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.entryName)
      .sort();
    expect(entries).toEqual(['backup-manifest.json', 'database.dump']);
    expect(entries.some((name) => name.startsWith('minio/'))).toBe(false);
  });

  it('does not call MinIO while creating a database backup', async () => {
    const dump = Buffer.from('PGDMP-live-policy-test');
    const minio = {
      listAllObjects: jest.fn(),
      getObject: jest.fn(),
      putObject: jest.fn(),
      removeObject: jest.fn(),
    };
    const destination = path.join(
      directory,
      'backup-2026-07-24-07-30-00-000.zip',
    );
    Object.assign(service, {
      restoreInProgress: false,
      backupInProgress: false,
      minio,
      backupStorage: {
        directory,
        ensureAccessible: jest.fn(),
        destination: jest.fn().mockResolvedValue(destination),
      },
      audit: { create: jest.fn() },
      assertDatabaseReachable: jest.fn(),
      assertBackupDiskSpace: jest.fn(),
      dumpPostgres: jest.fn((outputPath: string) =>
        writeFileSync(outputPath, dump),
      ),
      createBackupManifest: jest.fn().mockResolvedValue(manifestFor(dump)),
      applyBackupRetention: jest.fn(),
    });

    const result = await service.createDatabaseBackup();
    const names = new AdmZip(destination)
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.entryName)
      .sort();

    expect(result.backupType).toBe(DATABASE_BACKUP_TYPE);
    expect(names).toEqual(['backup-manifest.json', 'database.dump']);
    expect(minio.listAllObjects).not.toHaveBeenCalled();
    expect(minio.getObject).not.toHaveBeenCalled();
    expect(minio.putObject).not.toHaveBeenCalled();
    expect(minio.removeObject).not.toHaveBeenCalled();
  });

  it('ignores legacy MinIO payloads during restore', async () => {
    const legacyZip = new AdmZip();
    legacyZip.addFile('database/dump.sql', Buffer.from('SELECT 1;'));
    legacyZip.addFile('manifest.json', Buffer.from('{}'));
    legacyZip.addFile('minio/documents/invoice.pdf', Buffer.from('pdf'));
    const minio = {
      listAllObjects: jest.fn(),
      getObject: jest.fn(),
      putObject: jest.fn(),
      removeObject: jest.fn(),
    };
    Object.assign(service, {
      restoreInProgress: false,
      backupInProgress: false,
      minio,
      backupStorage: {
        directory,
        ensureAccessible: jest.fn(),
      },
      prisma: {
        $disconnect: jest.fn(),
        $connect: jest.fn(),
      },
      audit: { create: jest.fn() },
      dumpPostgres: jest.fn((outputPath: string) =>
        writeFileSync(outputPath, Buffer.from('PGDMP-safety')),
      ),
      preparePostgresForRestore: jest.fn(),
      restorePostgres: jest.fn(),
      deployCurrentMigrations: jest.fn(),
      validateRestoredDatabase: jest.fn(),
    });

    const result = await service.restoreDatabaseBackup(
      legacyZip.toBuffer(),
      undefined,
      { uploadedFilename: 'legacy.zip' },
    );

    expect(result.ignoredLegacyFiles).toBe(true);
    expect(result.containsMinio).toBe(false);
    expect(minio.listAllObjects).not.toHaveBeenCalled();
    expect(minio.getObject).not.toHaveBeenCalled();
    expect(minio.putObject).not.toHaveBeenCalled();
    expect(minio.removeObject).not.toHaveBeenCalled();
  });

  it('accepts legacy MinIO folders but selects only the database payload', () => {
    const zip = new AdmZip();
    zip.addFile('database/dump.sql', Buffer.from('SELECT 1;'));
    zip.addFile('manifest.json', Buffer.from('{}'));
    zip.addFile('minio/documents/invoice.pdf', Buffer.from('pdf'));

    const internals = service as unknown as {
      assertSafeBackupEntries(zip: AdmZip): void;
      findDatabaseDumpEntry(zip: AdmZip): { entryName: string } | null;
    };
    expect(() => internals.assertSafeBackupEntries(zip)).not.toThrow();
    expect(internals.findDatabaseDumpEntry(zip)?.entryName).toBe(
      'database/dump.sql',
    );
  });

  it('removes only legacy transaction_timeout before a plain SQL restore', () => {
    const dumpPath = path.join(directory, 'dump.sql');
    writeFileSync(
      dumpPath,
      'SET statement_timeout = 0;\nSET transaction_timeout = 0;\nSELECT 1;\n',
    );
    const runPostgresCommand = jest
      .fn()
      .mockReturnValue({ status: 0, stdout: '', stderr: '' });
    Object.assign(service, {
      getPostgresConnection: () => ({
        host: 'db',
        port: '5432',
        user: 'stockini',
        password: 'secret',
        database: 'stockini',
      }),
      runPostgresCommand,
      assertPostgresCommandSucceeded: jest.fn(),
    });

    (
      service as unknown as { restorePostgres(dumpPath: string): void }
    ).restorePostgres(dumpPath);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const args = runPostgresCommand.mock.calls[0][1] as string[];
    const sanitizedPath = args[args.indexOf('-f') + 1];
    const sanitized = readFileSync(sanitizedPath, 'utf8');
    expect(sanitized).not.toContain('SET transaction_timeout = 0;');
    expect(sanitized).toContain('SET statement_timeout = 0;');
    expect(sanitized).toContain('SELECT 1;');
  });
});
