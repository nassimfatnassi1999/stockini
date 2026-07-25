import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MinioService } from '../documents/minio.service';
import { PrismaService } from '../prisma/prisma.service';
import { BackupStorageService } from './backup-storage.service';
import { moveUploadedFileSafely } from './move-uploaded-file-safely';

export type ExportOrigin = 'MANUAL' | 'SCHEDULED';
export type MinioRestoreMode = 'MERGE' | 'REPLACE';

export interface PostgresMetadata {
  filename: string;
  createdAt: string;
  size: number;
  origin: ExportOrigin;
}

export interface MinioManifestObject {
  bucket: string;
  key: string;
  size: number;
  contentType: string;
  checksumSha256: string;
  metadata: Record<string, string>;
  archivePath: string;
}

export interface MinioManifest {
  format: 'stockini-minio-export';
  version: 1;
  createdAt: string;
  buckets: string[];
  objectCount: number;
  totalSize: number;
  objects: MinioManifestObject[];
}

@Injectable()
export class IndependentExportsService implements OnModuleInit {
  private readonly logger = new Logger(IndependentExportsService.name);
  private readonly root: string;
  private readonly postgresDir: string;
  private readonly minioDir: string;
  private readonly temporaryDir: string;
  private readonly safetyDir: string;
  private postgresBusy = false;
  private minioBusy = false;

  readonly postgresFilename = 'stockini-postgresql-latest.dump';
  readonly minioFilename = 'stockini-minio-latest.zip';

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly audit: AuditLogsService,
    backupStorage: BackupStorageService,
  ) {
    this.root = backupStorage.directory;
    this.postgresDir = path.join(this.root, 'postgresql');
    this.minioDir = path.join(this.root, 'minio');
    this.temporaryDir = path.join(this.root, 'temporary');
    this.safetyDir = path.join(this.root, 'safety');
    this.maxUploadBytes = this.positiveNumber(
      config.get<string>('DATABASE_EXPORT_MAX_UPLOAD_BYTES'),
      2 * 1024 * 1024 * 1024,
    );
    this.maxExtractedBytes = this.positiveNumber(
      config.get<string>('DATABASE_EXPORT_MAX_EXTRACTED_BYTES'),
      8 * 1024 * 1024 * 1024,
    );
    this.maxArchiveFiles = this.positiveNumber(
      config.get<string>('DATABASE_EXPORT_MAX_FILES'),
      100_000,
    );
    this.bucketNames = (
      config.get<string>('MINIO_BUCKETS') || this.minio.bucket
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  readonly maxUploadBytes: number;
  private readonly maxExtractedBytes: number;
  private readonly maxArchiveFiles: number;
  private readonly bucketNames: string[];

  onModuleInit(): void {
    for (const directory of [
      this.postgresDir,
      this.minioDir,
      path.join(this.root, 'complete'),
      this.temporaryDir,
      this.safetyDir,
    ]) {
      fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
    }
  }

  async createPostgresExport(
    origin: ExportOrigin,
    user?: AuthUser,
  ): Promise<PostgresMetadata> {
    const lock = this.acquireLock('postgresql', this.postgresBusy);
    this.postgresBusy = true;
    const startedAt = Date.now();
    this.logExport('postgresql', 'started', origin);
    const destination = path.join(this.postgresDir, this.postgresFilename);
    const temporary = path.join(
      this.postgresDir,
      `.${this.postgresFilename}.${randomUUID()}.tmp`,
    );
    try {
      this.runPgDump(temporary);
      this.assertPostgresDump(temporary);
      // POSIX rename is atomic and replaces the previous valid dump only now.
      fs.renameSync(temporary, destination);
      const metadata: PostgresMetadata = {
        filename: this.postgresFilename,
        createdAt: new Date().toISOString(),
        size: fs.statSync(destination).size,
        origin,
      };
      this.writeJsonAtomic(
        path.join(this.postgresDir, `${this.postgresFilename}.json`),
        metadata,
      );
      await this.auditEvent(
        user,
        origin === 'SCHEDULED'
          ? 'database.postgresql.export.scheduled'
          : 'database.postgresql.export.created',
        {
          type: 'PostgreSQL',
          size: metadata.size,
          result: 'success',
          durationMs: Date.now() - startedAt,
          origin,
        },
      );
      this.logExport(
        'postgresql',
        'completed',
        origin,
        Date.now() - startedAt,
        metadata.size,
      );
      return metadata;
    } catch (error) {
      await this.auditEvent(user, 'database.postgresql.export.failed', {
        type: 'PostgreSQL',
        result: 'failure',
        durationMs: Date.now() - startedAt,
        origin,
      });
      this.logExport('postgresql', 'failed', origin, Date.now() - startedAt);
      throw this.safeServerError(
        error,
        'La création du dump PostgreSQL a échoué.',
      );
    } finally {
      fs.rmSync(temporary, { force: true });
      this.releaseLock(lock);
      this.postgresBusy = false;
    }
  }

  @Cron('0 2 * * *', {
    name: 'postgresql-daily-export',
    timeZone: process.env.TZ || 'Africa/Tunis',
  })
  async dailyPostgresExport(): Promise<void> {
    if (process.env.POSTGRES_DAILY_EXPORT_ENABLED === 'false') return;
    try {
      await this.createPostgresExport('SCHEDULED');
    } catch {
      // The service already emitted a sanitized failure log and audit event.
    }
  }

  listPostgresExports(): Array<PostgresMetadata & { status: string }> {
    const destination = path.join(this.postgresDir, this.postgresFilename);
    if (!fs.existsSync(destination)) {
      return this.postgresBusy
        ? [
            {
              filename: this.postgresFilename,
              createdAt: new Date().toISOString(),
              size: 0,
              origin: 'MANUAL',
              status: 'IN_PROGRESS',
            },
          ]
        : [];
    }
    const stat = fs.statSync(destination);
    const metadata = this.readJson<PostgresMetadata>(
      path.join(this.postgresDir, `${this.postgresFilename}.json`),
    );
    return [
      {
        filename: this.postgresFilename,
        createdAt: metadata?.createdAt || stat.mtime.toISOString(),
        size: stat.size,
        origin: metadata?.origin || 'MANUAL',
        status: this.postgresBusy ? 'IN_PROGRESS' : 'AVAILABLE',
      },
    ];
  }

  postgresDownloadPath(): string {
    return this.existingFixedPath(this.postgresDir, this.postgresFilename);
  }

  async importPostgres(
    filePath: string,
    originalName: string,
    user?: AuthUser,
  ): Promise<{
    importId: string;
    filename: string;
    size: number;
    status: 'VALIDATED';
  }> {
    const importId = randomUUID();
    const destination = path.join(this.temporaryDir, `${importId}.dump`);
    let keepValidatedImport = false;
    let lock: string | undefined;
    let ownsBusyState = false;
    try {
      const extension = path.extname(originalName).toLowerCase();
      if (!['.dump', '.backup'].includes(extension))
        throw new BadRequestException('Extension PostgreSQL invalide.');
      if (this.postgresBusy)
        throw new ConflictException(
          'Une opération PostgreSQL est déjà en cours.',
        );
      lock = this.acquireLock('postgresql', false);
      this.postgresBusy = true;
      ownsBusyState = true;
      await moveUploadedFileSafely(filePath, destination);
      if ((await fs.promises.stat(destination)).size > this.maxUploadBytes)
        throw new PayloadTooLargeException(
          'Le fichier dépasse la taille maximale autorisée.',
        );
      try {
        this.validatePostgresDump(destination);
      } catch (error) {
        if (error instanceof InternalServerErrorException) throw error;
        throw new BadRequestException(
          "Le fichier sélectionné n'est pas un dump PostgreSQL valide.",
        );
      }
      const result = {
        importId,
        filename: path.basename(originalName),
        size: (await fs.promises.stat(destination)).size,
        status: 'VALIDATED' as const,
      };
      keepValidatedImport = true;
      await this.auditEvent(user, 'database.postgresql.imported', {
        type: 'PostgreSQL',
        size: result.size,
        status: result.status,
        result: 'success',
      });
      return result;
    } finally {
      await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
      if (!keepValidatedImport)
        await fs.promises
          .rm(destination, { force: true })
          .catch(() => undefined);
      if (lock) this.releaseLock(lock);
      if (ownsBusyState) this.postgresBusy = false;
    }
  }

  async restorePostgres(
    source: 'server' | 'import',
    confirmation: string,
    user?: AuthUser,
    importId?: string,
  ): Promise<{ success: true; safetyDump: string; checks: string[] }> {
    if (confirmation !== 'RESTAURER')
      throw new BadRequestException('Confirmation RESTAURER requise.');
    if (this.postgresBusy)
      throw new ConflictException(
        'Une opération PostgreSQL est déjà en cours.',
      );
    const sourcePath =
      source === 'server'
        ? this.postgresDownloadPath()
        : this.resolveImport(importId, '.dump');
    this.validatePostgresDump(sourcePath);
    const lock = this.acquireLock('postgresql', false);
    this.postgresBusy = true;
    const startedAt = Date.now();
    const safety = path.join(
      this.safetyDir,
      `postgresql-before-restore-${Date.now()}.dump`,
    );
    await this.auditEvent(user, 'database.postgresql.restore.attempted', {
      type: 'PostgreSQL',
      result: 'started',
    });
    try {
      // Restoration is forbidden unless this valid safety dump succeeds.
      this.runPgDump(safety);
      this.assertPostgresDump(safety);
      await this.prisma.$disconnect();
      try {
        this.runPgRestore(sourcePath);
      } catch (restoreError) {
        try {
          this.runPgRestore(safety);
        } catch {
          throw new InternalServerErrorException(
            'Restauration et rollback PostgreSQL échoués. Le dump de sécurité a été conservé.',
          );
        }
        throw restoreError;
      } finally {
        await this.prisma.$connect();
      }
      let checks: string[];
      try {
        this.deployCurrentMigrations();
        checks = await this.validateDatabase();
      } catch (validationError) {
        await this.prisma.$disconnect();
        try {
          this.runPgRestore(safety);
        } finally {
          await this.prisma.$connect();
        }
        throw validationError;
      }
      await this.auditEvent(user, 'database.postgresql.restore.succeeded', {
        type: 'PostgreSQL',
        result: 'success',
        durationMs: Date.now() - startedAt,
      });
      return { success: true, safetyDump: path.basename(safety), checks };
    } catch (error) {
      await this.auditEvent(user, 'database.postgresql.restore.failed', {
        type: 'PostgreSQL',
        result: 'failure',
        durationMs: Date.now() - startedAt,
      });
      throw this.safeServerError(error, 'La restauration PostgreSQL a échoué.');
    } finally {
      if (source === 'import')
        await fs.promises
          .rm(sourcePath, { force: true })
          .catch(() => undefined);
      this.postgresBusy = false;
      this.releaseLock(lock);
    }
  }

  async createMinioExport(user?: AuthUser): Promise<MinioManifest> {
    const lock = this.acquireLock('minio', this.minioBusy);
    this.minioBusy = true;
    const startedAt = Date.now();
    const destination = path.join(this.minioDir, this.minioFilename);
    const temporary = path.join(
      this.minioDir,
      `.${this.minioFilename}.${randomUUID()}.tmp`,
    );
    this.logExport('minio', 'started', 'MANUAL');
    try {
      const { zip, manifest } = await this.buildMinioArchive();
      zip.writeZip(temporary);
      this.validateMinioArchive(temporary);
      fs.renameSync(temporary, destination);
      await this.auditEvent(user, 'database.minio.export.created', {
        type: 'MinIO',
        size: fs.statSync(destination).size,
        objects: manifest.objectCount,
        result: 'success',
        durationMs: Date.now() - startedAt,
      });
      this.logExport(
        'minio',
        'completed',
        'MANUAL',
        Date.now() - startedAt,
        fs.statSync(destination).size,
      );
      return manifest;
    } catch (error) {
      await this.auditEvent(user, 'database.minio.export.failed', {
        type: 'MinIO',
        result: 'failure',
        durationMs: Date.now() - startedAt,
      });
      this.logExport('minio', 'failed', 'MANUAL', Date.now() - startedAt);
      throw this.safeServerError(
        error,
        "La création de l'export MinIO a échoué.",
      );
    } finally {
      fs.rmSync(temporary, { force: true });
      this.minioBusy = false;
      this.releaseLock(lock);
    }
  }

  listMinioExports(): Array<Record<string, unknown>> {
    const destination = path.join(this.minioDir, this.minioFilename);
    if (!fs.existsSync(destination)) return [];
    const manifest = this.validateMinioArchive(destination);
    const stat = fs.statSync(destination);
    return [
      {
        filename: this.minioFilename,
        createdAt: manifest.createdAt,
        size: stat.size,
        objectCount: manifest.objectCount,
        buckets: manifest.buckets,
        status: this.minioBusy ? 'IN_PROGRESS' : 'AVAILABLE',
      },
    ];
  }

  minioDownloadPath(): string {
    return this.existingFixedPath(this.minioDir, this.minioFilename);
  }

  async importMinio(
    filePath: string,
    originalName: string,
    user?: AuthUser,
  ): Promise<{
    importId: string;
    filename: string;
    manifest: MinioManifest;
    status: 'VALIDATED';
  }> {
    const importId = randomUUID();
    const destination = path.join(this.temporaryDir, `${importId}.zip`);
    let keepValidatedImport = false;
    let lock: string | undefined;
    let ownsBusyState = false;
    try {
      if (path.extname(originalName).toLowerCase() !== '.zip')
        throw new BadRequestException('Extension ZIP requise.');
      if (this.minioBusy)
        throw new ConflictException('Une opération MinIO est déjà en cours.');
      lock = this.acquireLock('minio', false);
      this.minioBusy = true;
      ownsBusyState = true;
      await moveUploadedFileSafely(filePath, destination);
      if ((await fs.promises.stat(destination)).size > this.maxUploadBytes)
        throw new PayloadTooLargeException(
          'Le fichier dépasse la taille maximale autorisée.',
        );
      let manifest: MinioManifest;
      try {
        manifest = this.validateMinioArchive(destination);
      } catch (error) {
        if (error instanceof InternalServerErrorException) throw error;
        throw new BadRequestException(
          "Le fichier sélectionné n'est pas un export MinIO Stockini valide.",
        );
      }
      const result = {
        importId,
        filename: path.basename(originalName),
        manifest,
        status: 'VALIDATED' as const,
      };
      keepValidatedImport = true;
      await this.auditEvent(user, 'database.minio.imported', {
        type: 'MinIO',
        size: (await fs.promises.stat(destination)).size,
        objects: manifest.objectCount,
        status: result.status,
        result: 'success',
      });
      return result;
    } finally {
      await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
      if (!keepValidatedImport)
        await fs.promises
          .rm(destination, { force: true })
          .catch(() => undefined);
      if (lock) this.releaseLock(lock);
      if (ownsBusyState) this.minioBusy = false;
    }
  }

  async auditDownload(
    user: AuthUser,
    action: string,
    filename: string,
    size: number,
  ): Promise<void> {
    await this.auditEvent(user, action, {
      filename,
      size,
      result: 'success',
    });
  }

  async restoreMinio(
    source: 'server' | 'import',
    mode: MinioRestoreMode,
    confirmation: string,
    user?: AuthUser,
    importId?: string,
  ): Promise<{ success: true; restored: number; mode: MinioRestoreMode }> {
    if (confirmation !== 'RESTAURER')
      throw new BadRequestException('Confirmation RESTAURER requise.');
    if (!['MERGE', 'REPLACE'].includes(mode))
      throw new BadRequestException('Mode de restauration MinIO invalide.');
    const sourcePath =
      source === 'server'
        ? this.minioDownloadPath()
        : this.resolveImport(importId, '.zip');
    const manifest = this.validateMinioArchive(sourcePath);
    const lock = this.acquireLock('minio', this.minioBusy);
    this.minioBusy = true;
    const startedAt = Date.now();
    const safetyPath = path.join(
      this.safetyDir,
      `minio-before-restore-${Date.now()}.zip`,
    );
    await this.auditEvent(user, 'database.minio.restore.attempted', {
      type: 'MinIO',
      mode,
      result: 'started',
    });
    try {
      const safety = await this.buildMinioArchive(manifest.buckets);
      safety.zip.writeZip(safetyPath);
      this.validateMinioArchive(safetyPath);
      try {
        await this.applyMinioArchive(sourcePath, manifest, mode === 'REPLACE');
      } catch (restoreError) {
        const rollbackManifest = this.validateMinioArchive(safetyPath);
        await this.applyMinioArchive(safetyPath, rollbackManifest, true);
        throw restoreError;
      }
      await this.auditEvent(user, 'database.minio.restore.succeeded', {
        type: 'MinIO',
        mode,
        objects: manifest.objectCount,
        result: 'success',
        durationMs: Date.now() - startedAt,
      });
      return { success: true, restored: manifest.objectCount, mode };
    } catch (error) {
      await this.auditEvent(user, 'database.minio.restore.failed', {
        type: 'MinIO',
        mode,
        result: 'failure',
        durationMs: Date.now() - startedAt,
      });
      throw this.safeServerError(error, 'La restauration MinIO a échoué.');
    } finally {
      if (source === 'import')
        await fs.promises
          .rm(sourcePath, { force: true })
          .catch(() => undefined);
      this.minioBusy = false;
      this.releaseLock(lock);
    }
  }

  getMinioManifest(): MinioManifest {
    return this.validateMinioArchive(this.minioDownloadPath());
  }

  async checkCoherence(user?: AuthUser): Promise<Record<string, unknown>> {
    const documents = await this.prisma.generatedDocument.findMany({
      where: { deletedAt: null },
      select: { minioBucket: true, minioObjectKey: true },
    });
    const referenced = new Set(
      documents.map(
        (document) => `${document.minioBucket}/${document.minioObjectKey}`,
      ),
    );
    const duplicateReferences = documents.length - referenced.size;
    const present = new Set<string>();
    const missingBuckets: string[] = [];
    const bucketsToCheck = new Set([
      ...this.bucketNames,
      ...documents.map((document) => document.minioBucket),
    ]);
    for (const bucket of bucketsToCheck) {
      if (!(await this.minio.bucketExists(bucket))) {
        missingBuckets.push(bucket);
        continue;
      }
      for (const key of await this.minio.listAllObjects(bucket))
        present.add(`${bucket}/${key}`);
    }
    const missing = [...referenced].filter((key) => !present.has(key));
    const orphaned = [...present].filter((key) => !referenced.has(key));
    const invalidPaths = [...present].filter((item) => {
      const key = item.slice(item.indexOf('/') + 1);
      return !this.isSafeRelativePath(key);
    });
    const checksumMismatches: string[] = [];
    const latestMinio = path.join(this.minioDir, this.minioFilename);
    if (fs.existsSync(latestMinio)) {
      const manifest = this.validateMinioArchive(latestMinio);
      for (const object of manifest.objects) {
        if (!present.has(`${object.bucket}/${object.key}`)) continue;
        const checksum = createHash('sha256')
          .update(await this.minio.getObject(object.bucket, object.key))
          .digest('hex');
        if (checksum !== object.checksumSha256)
          checksumMismatches.push(`${object.bucket}/${object.key}`);
      }
    }
    const report = {
      checkedReferences: referenced.size,
      objectsFound: present.size,
      missingObjectCount: missing.length,
      missingObjects: missing,
      orphanedObjectCount: orphaned.length,
      orphanedObjects: orphaned,
      missingBuckets,
      invalidPaths,
      duplicates: duplicateReferences,
      checksumErrors: checksumMismatches,
      errorCount:
        missing.length +
        missingBuckets.length +
        invalidPaths.length +
        checksumMismatches.length,
      destructiveChanges: 0,
    };
    await this.auditEvent(user, 'database.coherence.checked', {
      result: 'success',
      ...report,
    });
    return report;
  }

  private async buildMinioArchive(
    buckets = this.bucketNames,
  ): Promise<{ zip: AdmZip; manifest: MinioManifest }> {
    const zip = new AdmZip();
    const objects: MinioManifestObject[] = [];
    let totalSize = 0;
    for (const bucket of buckets) {
      if (!(await this.minio.bucketExists(bucket)))
        throw new InternalServerErrorException(
          `Bucket MinIO absent: ${bucket}`,
        );
      const keys = (await this.minio.listAllObjects(bucket)).sort();
      for (const key of keys) {
        if (!this.isSafeRelativePath(key))
          throw new InternalServerErrorException('Une clé MinIO est invalide.');
        const buffer = await this.minio.getObject(bucket, key);
        const stat = await this.minio.statObject(bucket, key);
        const archivePath = `objects/${bucket}/${key}`;
        zip.addFile(archivePath, buffer);
        totalSize += buffer.length;
        objects.push({
          bucket,
          key,
          size: buffer.length,
          contentType: stat.contentType || 'application/octet-stream',
          checksumSha256: createHash('sha256').update(buffer).digest('hex'),
          metadata: this.stringMetadata(stat.metaData),
          archivePath,
        });
      }
    }
    const manifest: MinioManifest = {
      format: 'stockini-minio-export',
      version: 1,
      createdAt: new Date().toISOString(),
      buckets,
      objectCount: objects.length,
      totalSize,
      objects,
    };
    zip.addFile(
      'manifest.json',
      Buffer.from(JSON.stringify(manifest, null, 2)),
    );
    return { zip, manifest };
  }

  private validateMinioArchive(zipPath: string): MinioManifest {
    try {
      return this.validateMinioArchiveContents(zipPath);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if ((error as NodeJS.ErrnoException).code)
        throw new InternalServerErrorException(
          'Impossible de préparer le fichier importé.',
        );
      throw new BadRequestException(
        "Le fichier sélectionné n'est pas un export MinIO Stockini valide.",
      );
    }
  }

  private validateMinioArchiveContents(zipPath: string): MinioManifest {
    this.assertZipSignature(zipPath);
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    if (entries.length > this.maxArchiveFiles)
      throw new BadRequestException('Archive contenant trop de fichiers.');
    const totalExpanded = entries.reduce(
      (sum, entry) => sum + Number(entry.header.size || 0),
      0,
    );
    if (totalExpanded > this.maxExtractedBytes)
      throw new BadRequestException('Archive décompressée trop volumineuse.');
    const names = new Set<string>();
    for (const entry of entries) {
      const name = entry.entryName.replace(/\\/g, '/');
      const unixMode = (entry.attr >>> 16) & 0xffff;
      const isSymbolicLink = (unixMode & 0o170000) === 0o120000;
      const compressed = Number(entry.header.compressedSize || 0);
      const expanded = Number(entry.header.size || 0);
      if (
        !this.isSafeRelativePath(name) ||
        names.has(name) ||
        isSymbolicLink ||
        (compressed > 0 && expanded / compressed > 1000)
      )
        throw new BadRequestException(
          'Archive ZIP contenant un chemin non sûr.',
        );
      names.add(name);
    }
    const entry = zip.getEntry('manifest.json');
    if (!entry) throw new BadRequestException('manifest.json absent.');
    let manifest: MinioManifest;
    try {
      manifest = JSON.parse(entry.getData().toString('utf8')) as MinioManifest;
    } catch {
      throw new BadRequestException('Manifest MinIO invalide.');
    }
    if (
      manifest.format !== 'stockini-minio-export' ||
      manifest.version !== 1 ||
      typeof manifest.createdAt !== 'string' ||
      !Array.isArray(manifest.objects) ||
      manifest.objectCount !== manifest.objects.length ||
      !Array.isArray(manifest.buckets) ||
      manifest.buckets.some((bucket) => !this.bucketNames.includes(bucket))
    )
      throw new BadRequestException('Manifest MinIO incompatible.');
    let declaredSize = 0;
    const declaredArchivePaths = new Set<string>();
    for (const object of manifest.objects) {
      if (
        !object ||
        typeof object.bucket !== 'string' ||
        typeof object.key !== 'string' ||
        !Number.isSafeInteger(object.size) ||
        object.size < 0 ||
        typeof object.archivePath !== 'string' ||
        typeof object.checksumSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/i.test(object.checksumSha256) ||
        !manifest.buckets.includes(object.bucket) ||
        !this.isSafeRelativePath(object.key) ||
        object.archivePath !== `objects/${object.bucket}/${object.key}` ||
        declaredArchivePaths.has(object.archivePath)
      )
        throw new BadRequestException('Manifest MinIO incohérent.');
      declaredArchivePaths.add(object.archivePath);
      const objectEntry = zip.getEntry(object.archivePath);
      if (!objectEntry || objectEntry.header.size !== object.size)
        throw new BadRequestException('Objet absent ou taille incohérente.');
      const checksum = createHash('sha256')
        .update(objectEntry.getData())
        .digest('hex');
      if (checksum !== object.checksumSha256)
        throw new BadRequestException('Checksum MinIO invalide.');
      declaredSize += object.size;
    }
    if (declaredSize !== manifest.totalSize)
      throw new BadRequestException('Taille totale du manifeste incohérente.');
    const archivedObjectPaths = entries
      .filter((archiveEntry) => !archiveEntry.isDirectory)
      .map((archiveEntry) => archiveEntry.entryName.replace(/\\/g, '/'))
      .filter((name) => name.startsWith('objects/'));
    if (
      archivedObjectPaths.length !== declaredArchivePaths.size ||
      archivedObjectPaths.some((name) => !declaredArchivePaths.has(name))
    )
      throw new BadRequestException(
        "Le nombre d'objets du manifeste est incohérent.",
      );
    return manifest;
  }

  private async applyMinioArchive(
    zipPath: string,
    manifest: MinioManifest,
    replace: boolean,
  ): Promise<void> {
    const zip = new AdmZip(zipPath);
    for (const bucket of manifest.buckets) {
      await this.minio.ensureBucketOrThrow(bucket);
      if (replace) {
        for (const key of await this.minio.listAllObjects(bucket))
          await this.minio.removeObject(bucket, key);
      }
    }
    for (const object of manifest.objects) {
      const data = zip.getEntry(object.archivePath)?.getData();
      if (!data) throw new BadRequestException('Objet MinIO absent du ZIP.');
      await this.minio.putObjectWithMetadata(
        object.bucket,
        object.key,
        data,
        object.contentType,
        object.metadata,
      );
    }
  }

  private runPgDump(outputPath: string): void {
    const connection = this.postgresConnection();
    const result = spawnSync(
      'pg_dump',
      [
        '--no-password',
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        `--file=${outputPath}`,
        '-h',
        connection.host,
        '-p',
        connection.port,
        '-U',
        connection.user,
        connection.database,
      ],
      {
        env: { ...process.env, PGPASSWORD: connection.password },
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024,
      },
    );
    if (result.error || result.status !== 0)
      throw new InternalServerErrorException('pg_dump a échoué.');
  }

  private runPgRestore(dumpPath: string): void {
    const connection = this.postgresConnection();
    const result = spawnSync(
      'pg_restore',
      [
        '--no-password',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '--single-transaction',
        '-h',
        connection.host,
        '-p',
        connection.port,
        '-U',
        connection.user,
        '-d',
        connection.database,
        dumpPath,
      ],
      {
        env: { ...process.env, PGPASSWORD: connection.password },
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024,
      },
    );
    if (result.error || result.status !== 0)
      throw new InternalServerErrorException('pg_restore a échoué.');
  }

  private validatePostgresDump(dumpPath: string): void {
    this.assertPostgresDump(dumpPath);
    const result = spawnSync('pg_restore', ['--list', dumpPath], {
      encoding: 'buffer',
      maxBuffer: 50 * 1024 * 1024,
    });
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT')
      throw new InternalServerErrorException(
        'Outil de validation PostgreSQL indisponible.',
      );
    if (result.error || result.status !== 0)
      throw new BadRequestException(
        "Le fichier sélectionné n'est pas un dump PostgreSQL valide.",
      );
  }

  private deployCurrentMigrations(): void {
    const prismaCli = path.join(
      process.cwd(),
      'node_modules',
      'prisma',
      'build',
      'index.js',
    );
    if (!fs.existsSync(prismaCli))
      throw new InternalServerErrorException('CLI Prisma indisponible.');
    const result = spawnSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy'],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024,
      },
    );
    if (result.error || result.status !== 0)
      throw new InternalServerErrorException(
        'Application des migrations Prisma échouée.',
      );
  }

  private postgresConnection() {
    let parsed: URL | undefined;
    try {
      parsed = process.env.DATABASE_URL
        ? new URL(process.env.DATABASE_URL)
        : undefined;
    } catch {
      throw new InternalServerErrorException(
        'Configuration PostgreSQL invalide.',
      );
    }
    return {
      host: parsed?.hostname || process.env.DB_HOST || 'localhost',
      port: parsed?.port || process.env.DB_PORT || '5432',
      user: decodeURIComponent(parsed?.username || process.env.DB_USER || ''),
      password: decodeURIComponent(
        parsed?.password || process.env.DB_PASSWORD || '',
      ),
      database:
        decodeURIComponent(parsed?.pathname.replace(/^\//, '') || '') ||
        process.env.DB_NAME ||
        '',
    };
  }

  private assertPostgresDump(filePath: string): void {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0)
      throw new BadRequestException('Dump PostgreSQL vide.');
    const descriptor = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(5);
    try {
      fs.readSync(descriptor, header, 0, 5, 0);
    } finally {
      fs.closeSync(descriptor);
    }
    if (header.toString('ascii') !== 'PGDMP')
      throw new BadRequestException('Format PostgreSQL custom invalide.');
  }

  private assertUpload(filePath: string): void {
    if (!fs.existsSync(filePath))
      throw new BadRequestException('Fichier absent.');
    const size = fs.statSync(filePath).size;
    if (size === 0) throw new BadRequestException('Fichier vide.');
    if (size > this.maxUploadBytes)
      throw new BadRequestException('Fichier trop volumineux.');
  }

  private assertZipSignature(filePath: string): void {
    this.assertUpload(filePath);
    const fd = fs.openSync(filePath, 'r');
    const signature = Buffer.alloc(4);
    try {
      fs.readSync(fd, signature, 0, 4, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (!signature.subarray(0, 2).equals(Buffer.from('PK')))
      throw new BadRequestException('Signature ZIP invalide.');
  }

  private acquireLock(type: string, alreadyBusy: boolean): string {
    if (alreadyBusy)
      throw new ConflictException(`Export ${type} déjà en cours.`);
    const lockPath = path.join(this.temporaryDir, `${type}.lock`);
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return lockPath;
    } catch {
      // A lock older than 24h is necessarily stale after a process crash.
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > 86_400_000) {
          fs.rmSync(lockPath, { force: true });
          return this.acquireLock(type, false);
        }
      } catch {
        // Missing/unreadable lock is handled as a conflict below.
      }
      throw new ConflictException(`Export ${type} déjà en cours.`);
    }
  }

  private releaseLock(lockPath: string): void {
    fs.rmSync(lockPath, { force: true });
  }

  private resolveImport(
    importId: string | undefined,
    extension: string,
  ): string {
    if (!importId || !/^[0-9a-f-]{36}$/i.test(importId))
      throw new BadRequestException("Identifiant d'import invalide.");
    return this.existingFixedPath(this.temporaryDir, `${importId}${extension}`);
  }

  private existingFixedPath(directory: string, filename: string): string {
    const resolved = path.resolve(directory, filename);
    if (!resolved.startsWith(`${path.resolve(directory)}${path.sep}`))
      throw new BadRequestException('Chemin invalide.');
    if (!fs.existsSync(resolved))
      throw new NotFoundException('Export introuvable.');
    return resolved;
  }

  private async validateDatabase(): Promise<string[]> {
    await this.prisma.$queryRaw`SELECT 1`;
    const rows = await this.prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('User', 'Product', 'Sale', '_prisma_migrations')
    `;
    if (rows.length < 4)
      throw new InternalServerErrorException(
        'Tables critiques absentes après restauration.',
      );
    return ['connection', 'critical-tables', 'prisma-migrations'];
  }

  private isSafeRelativePath(value: string): boolean {
    const normalized = value.replace(/\\/g, '/');
    return (
      !!normalized &&
      !value.includes('\\') &&
      !normalized.includes('\0') &&
      !normalized.startsWith('/') &&
      !normalized.split('/').includes('..') &&
      !path.isAbsolute(normalized)
    );
  }

  private stringMetadata(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => typeof item === 'string')
        .map(([key, item]) => [key, item as string]),
    );
  }

  private writeJsonAtomic(filePath: string, value: unknown): void {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(temporary, filePath);
  }

  private readJson<T>(filePath: string): T | undefined {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  private positiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async auditEvent(
    user: AuthUser | undefined,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.create({
        userId: user?.id,
        action,
        entity: 'database',
        metadata: { ...metadata, user: user?.email || 'system' },
      });
    } catch {
      this.logger.error(
        JSON.stringify({ event: 'database_export_audit_failed', action }),
      );
    }
  }

  private logExport(
    type: string,
    status: 'started' | 'completed' | 'failed',
    origin: ExportOrigin,
    durationMs?: number,
    size?: number,
  ): void {
    const payload = {
      event: `${type}_export_${status}`,
      origin,
      durationMs,
      size,
    };
    if (status === 'failed') this.logger.error(JSON.stringify(payload));
    else this.logger.log(JSON.stringify(payload));
  }

  private safeServerError(error: unknown, message: string): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    )
      return error;
    return new InternalServerErrorException(message);
  }
}
