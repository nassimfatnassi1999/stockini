import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MinioService } from '../documents/minio.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import AdmZip from 'adm-zip';
import * as ExcelJS from 'exceljs';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { BackupStorageService } from './backup-storage.service';

export const MAX_BACKUPS = 3;
export const DATABASE_BACKUP_VERSION = 4;
export const DATABASE_BACKUP_TYPE = 'FULL_SYSTEM' as const;

interface DatabaseBackupManifest {
  backupVersion: 4;
  type: typeof DATABASE_BACKUP_TYPE;
  createdAt: string;
  applicationVersion: string;
  postgresServerVersion: string;
  pgDumpVersion: string;
  databaseName: string;
  databaseFormat: 'custom';
  databaseFile: 'database/postgres.dump';
  containsDatabase: true;
  containsMinio: true;
  containsGeneratedDocuments: true;
  documentsMustBeRegenerated: false;
  minioBucket: string;
  minioPrefix: string;
  minioFileCount: number;
  databaseSizeBytes: number;
  minioSizeBytes: number;
  totalSizeBytes: number;
  prismaMigrationCount: number;
  schemaFingerprint: string;
  checksumAlgorithm: 'sha256';
  checksums: Record<string, string>;
}

interface MinioExportResult {
  fileCount: number;
  totalSizeBytes: number;
  checksums: Record<string, string>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: string;
  createdBy: string;
  type: typeof DATABASE_BACKUP_TYPE | 'DATABASE_ONLY' | 'LEGACY';
  path: string;
  status: 'valid' | 'invalid' | 'missing-sql';
}

export interface SystemHealth {
  database: { status: 'ok' | 'error'; message?: string; responseMs?: number };
  minio: { status: 'ok' | 'error'; message?: string };
  smtp: { status: 'ok' | 'error'; message?: string };
  disk: { backupsSize: number; uploadsSize: number };
  stats: {
    customers: number;
    products: number;
    sales: number;
    documents: number;
    auditLogs: number;
    dbSizeBytes: number;
  };
  lastBackup: string | null;
  uptime: number;
}

interface RestoreOptions {
  uploadedFilename?: string;
}

interface PostgresConnection {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);
  private restoreInProgress = false;
  private backupInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogsService,
    private readonly minio: MinioService,
    private readonly backupStorage: BackupStorageService,
  ) {}

  // ════════════════════════════════════════════════════════════
  // BACKUP
  // ════════════════════════════════════════════════════════════

  async createDatabaseBackup(user?: AuthUser): Promise<{
    filename: string;
    size: number;
    path: string;
    backupType: typeof DATABASE_BACKUP_TYPE;
    containsDatabase: true;
    containsMinio: true;
    documentsMustBeRegenerated: false;
    minioFileCount: number;
  }> {
    if (this.restoreInProgress)
      throw new ConflictException('Une restauration est en cours');
    if (this.backupInProgress)
      throw new ConflictException('Une sauvegarde est déjà en cours');
    this.backupInProgress = true;
    await this.backupStorage.ensureAccessible();

    const now = new Date();
    const stamp = this.dateStamp(now);
    const tmpDir = path.join(os.tmpdir(), `backup-${stamp}-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    let temporaryZipPath: string | null = null;

    try {
      this.logger.log('[BACKUP] Préparation...');
      await this.assertDatabaseReachable();
      await this.assertPostgresToolCompatibility();
      await this.assertBackupDiskSpace();

      const payloadDir = path.join(tmpDir, 'payload');
      const databaseDir = path.join(payloadDir, 'database');
      const minioDir = path.join(payloadDir, 'minio', this.minio.bucket);
      fs.mkdirSync(databaseDir, { recursive: true });
      fs.mkdirSync(minioDir, { recursive: true });

      this.logger.log('[BACKUP] Dump PostgreSQL...');
      const dumpPath = path.join(databaseDir, 'postgres.dump');
      this.dumpPostgres(dumpPath);

      this.logger.log('[BACKUP] Export MinIO...');
      const minioExport = await this.exportMinio(minioDir);

      this.logger.log('[BACKUP] Création du manifest...');
      const manifest = await this.createBackupManifest(
        dumpPath,
        now,
        minioExport,
      );
      const manifestPath = path.join(payloadDir, 'manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), {
        mode: 0o600,
      });

      const zipName = `backup-${stamp}.zip`;
      const zipPath = await this.backupStorage.destination(zipName);
      temporaryZipPath = path.join(
        path.dirname(zipPath),
        `.${zipName}.${process.pid}.${Date.now()}.partial`,
      );
      this.logger.log('[BACKUP] Compression ZIP...');
      this.createDatabaseZip(payloadDir, temporaryZipPath);
      this.logger.log('[BACKUP] Vérification...');
      this.validateDatabaseZip(temporaryZipPath);
      fs.renameSync(temporaryZipPath, zipPath);
      temporaryZipPath = null;

      const size = fs.statSync(zipPath).size;
      if (size === 0) {
        fs.rmSync(zipPath, { force: true });
        throw new InternalServerErrorException(
          'ZIP créé vide — échec de la compression',
        );
      }
      this.logger.log(`[BACKUP] Terminé. ${zipName} (${size} octets)`);

      await this.audit.create({
        userId: user?.id,
        action: 'database.backup.created',
        entity: 'database',
        metadata: {
          filename: zipName,
          size,
          createdBy: user?.email ?? 'system',
          backupType: DATABASE_BACKUP_TYPE,
          containsMinio: true,
          minioFileCount: minioExport.fileCount,
        },
      });

      // Retention runs only after the ZIP and its metadata have been saved.
      // It is deliberately best-effort: cleanup must never turn a successful
      // backup into a failed one.
      await this.applyBackupRetention();

      return {
        filename: zipName,
        size,
        path: zipPath,
        backupType: DATABASE_BACKUP_TYPE,
        containsDatabase: true,
        containsMinio: true,
        documentsMustBeRegenerated: false,
        minioFileCount: minioExport.fileCount,
      };
    } finally {
      if (temporaryZipPath) {
        fs.rmSync(temporaryZipPath, { force: true });
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
      this.backupInProgress = false;
    }
  }

  /** Backward-compatible name used by the cron and older callers. */
  async createBackup(user?: AuthUser) {
    return this.createDatabaseBackup(user);
  }

  async listBackups(): Promise<BackupInfo[]> {
    const files = await this.backupStorage.listZipFiles();
    return files
      .map(({ filename, path: full, size, createdAt }) => {
        return {
          filename,
          size,
          createdAt,
          createdBy: 'system',
          type: this.readBackupType(full),
          path: full,
          status: this.inspectBackupStatus(full),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async deleteBackup(filename: string, user?: AuthUser): Promise<void> {
    await this.backupStorage.remove(filename);
    await this.audit.create({
      userId: user?.id,
      action: 'database.backup.deleted',
      entity: 'database',
      metadata: { filename },
    });
  }

  async restoreDatabaseBackup(
    zipBuffer: Buffer,
    user?: AuthUser,
    options: RestoreOptions = {},
  ): Promise<{
    restored: string[];
    backupType: typeof DATABASE_BACKUP_TYPE | 'DATABASE_ONLY' | 'LEGACY';
    containsDatabase: true;
    containsMinio: boolean;
    documentsMustBeRegenerated: boolean;
    ignoredLegacyFiles: boolean;
  }> {
    if (this.backupInProgress) {
      throw new ConflictException('Une sauvegarde est en cours');
    }
    if (this.restoreInProgress) {
      throw new ConflictException('Une restauration est déjà en cours');
    }
    this.restoreInProgress = true;
    const stamp = this.dateStamp(new Date());
    const tmpDir = path.join(os.tmpdir(), `restore-${stamp}-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    this.logger.log(
      `[RESTORE] Upload received: ${options.uploadedFilename ?? 'server backup'}`,
    );
    this.logger.log(`[RESTORE] File size: ${zipBuffer.length} bytes`);
    this.logger.log(`[RESTORE] Temporary workspace: ${tmpDir}`);

    let safetyDumpPath: string | null = null;
    try {
      if (zipBuffer.length === 0) {
        throw new BadRequestException('Le fichier ZIP est vide');
      }

      const zipPath = path.join(tmpDir, 'restore.zip');
      fs.writeFileSync(zipPath, zipBuffer);

      this.logger.log(`[RESTORE] Validating ZIP...`);
      let zip: AdmZip;
      try {
        zip = new AdmZip(zipPath);
        zip.getEntries();
      } catch (error) {
        throw new BadRequestException(
          `Archive ZIP invalide ou corrompue : ${(error as Error).message}`,
        );
      }

      this.assertSafeBackupEntries(zip);
      const extractDir = path.join(tmpDir, 'extracted');
      this.extractSafeBackup(zip, extractDir);

      const dumpEntry = this.findDatabaseDumpEntry(zip);
      if (!dumpEntry) {
        throw new BadRequestException(
          'Dump PostgreSQL absent (attendu : database/postgres.dump ou format historique)',
        );
      }
      const dumpPath = path.join(
        extractDir,
        dumpEntry.entryName.replace(/\//g, path.sep),
      );

      const manifestEntry =
        zip.getEntry('manifest.json') ?? zip.getEntry('metadata.json');
      const databaseOnlyManifestEntry = zip.getEntry('backup-manifest.json');
      let manifest: DatabaseBackupManifest | null = null;
      let backupType: typeof DATABASE_BACKUP_TYPE | 'DATABASE_ONLY' | 'LEGACY' =
        'LEGACY';
      let containsMinio = false;
      let minioSourceDir: string | null = null;

      if (manifestEntry) {
        const raw = manifestEntry.getData().toString('utf8');
        const parsed = this.parseManifest(raw);
        if (parsed.backupVersion === DATABASE_BACKUP_VERSION) {
          manifest = this.validateBackupManifest(raw, extractDir);
          await this.assertRestoreCompatibility(manifest);
          backupType = DATABASE_BACKUP_TYPE;
          containsMinio = true;
          minioSourceDir = path.join(extractDir, 'minio', manifest.minioBucket);
        } else {
          this.validateLegacyManifest(parsed);
          containsMinio = true;
          minioSourceDir = path.join(extractDir, 'minio', this.minio.bucket);
        }
      } else if (databaseOnlyManifestEntry) {
        this.validateDatabaseOnlyManifest(
          databaseOnlyManifestEntry.getData().toString('utf8'),
          dumpPath,
        );
        backupType = 'DATABASE_ONLY';
        this.logger.warn(
          '[RESTORE] Ancienne sauvegarde DATABASE_ONLY : aucun objet MinIO à restaurer.',
        );
      } else {
        throw new BadRequestException(
          'Manifest absent (manifest.json ou backup-manifest.json attendu)',
        );
      }

      if (
        containsMinio &&
        (!minioSourceDir || !fs.existsSync(minioSourceDir))
      ) {
        throw new BadRequestException(
          `Dossier MinIO absent : minio/${this.minio.bucket}/`,
        );
      }

      const dumpStat = fs.statSync(dumpPath);
      if (dumpStat.size === 0)
        throw new BadRequestException(
          `Le dump ${path.basename(dumpPath)} est vide`,
        );
      if (path.extname(dumpPath).toLowerCase() === '.sql') {
        const sqlPreview = fs.readFileSync(dumpPath, 'utf8').slice(0, 4096);
        if (sqlPreview.includes('pg_dump not available')) {
          throw new BadRequestException(
            "Ce backup ne contient pas de dump SQL valide (pg_dump n'était pas disponible lors de la création)",
          );
        }
      }

      this.logger.log(`[RESTORE] Database dump path: ${dumpPath}`);
      this.logger.log(
        `[RESTORE] Dump detected: ${path.basename(dumpPath)} (${dumpStat.size} bytes)`,
      );
      this.logger.log(
        `[RESTORE] ZIP validated (${backupType}, MinIO=${containsMinio ? 'oui' : 'non'})`,
      );

      const restored: string[] = [];
      const minioSafetyDir = path.join(tmpDir, 'minio-safety');
      if (containsMinio) {
        await this.minio.ensureBucketOrThrow(this.minio.bucket);
        this.logger.log('[RESTORE] Creating MinIO safety snapshot');
        await this.exportMinio(minioSafetyDir);
      }

      this.logger.log(`[RESTORE][STEP=postgres] Restore started`);
      safetyDumpPath = path.join(
        this.backupStorage.directory,
        `pre-restore-${stamp}.dump`,
      );
      await this.backupStorage.ensureAccessible();
      this.dumpPostgres(safetyDumpPath);
      this.logger.log(
        `[RESTORE] Safety database dump created: ${safetyDumpPath}`,
      );

      await this.prisma.$disconnect();
      try {
        try {
          this.preparePostgresForRestore();
          this.restorePostgres(dumpPath);
          this.deployCurrentMigrations();
        } catch (restoreError) {
          this.logger.error(
            `[RESTORE] Database restore failed; rolling back from ${safetyDumpPath}`,
          );
          try {
            this.preparePostgresForRestore();
            this.restorePostgres(safetyDumpPath);
          } catch (rollbackError) {
            throw new InternalServerErrorException(
              `Restauration échouée et rollback PostgreSQL échoué : ${(rollbackError as Error).message}. Backup de sécurité conservé : ${safetyDumpPath}`,
            );
          }
          throw restoreError;
        }
      } finally {
        await this.prisma.$connect();
      }
      restored.push(path.basename(dumpPath));
      this.logger.log(`[RESTORE][STEP=postgres] Restore completed`);

      // The dump may come from an older release. Reconnect the Prisma pool,
      // apply current migrations, and verify the restored schema before success.
      try {
        await this.validateRestoredDatabase();
      } catch (validationError) {
        this.logger.error(
          '[RESTORE] Post-restore validation failed; restoring safety dump',
        );
        await this.prisma.$disconnect();
        try {
          this.preparePostgresForRestore();
          this.restorePostgres(safetyDumpPath);
        } finally {
          await this.prisma.$connect();
        }
        throw validationError;
      }
      restored.push('prisma-schema');

      if (containsMinio && minioSourceDir) {
        this.logger.log(
          `[RESTORE][STEP=minio] Replacing bucket ${this.minio.bucket}`,
        );
        try {
          const restoredObjects = await this.importMinio(minioSourceDir, true);
          if (manifest) {
            await this.verifyMinioManifest(manifest);
          } else {
            const actualObjects = await this.minio.listAllObjects(
              this.minio.bucket,
            );
            if (actualObjects.length !== restoredObjects) {
              throw new InternalServerErrorException(
                `Vérification MinIO échouée : ${restoredObjects} objets attendus, ${actualObjects.length} trouvés`,
              );
            }
          }
          restored.push(`minio/${this.minio.bucket}/`);
          this.logger.log(
            `[RESTORE][STEP=minio] ${restoredObjects} objet(s) restauré(s)`,
          );
        } catch (minioError) {
          this.logger.error(
            `[RESTORE] Échec MinIO; rollback PostgreSQL et MinIO: ${(minioError as Error).message}`,
          );
          await this.rollbackRestore(safetyDumpPath, minioSafetyDir);
          throw minioError;
        }
      }

      await this.validateRestoredDatabase();
      fs.rmSync(safetyDumpPath, { force: true });
      safetyDumpPath = null;
      this.logger.log(`[RESTORE] Final PostgreSQL + MinIO health check passed`);

      await this.audit.create({
        userId: user?.id,
        action: 'database.backup.restored',
        entity: 'database',
        metadata: { restored, restoredBy: user?.email ?? 'system' },
      });

      this.logger.log(
        `[RESTORE] Restore completed successfully — restored: ${restored.join(', ')}`,
      );
      return {
        restored,
        backupType,
        containsDatabase: true,
        containsMinio,
        documentsMustBeRegenerated: !containsMinio,
        ignoredLegacyFiles: false,
      };
    } catch (err) {
      this.logger.error(
        `[RESTORE][ERROR] ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
      this.restoreInProgress = false;
    }
  }

  /** Backward-compatible entry point for existing controller integrations. */
  async restoreBackup(
    zipBuffer: Buffer,
    user?: AuthUser,
    options: RestoreOptions = {},
  ) {
    return this.restoreDatabaseBackup(zipBuffer, user, options);
  }

  async restoreBackupByFilename(
    filename: string,
    user?: AuthUser,
    options: RestoreOptions = {},
  ) {
    try {
      this.logger.log(`[RESTORE][SOURCE=local] Backup filename: ${filename}`);
      this.logger.log(
        `[RESTORE][SOURCE=local] Backup directory: ${this.backupStorage.directory}`,
      );
      const zipBuffer = await this.backupStorage.read(filename);
      return await this.restoreBackup(zipBuffer, user, {
        ...options,
        uploadedFilename: path.basename(filename),
      });
    } catch (error) {
      this.logger.error(
        `[RESTORE][FILENAME=${filename}] ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════
  // EXPORT
  // ════════════════════════════════════════════════════════════

  async exportEntity(
    entity: string,
    format: 'xlsx' | 'csv',
    filters?: Record<string, string>,
  ): Promise<Buffer> {
    const rows = await this.fetchEntityRows(entity, filters);
    if (format === 'csv') return this.toCsv(rows);
    return this.toExcel(rows, entity);
  }

  private async fetchEntityRows(
    entity: string,
    filters?: Record<string, string>,
  ): Promise<Record<string, unknown>[]> {
    const dateFrom = filters?.dateFrom ? new Date(filters.dateFrom) : undefined;
    const dateTo = filters?.dateTo ? new Date(filters.dateTo) : undefined;
    const dateFilter =
      dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {};

    switch (entity) {
      case 'products':
        return (
          await this.prisma.product.findMany({
            where: { deletedAt: null, ...dateFilter },
            include: {
              category: { select: { name: true } },
              brand: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
          })
        ).map((p) => ({
          reference: p.reference,
          nom: p.name,
          categorie: p.category?.name ?? '',
          marque: p.brand?.name ?? '',
          prix_achat: Number(p.purchasePrice),
          prix_vente: Number(p.salePrice),
          quantite: p.quantity,
          stock_min: p.minStock,
          actif: p.isActive ? 'Oui' : 'Non',
          cree_le: p.createdAt.toISOString(),
        }));

      case 'customers':
        return (
          await this.prisma.customer.findMany({
            where: { ...dateFilter },
            orderBy: { createdAt: 'desc' },
          })
        ).map((c) => ({
          reference: c.reference,
          nom: c.name,
          email: c.email ?? '',
          telephone: c.phone ?? '',
          adresse: c.address ?? '',
          solde_credit: Number(c.creditBalance ?? 0),
          cree_le: c.createdAt.toISOString(),
        }));

      case 'suppliers':
        return (
          await this.prisma.supplier.findMany({
            where: { ...dateFilter },
            orderBy: { createdAt: 'desc' },
          })
        ).map((s) => ({
          nom: s.name,
          email: s.email ?? '',
          telephone: s.phone ?? '',
          adresse: s.address ?? '',
          cree_le: s.createdAt.toISOString(),
        }));

      case 'sales':
        return (
          await this.prisma.sale.findMany({
            where: { deletedAt: null, ...dateFilter },
            include: { customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
          })
        ).map((s) => ({
          numero: s.invoiceNumber ?? '',
          client: s.customer?.name ?? '',
          statut: s.status,
          sous_total: Number(s.subtotal),
          remise: Number(s.discount ?? 0),
          taxe: Number(s.tax ?? 0),
          total: Number(s.total),
          paye: Number(s.paidAmount ?? 0),
          restant: Number(s.remainingAmount ?? 0),
          cree_le: s.createdAt.toISOString(),
        }));

      case 'purchases':
        return (
          await this.prisma.purchase.findMany({
            where: { deletedAt: null, ...dateFilter },
            include: { supplier: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
          })
        ).map((p) => ({
          numero: p.orderNumber,
          fournisseur: p.supplier?.name ?? '',
          statut: p.status,
          total: Number(p.total ?? 0),
          paye: Number(p.paidAmount ?? 0),
          restant: Number(p.remainingAmount ?? 0),
          cree_le: p.createdAt.toISOString(),
        }));

      case 'payments':
        return (
          await this.prisma.payment.findMany({
            where: { deletedAt: null, ...dateFilter },
            include: { customer: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
          })
        ).map((p) => ({
          client: p.customer?.name ?? '',
          montant: Number(p.amount),
          type: p.type,
          mode: p.method,
          reference: p.reference ?? '',
          cree_le: p.createdAt.toISOString(),
        }));

      case 'stock':
        return (
          await this.prisma.product.findMany({
            where: { deletedAt: null, isActive: true },
            include: { category: { select: { name: true } } },
            orderBy: { quantity: 'asc' },
          })
        ).map((p) => ({
          reference: p.reference,
          nom: p.name,
          categorie: p.category?.name ?? '',
          quantite: p.quantity,
          stock_min: p.minStock,
          valeur_stock: Number(p.purchasePrice) * p.quantity,
          alerte: p.quantity <= p.minStock ? 'Oui' : 'Non',
        }));

      case 'audit_logs':
        return (
          await this.prisma.auditLog.findMany({
            where: { ...dateFilter },
            include: { user: { select: { fullName: true, email: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10000,
          })
        ).map((l) => ({
          utilisateur: l.user?.fullName ?? l.user?.email ?? '',
          action: l.action,
          entite: l.entity,
          entite_id: l.entityId ?? '',
          cree_le: l.createdAt.toISOString(),
        }));

      default:
        throw new BadRequestException(`Entité inconnue : ${entity}`);
    }
  }

  private async toExcel(
    rows: Record<string, unknown>[],
    sheetName: string,
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);

    if (rows.length === 0) {
      ws.addRow(['Aucune donnée']);
      return Buffer.from(await wb.xlsx.writeBuffer());
    }

    const headers = Object.keys(rows[0]);
    const headerRow = ws.addRow(headers);
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const row of rows) {
      ws.addRow(headers.map((h) => row[h]));
    }

    ws.columns.forEach((col) => {
      col.width = 18;
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private toCsv(rows: Record<string, unknown>[]): Buffer {
    if (rows.length === 0) return Buffer.from('');
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(';'),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const v = r[h] ?? '';
            const s = this.stringifyImportValue(v);
            return s.includes(';') || s.includes('"')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(';'),
      ),
    ];
    return Buffer.from('\uFEFF' + lines.join('\n'), 'utf8');
  }

  private stringifyImportValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    return JSON.stringify(value) ?? '';
  }

  // ════════════════════════════════════════════════════════════
  // IMPORT
  // ════════════════════════════════════════════════════════════

  async importEntity(
    entity: string,
    fileBuffer: Buffer,
    mimeType: string,
    user?: AuthUser,
  ): Promise<{ inserted: number; errors: string[]; duplicates: number }> {
    const rows = await this.parseImportFile(fileBuffer, mimeType);
    const result = await this.processImport(entity, rows);

    await this.audit.create({
      userId: user?.id,
      action: `database.import.${entity}`,
      entity: 'database',
      metadata: {
        entity,
        inserted: result.inserted,
        errors: result.errors.length,
      },
    });

    return result;
  }

  async previewImport(
    entity: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<{ rows: Record<string, unknown>[]; errors: string[] }> {
    const rows = await this.parseImportFile(fileBuffer, mimeType);
    const errors: string[] = [];
    const validated: Record<string, unknown>[] = [];

    for (let i = 0; i < Math.min(rows.length, 100); i++) {
      const row = rows[i];
      const rowErrors = this.validateRow(entity, row, i + 2);
      if (rowErrors.length) errors.push(...rowErrors);
      else validated.push(row);
    }

    return { rows: validated.slice(0, 20), errors };
  }

  private async parseImportFile(
    buffer: Buffer,
    mimeType: string,
  ): Promise<Record<string, unknown>[]> {
    const isCsv =
      mimeType.includes('csv') ||
      mimeType.includes('text/plain') ||
      mimeType.includes('text/comma');

    if (isCsv) {
      const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return [];
      const sep = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
      return lines.slice(1).map((line) => {
        const values = line.split(sep);
        return Object.fromEntries(
          headers.map((h, i) => [h, values[i]?.trim() ?? '']),
        );
      });
    }

    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];

    const headers: string[] = [];
    ws.getRow(1).eachCell((cell) => {
      headers.push(this.stringifyImportValue(cell.value).toLowerCase().trim());
    });

    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = row.getCell(i + 1).value;
      });
      rows.push(obj);
    });

    return rows;
  }

  private validateRow(
    entity: string,
    row: Record<string, unknown>,
    line: number,
  ): string[] {
    const errors: string[] = [];
    const required = this.getRequiredFields(entity);
    for (const field of required) {
      if (!row[field] && row[field] !== 0) {
        errors.push(`Ligne ${line} : champ "${field}" manquant`);
      }
    }
    return errors;
  }

  private getRequiredFields(entity: string): string[] {
    const map: Record<string, string[]> = {
      products: ['nom', 'prix_achat', 'prix_vente', 'quantite'],
      customers: ['nom'],
      suppliers: ['nom'],
    };
    return map[entity] ?? [];
  }

  private async processImport(
    entity: string,
    rows: Record<string, unknown>[],
  ): Promise<{ inserted: number; errors: string[]; duplicates: number }> {
    let inserted = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowErrors = this.validateRow(entity, row, i + 2);
      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      try {
        if (entity === 'products') {
          const ref =
            this.stringifyImportValue(
              row['reference'] || row['ref'] || '',
            ).trim() || `IMP-${Date.now()}-${i}`;
          const exists = await this.prisma.product.findFirst({
            where: { reference: ref },
          });
          if (exists) {
            duplicates++;
            continue;
          }

          const defaultCategory = await this.prisma.category.findFirst();
          const defaultBrand = await this.prisma.brand.findFirst();
          if (!defaultCategory || !defaultBrand) {
            errors.push(
              `Ligne ${i + 2} : aucune catégorie/marque disponible pour l'import`,
            );
            continue;
          }
          const uid = `${Date.now()}-${i}`;
          await this.prisma.product.create({
            data: {
              idProduct: uid,
              reference: ref,
              sku: `SKU-${uid}`,
              name: this.stringifyImportValue(row['nom'] ?? row['name']),
              categoryId: defaultCategory.id,
              brandId: defaultBrand.id,
              purchasePrice: Number(
                row['prix_achat'] ?? row['purchase_price'] ?? 0,
              ),
              salePrice: Number(row['prix_vente'] ?? row['sale_price'] ?? 0),
              quantity: Number(row['quantite'] ?? row['quantity'] ?? 0),
              minStock: Number(row['stock_min'] ?? row['min_stock'] ?? 0),
            },
          });
          inserted++;
        } else if (entity === 'customers') {
          const email = this.stringifyImportValue(row['email']).trim();
          if (email) {
            const exists = await this.prisma.customer.findFirst({
              where: { email },
            });
            if (exists) {
              duplicates++;
              continue;
            }
          }
          const refC =
            this.stringifyImportValue(row['reference'] ?? row['ref']).trim() ||
            `IMP-C-${Date.now()}-${i}`;
          await this.prisma.customer.create({
            data: {
              reference: refC,
              name: this.stringifyImportValue(row['nom'] ?? row['name']),
              email: email || undefined,
              phone:
                this.stringifyImportValue(row['telephone'] ?? row['phone']) ||
                undefined,
              address:
                this.stringifyImportValue(row['adresse'] ?? row['address']) ||
                undefined,
            },
          });
          inserted++;
        } else if (entity === 'suppliers') {
          const email = this.stringifyImportValue(row['email']).trim();
          if (email) {
            const exists = await this.prisma.supplier.findFirst({
              where: { email },
            });
            if (exists) {
              duplicates++;
              continue;
            }
          }
          const refS =
            this.stringifyImportValue(row['reference'] ?? row['ref']).trim() ||
            `IMP-S-${Date.now()}-${i}`;
          await this.prisma.supplier.create({
            data: {
              reference: refS,
              name: this.stringifyImportValue(row['nom'] ?? row['name']),
              email: email || undefined,
              phone:
                this.stringifyImportValue(row['telephone'] ?? row['phone']) ||
                undefined,
              address:
                this.stringifyImportValue(row['adresse'] ?? row['address']) ||
                undefined,
            },
          });
          inserted++;
        } else {
          throw new BadRequestException(`Import non supporté pour : ${entity}`);
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        errors.push(`Ligne ${i + 2} : ${(err as Error).message}`);
      }
    }

    return { inserted, errors, duplicates };
  }

  // ════════════════════════════════════════════════════════════
  // HEALTH
  // ════════════════════════════════════════════════════════════

  async getHealth(): Promise<SystemHealth> {
    const [dbHealth, minioHealth, smtpHealth, stats, lastBackup] =
      await Promise.all([
        this.checkDatabase(),
        this.checkMinio(),
        Promise.resolve(this.checkSmtp()),
        this.collectStats(),
        this.getLastBackupDate(),
      ]);

    return {
      database: dbHealth,
      minio: minioHealth,
      smtp: smtpHealth,
      disk: { backupsSize: await this.getBackupsSize(), uploadsSize: 0 },
      stats,
      lastBackup,
      uptime: process.uptime(),
    };
  }

  private async checkDatabase(): Promise<{
    status: 'ok' | 'error';
    message?: string;
    responseMs?: number;
  }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', responseMs: Date.now() - start };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  private async checkMinio(): Promise<{
    status: 'ok' | 'error';
    message?: string;
  }> {
    try {
      await this.minio.bucketExists(this.minio.bucket);
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  private checkSmtp(): {
    status: 'ok' | 'error';
    message?: string;
  } {
    try {
      const host = this.config.get<string>('SMTP_HOST');
      if (!host) return { status: 'error', message: 'SMTP_HOST non configuré' };
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  private async collectStats(): Promise<SystemHealth['stats']> {
    const [customers, products, sales, documents, auditLogs, dbSize] =
      await Promise.all([
        this.prisma.customer.count(),
        this.prisma.product.count({ where: { deletedAt: null } }),
        this.prisma.sale.count({ where: { deletedAt: null } }),
        this.prisma.generatedDocument.count({ where: { deletedAt: null } }),
        this.prisma.auditLog.count(),
        this.getDbSize(),
      ]);
    return {
      customers,
      products,
      sales,
      documents,
      auditLogs,
      dbSizeBytes: dbSize,
    };
  }

  private async getDbSize(): Promise<number> {
    try {
      const dbName = this.config.get<string>('DB_NAME', 'stockpro');
      const result = await this.prisma.$queryRaw<{ size: bigint }[]>`
        SELECT pg_database_size(${dbName}::text) as size
      `;
      return Number(result[0]?.size ?? 0);
    } catch {
      return 0;
    }
  }

  private inspectBackupStatus(
    zipPath: string,
  ): 'valid' | 'invalid' | 'missing-sql' {
    try {
      const zip = new AdmZip(zipPath);
      const entryNames = zip.getEntries().map((e) => e.entryName);

      if (entryNames.includes('manifest.json')) {
        const manifest = this.parseManifest(
          zip.getEntry('manifest.json')!.getData().toString('utf8'),
        );
        if (manifest.backupVersion === DATABASE_BACKUP_VERSION) {
          this.validateDatabaseZip(zipPath);
          return 'valid';
        }
      }

      if (
        !entryNames.includes('backup-manifest.json') &&
        !entryNames.includes('manifest.json') &&
        !entryNames.includes('metadata.json')
      ) {
        return 'invalid';
      }
      const dumpEntryName = [
        'database.dump',
        'database.sql',
        'dump.sql',
        'database/dump.sql',
        'database/dump.dump',
        'database/dump.backup',
      ].find((name) => entryNames.includes(name));
      if (!dumpEntryName) {
        return 'missing-sql';
      }

      const sqlEntry = zip.getEntry(dumpEntryName);
      if (!sqlEntry) return 'missing-sql';

      const uncompressedSize = sqlEntry.header.size;
      if (uncompressedSize === 0) return 'invalid';

      // Only decompress if very small — the "pg_dump not available" placeholder is ~50 bytes
      if (uncompressedSize < 500) {
        const content = sqlEntry.getData().toString('utf8');
        if (content.includes('pg_dump not available')) return 'invalid';
      }

      return 'valid';
    } catch {
      return 'invalid';
    }
  }

  private async getLastBackupDate(): Promise<string | null> {
    try {
      const backups = await this.listBackups();
      return backups[0]?.createdAt ?? null;
    } catch {
      return null;
    }
  }

  private async getBackupsSize(): Promise<number> {
    try {
      const backups = await this.backupStorage.listZipFiles();
      return backups.reduce((total, backup) => total + backup.size, 0);
    } catch {
      return 0;
    }
  }

  // ════════════════════════════════════════════════════════════
  // MAINTENANCE
  // ════════════════════════════════════════════════════════════

  async runMaintenance(
    action: string,
    user?: AuthUser,
  ): Promise<{ message: string; details?: unknown }> {
    let result: { message: string; details?: unknown };

    switch (action) {
      case 'clean-logs':
        result = await this.cleanOldLogs();
        break;
      case 'check-documents':
        result = await this.checkDocumentsIntegrity();
        break;
      case 'check-negative-stock':
        result = await this.checkNegativeStock();
        break;
      case 'clean-trash':
        result = await this.cleanOldTrash();
        break;
      case 'vacuum-db':
        result = await this.vacuumDatabase();
        break;
      case 'check-orphans':
        result = await this.checkOrphanedRecords();
        break;
      default:
        throw new BadRequestException(`Action inconnue : ${action}`);
    }

    await this.audit.create({
      userId: user?.id,
      action: `database.maintenance.${action}`,
      entity: 'database',
      metadata: result,
    });

    return result;
  }

  private async cleanOldLogs(): Promise<{ message: string; details: unknown }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const deleted = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return {
      message: `${deleted.count} logs supprimés (> 90 jours)`,
      details: { count: deleted.count },
    };
  }

  private async checkDocumentsIntegrity(): Promise<{
    message: string;
    details: unknown;
  }> {
    const docs = await this.prisma.generatedDocument.findMany({
      select: { id: true, minioObjectKey: true, minioBucket: true },
      where: { deletedAt: null },
    });
    let missing = 0;
    for (const doc of docs) {
      const exists = await this.minio
        .objectExists(doc.minioBucket, doc.minioObjectKey)
        .catch(() => false);
      if (!exists) missing++;
    }
    return {
      message:
        missing === 0
          ? 'Tous les documents sont intacts'
          : `${missing} document(s) manquant(s) dans MinIO`,
      details: { total: docs.length, missing },
    };
  }

  private async checkNegativeStock(): Promise<{
    message: string;
    details: unknown;
  }> {
    const products = await this.prisma.product.findMany({
      where: { quantity: { lt: 0 }, deletedAt: null },
      select: { id: true, name: true, reference: true, quantity: true },
    });
    return {
      message:
        products.length === 0
          ? 'Aucun stock négatif détecté'
          : `${products.length} produit(s) avec stock négatif`,
      details: { products },
    };
  }

  private async cleanOldTrash(): Promise<{
    message: string;
    details: unknown;
  }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const deleted = await this.prisma.sale.deleteMany({
      where: { deletedAt: { lt: cutoff, not: null } },
    });
    return {
      message: `${deleted.count} éléments supprimés définitivement depuis la corbeille (> 30 jours)`,
      details: { count: deleted.count },
    };
  }

  private async vacuumDatabase(): Promise<{
    message: string;
    details: unknown;
  }> {
    try {
      await this.prisma.$executeRaw`VACUUM ANALYZE`;
      return { message: 'VACUUM ANALYZE exécuté avec succès', details: {} };
    } catch (err) {
      return {
        message: `Erreur VACUUM : ${(err as Error).message}`,
        details: {},
      };
    }
  }

  private async checkOrphanedRecords(): Promise<{
    message: string;
    details: unknown;
  }> {
    const orphanedItems = await this.prisma.saleItem.count({
      where: { sale: { deletedAt: { not: null } } },
    });
    return {
      message:
        orphanedItems === 0
          ? 'Aucun enregistrement orphelin détecté'
          : `${orphanedItems} ligne(s) de vente orpheline(s) trouvées`,
      details: { orphanedSaleItems: orphanedItems },
    };
  }

  // ════════════════════════════════════════════════════════════
  // AUTO BACKUP CRON
  // ════════════════════════════════════════════════════════════

  @Cron('0 2 * * *')
  async autoBackupCron() {
    const enabled =
      this.config.get<string>('AUTO_BACKUP_ENABLED', 'true') === 'true';
    if (!enabled) return;

    this.logger.log('Auto-backup started (cron 02:00)');
    try {
      const result = await this.createBackup();
      this.logger.log(
        `Auto-backup completed: ${result.filename} (${result.size} bytes)`,
      );
    } catch (err) {
      this.logger.error('Auto-backup failed', (err as Error).message);
    }
  }

  private async applyBackupRetention(): Promise<void> {
    try {
      // listBackups sorts by the real filesystem creation date, newest first.
      const backups = await this.listBackups();
      const expiredBackups = backups.slice(MAX_BACKUPS);
      let deleted = 0;

      for (const backup of expiredBackups) {
        try {
          await this.backupStorage.remove(backup.filename);
          deleted += 1;
        } catch (error) {
          this.logger.error(
            `[BackupRetention] Échec de suppression de ${backup.filename}: ${(error as Error).message}`,
            (error as Error).stack,
          );
        }
      }

      this.logger.log(
        `[BackupRetention]\nTotal avant : ${backups.length}\nConservés : ${Math.min(backups.length, MAX_BACKUPS)}\nSupprimés : ${deleted}`,
      );
    } catch (error) {
      this.logger.error(
        `[BackupRetention] Impossible d'appliquer la politique de rétention: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  private dateStamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const milliseconds = String(d.getMilliseconds()).padStart(3, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${milliseconds}`;
  }

  private assertSafeBackupEntries(zip: AdmZip): void {
    for (const entry of zip.getEntries()) {
      const normalized = entry.entryName.replace(/\\/g, '/');
      const isUnsafePath =
        normalized.includes('\0') ||
        normalized.startsWith('/') ||
        normalized.startsWith('\\') ||
        normalized.split('/').includes('..') ||
        path.isAbsolute(normalized);
      const isDatabasePayload = [
        'database/postgres.dump',
        'database.dump',
        'database.sql',
        'dump.sql',
        'database/dump.sql',
        'database/dump.dump',
        'database/dump.backup',
      ].includes(normalized);
      const isMetadata = [
        'backup-manifest.json',
        'manifest.json',
        'metadata.json',
        'version.json',
      ].includes(normalized);
      const isObjectPayload =
        /^(minio|documents|uploads|pdf|exports|files)(\/|$)/i.test(normalized);
      const isAllowed =
        isDatabasePayload ||
        isMetadata ||
        normalized === 'database' ||
        normalized === 'database/' ||
        isObjectPayload;

      if (isUnsafePath || !isAllowed) {
        this.logger.warn(
          `[RESTORE] Rejected unsafe/out-of-scope ZIP entry: ${normalized}`,
        );
        throw new BadRequestException(
          `Archive hors périmètre : ${normalized}. Seuls le dump PostgreSQL, le manifest et les objets MinIO sont autorisés.`,
        );
      }
    }
    this.logger.log(`[RESTORE] Archive scope validated: PostgreSQL + MinIO`);
  }

  private extractSafeBackup(zip: AdmZip, extractDir: string): void {
    fs.mkdirSync(extractDir, { recursive: true, mode: 0o700 });
    for (const entry of zip.getEntries()) {
      const relative = entry.entryName.replace(/\\/g, '/').replace(/\/$/, '');
      if (!relative) continue;
      const destination = path.resolve(
        extractDir,
        relative.replace(/\//g, path.sep),
      );
      if (!destination.startsWith(`${path.resolve(extractDir)}${path.sep}`)) {
        throw new BadRequestException(
          `Chemin ZIP dangereux refusé : ${entry.entryName}`,
        );
      }
      if (entry.isDirectory) {
        fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
      } else {
        fs.mkdirSync(path.dirname(destination), {
          recursive: true,
          mode: 0o700,
        });
        fs.writeFileSync(destination, entry.getData(), { mode: 0o600 });
      }
    }
  }

  private findDatabaseDumpEntry(zip: AdmZip) {
    for (const name of [
      'database/postgres.dump',
      'database.dump',
      'database.sql',
      'dump.sql',
      'database/dump.sql',
      'database/dump.dump',
      'database/dump.backup',
    ]) {
      const entry = zip.getEntry(name);
      if (entry && !entry.isDirectory) return entry;
    }
    return null;
  }

  private parseManifest(rawManifest: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(rawManifest) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('objet JSON attendu');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      throw new BadRequestException(
        `manifest.json invalide : ${(error as Error).message}`,
      );
    }
  }

  private validateBackupManifest(
    rawManifest: string,
    extractDir: string,
  ): DatabaseBackupManifest {
    const manifest = this.parseManifest(
      rawManifest,
    ) as unknown as DatabaseBackupManifest;
    const expectedPrefix = `minio/${this.minio.bucket}/`;
    if (
      manifest.backupVersion !== DATABASE_BACKUP_VERSION ||
      manifest.type !== DATABASE_BACKUP_TYPE ||
      manifest.databaseFile !== 'database/postgres.dump' ||
      manifest.databaseFormat !== 'custom' ||
      manifest.containsDatabase !== true ||
      manifest.containsMinio !== true ||
      manifest.containsGeneratedDocuments !== true ||
      manifest.documentsMustBeRegenerated !== false ||
      manifest.minioBucket !== this.minio.bucket ||
      manifest.minioPrefix !== expectedPrefix ||
      !Number.isInteger(manifest.minioFileCount) ||
      manifest.minioFileCount < 0 ||
      typeof manifest.databaseName !== 'string' ||
      !manifest.databaseName ||
      typeof manifest.databaseSizeBytes !== 'number' ||
      typeof manifest.minioSizeBytes !== 'number' ||
      typeof manifest.totalSizeBytes !== 'number' ||
      manifest.checksumAlgorithm !== 'sha256' ||
      !manifest.checksums ||
      typeof manifest.checksums['database/postgres.dump'] !== 'string'
    ) {
      throw new BadRequestException(
        'manifest.json invalide ou incompatible avec le format FULL_SYSTEM',
      );
    }

    const files = this.walkFiles(extractDir);
    const payloadFiles = files
      .map((file) => path.relative(extractDir, file).replace(/\\/g, '/'))
      .filter((file) => file !== 'manifest.json')
      .sort();
    const expectedFiles = Object.keys(manifest.checksums).sort();
    if (JSON.stringify(payloadFiles) !== JSON.stringify(expectedFiles)) {
      throw new BadRequestException(
        `Contenu du ZIP différent du manifest : ${payloadFiles.join(', ')}`,
      );
    }

    let totalSizeBytes = 0;
    let minioSizeBytes = 0;
    let minioFileCount = 0;
    for (const relative of payloadFiles) {
      const filePath = path.join(extractDir, relative.replace(/\//g, path.sep));
      const size = fs.statSync(filePath).size;
      totalSizeBytes += size;
      if (relative.startsWith(expectedPrefix)) {
        minioFileCount += 1;
        minioSizeBytes += size;
      }
      if (this.sha256File(filePath) !== manifest.checksums[relative]) {
        throw new BadRequestException(
          `Checksum SHA-256 invalide pour ${relative}`,
        );
      }
    }
    const databaseSizeBytes = fs.statSync(
      path.join(extractDir, 'database', 'postgres.dump'),
    ).size;
    if (
      databaseSizeBytes === 0 ||
      databaseSizeBytes !== manifest.databaseSizeBytes ||
      minioFileCount !== manifest.minioFileCount ||
      minioSizeBytes !== manifest.minioSizeBytes ||
      totalSizeBytes !== manifest.totalSizeBytes
    ) {
      throw new BadRequestException(
        'Tailles ou nombre de fichiers incohérents dans manifest.json',
      );
    }
    return manifest;
  }

  private validateDatabaseOnlyManifest(
    rawManifest: string,
    dumpPath: string,
  ): void {
    const manifest = this.parseManifest(rawManifest);
    const checksum = (
      manifest.checksums as Record<string, unknown> | undefined
    )?.['database.dump'];
    if (
      manifest.backupVersion !== 3 ||
      manifest.type !== 'DATABASE_ONLY' ||
      manifest.containsDatabase !== true ||
      manifest.containsMinio !== false ||
      manifest.databaseFile !== 'database.dump' ||
      typeof checksum !== 'string' ||
      checksum !== this.sha256File(dumpPath)
    ) {
      throw new BadRequestException(
        'Ancien backup-manifest.json DATABASE_ONLY invalide',
      );
    }
  }

  private validateLegacyManifest(manifest: Record<string, unknown>): void {
    if (
      manifest.backupVersion !== 1 ||
      manifest.app !== 'Stockini' ||
      manifest.database !== 'postgresql' ||
      manifest.storage !== 'minio' ||
      manifest.bucket !== this.minio.bucket ||
      typeof manifest.createdAt !== 'string'
    ) {
      throw new BadRequestException('Ancien manifest.json invalide');
    }
  }

  private async createBackupManifest(
    dumpPath: string,
    createdAt: Date,
    minioExport: MinioExportResult,
  ): Promise<DatabaseBackupManifest> {
    const pgDumpVersion = this.commandVersion('pg_dump');
    const serverVersionRows = await this.prisma.$queryRawUnsafe<
      Array<{ server_version: string }>
    >('SHOW server_version');
    const migrationsDirectory = path.join(
      process.cwd(),
      'prisma',
      'migrations',
    );
    const prismaMigrationCount = fs.existsSync(migrationsDirectory)
      ? fs
          .readdirSync(migrationsDirectory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory()).length
      : 0;
    const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
    const schemaFingerprint = fs.existsSync(schemaPath)
      ? this.sha256File(schemaPath)
      : 'unavailable';
    const git = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    return {
      backupVersion: DATABASE_BACKUP_VERSION,
      type: DATABASE_BACKUP_TYPE,
      createdAt: createdAt.toISOString(),
      applicationVersion:
        git.status === 0
          ? git.stdout.trim()
          : (process.env.npm_package_version ?? 'unknown'),
      postgresServerVersion: serverVersionRows[0]?.server_version ?? 'unknown',
      pgDumpVersion,
      databaseName: this.getPostgresConnection().database,
      databaseFormat: 'custom',
      databaseFile: 'database/postgres.dump',
      containsDatabase: true,
      containsMinio: true,
      containsGeneratedDocuments: true,
      documentsMustBeRegenerated: false,
      minioBucket: this.minio.bucket,
      minioPrefix: `minio/${this.minio.bucket}/`,
      minioFileCount: minioExport.fileCount,
      databaseSizeBytes: fs.statSync(dumpPath).size,
      minioSizeBytes: minioExport.totalSizeBytes,
      totalSizeBytes: fs.statSync(dumpPath).size + minioExport.totalSizeBytes,
      prismaMigrationCount,
      schemaFingerprint,
      checksumAlgorithm: 'sha256',
      checksums: {
        'database/postgres.dump': this.sha256File(dumpPath),
        ...minioExport.checksums,
      },
    };
  }

  private walkFiles(directory: string): string[] {
    if (!fs.existsSync(directory)) return [];
    const files: string[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...this.walkFiles(full));
      else if (entry.isFile()) files.push(full);
    }
    return files;
  }

  private commandVersion(command: string): string {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
    return result.status === 0
      ? (result.stdout || result.stderr).trim()
      : 'unknown';
  }

  private sha256File(filePath: string): string {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  }

  private async assertDatabaseReachable(): Promise<void> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch (error) {
      throw new InternalServerErrorException(
        `PostgreSQL inaccessible : ${(error as Error).message}`,
      );
    }
  }

  private async assertPostgresToolCompatibility(): Promise<void> {
    const serverVersionRows = await this.prisma.$queryRawUnsafe<
      Array<{ server_version: string }>
    >('SHOW server_version');
    const serverVersion = serverVersionRows[0]?.server_version ?? 'unknown';
    const pgDumpVersion = this.commandVersion('pg_dump');
    const serverMajor = this.postgresMajor(serverVersion);
    const clientMajor = this.postgresMajor(pgDumpVersion);
    if (
      serverMajor !== null &&
      clientMajor !== null &&
      serverMajor !== clientMajor
    ) {
      throw new InternalServerErrorException(
        `Versions PostgreSQL incompatibles : serveur ${serverMajor}, pg_dump ${clientMajor}. Installer le client PostgreSQL ${serverMajor}.`,
      );
    }
  }

  private async assertRestoreCompatibility(
    manifest: DatabaseBackupManifest,
  ): Promise<void> {
    const serverVersionRows = await this.prisma.$queryRawUnsafe<
      Array<{ server_version: string }>
    >('SHOW server_version');
    const targetMajor = this.postgresMajor(
      serverVersionRows[0]?.server_version ?? 'unknown',
    );
    const dumpMajor = this.postgresMajor(manifest.pgDumpVersion);
    const restoreMajor = this.postgresMajor(this.commandVersion('pg_restore'));
    if (
      targetMajor !== null &&
      ((dumpMajor !== null && dumpMajor !== targetMajor) ||
        (restoreMajor !== null && restoreMajor !== targetMajor))
    ) {
      throw new BadRequestException(
        `Versions PostgreSQL incompatibles pour la restauration : cible ${targetMajor}, dump ${dumpMajor ?? 'inconnue'}, pg_restore ${restoreMajor ?? 'inconnue'}.`,
      );
    }
  }

  private postgresMajor(version: string): number | null {
    const match = version.match(/(?:PostgreSQL\)?\s+)?(\d+)(?:\.\d+)?/i);
    return match ? Number(match[1]) : null;
  }

  private async assertBackupDiskSpace(): Promise<void> {
    const dbSize = await this.getDbSize();
    const minimumFreeBytes = Math.max(dbSize * 2, 50 * 1024 * 1024);
    for (const directory of [os.tmpdir(), this.backupStorage.directory]) {
      const disk = fs.statfsSync(directory);
      const freeBytes = Number(disk.bavail) * Number(disk.bsize);
      if (freeBytes < minimumFreeBytes) {
        throw new InternalServerErrorException(
          `Espace disque insuffisant dans ${directory} : ${freeBytes} octets libres, ${minimumFreeBytes} requis`,
        );
      }
    }
  }

  private async validateRestoredDatabase(): Promise<void> {
    const requiredTables = ['User', 'Customer', 'Product', 'Sale'];
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ table_name: string }>
    >(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const found = new Set(rows.map((row) => row.table_name));
    const missing = requiredTables.filter((table) => !found.has(table));
    if (missing.length) {
      throw new InternalServerErrorException(
        `Schéma restauré incomplet — tables manquantes : ${missing.join(', ')}`,
      );
    }

    this.logger.log(
      `[RESTORE][VALIDATION] ${requiredTables.length} critical tables present`,
    );
  }

  private getPostgresConnection(): PostgresConnection {
    const databaseUrl = this.config.get<string>('DATABASE_URL')?.trim();
    if (databaseUrl) {
      try {
        const parsed = new URL(databaseUrl);
        return {
          host: parsed.hostname,
          port: parsed.port || '5432',
          user: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
          database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
        };
      } catch (error) {
        throw new InternalServerErrorException(
          `DATABASE_URL invalide : ${(error as Error).message}`,
        );
      }
    }

    const connection = {
      host: this.config.get<string>('POSTGRES_HOST', 'localhost'),
      port: this.config.get<string>('POSTGRES_PORT', '5432'),
      user: this.config.get<string>('POSTGRES_USER', ''),
      password: this.config.get<string>('POSTGRES_PASSWORD', ''),
      database: this.config.get<string>('POSTGRES_DB', ''),
    };
    if (!connection.user || !connection.database) {
      throw new InternalServerErrorException(
        'Configuration PostgreSQL incomplète : définir DATABASE_URL ou POSTGRES_HOST/PORT/USER/PASSWORD/DB',
      );
    }
    return connection;
  }

  private preparePostgresForRestore(): void {
    const connection = this.getPostgresConnection();
    const sql = 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;';
    const args = [
      '-h',
      connection.host,
      '-p',
      connection.port,
      '-U',
      connection.user,
      '-d',
      connection.database,
      '--set=ON_ERROR_STOP=1',
      '-c',
      sql,
    ];
    this.logger.log(
      `[RESTORE][PREPARE] Command: psql -h ${connection.host} -p ${connection.port} -U ${connection.user} -d ${connection.database} -c "${sql}"`,
    );
    const result = this.runPostgresCommand('psql', args);
    this.assertPostgresCommandSucceeded('Préparation PostgreSQL', result);
  }

  private runPostgresCommand(
    tool: 'psql' | 'pg_restore',
    nativeArgs: string[],
  ) {
    const connection = this.getPostgresConnection();
    const result = spawnSync(tool, nativeArgs, {
      env: { ...process.env, PGPASSWORD: connection.password },
      encoding: 'utf8',
      maxBuffer: 500 * 1024 * 1024,
    });
    if (result.error) {
      this.logger.error(
        `[RESTORE] Impossible d'exécuter ${tool}: ${result.error.message}`,
      );
      throw new InternalServerErrorException(
        "postgresql-client n'est pas installé dans l'image backend.",
      );
    }
    return result;
  }

  private assertPostgresCommandSucceeded(
    operation: string,
    result: ReturnType<typeof spawnSync>,
  ): void {
    const stdout = result.stdout
      ? Buffer.from(result.stdout as any)
          .toString('utf8')
          .trim()
      : '';
    const stderr = result.stderr
      ? Buffer.from(result.stderr as any)
          .toString('utf8')
          .trim()
      : '';
    this.logger.log(
      `[RESTORE] ${operation} exit code: ${result.status ?? 'interrupted'}`,
    );
    this.logger.log(`[RESTORE] ${operation} stdout: ${stdout || '(empty)'}`);
    this.logger.log(`[RESTORE] ${operation} stderr: ${stderr || '(empty)'}`);
    if (result.status !== 0) {
      if (
        /could not connect|connection refused|connection.*failed|password authentication failed|no pg_hba\.conf entry|could not translate host name/i.test(
          stderr,
        )
      ) {
        throw new InternalServerErrorException(
          'Connexion PostgreSQL impossible. Vérifier POSTGRES_HOST/PORT/USER/PASSWORD/DB.',
        );
      }
      throw new InternalServerErrorException(
        `${operation} échouée : ${stderr || stdout || `exit ${result.status ?? 'interrompu'}`}`,
      );
    }
  }

  private deployCurrentMigrations(): void {
    this.logger.log(
      '[RESTORE][STEP=prisma-migrate] Applying pending migrations',
    );
    const prismaCli = path.join(
      process.cwd(),
      'node_modules',
      'prisma',
      'build',
      'index.js',
    );
    if (!fs.existsSync(prismaCli)) {
      throw new InternalServerErrorException(
        'Migration Prisma impossible : CLI Prisma absent du conteneur',
      );
    }
    const result = spawnSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy'],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      },
    );
    const stdout = result.stdout?.trim() ?? '';
    const stderr = result.stderr?.trim() ?? '';
    this.logger.log(
      `[RESTORE][STEP=prisma-migrate] Exit code: ${result.status ?? 'interrupted'}`,
    );
    if (stdout) this.logger.log(`[RESTORE][STEP=prisma-migrate] ${stdout}`);
    if (result.error || result.status !== 0) {
      throw new InternalServerErrorException(
        `Migration Prisma après restauration échouée : ${stderr || stdout || result.error?.message || `exit ${result.status ?? 'interrompu'}`}`,
      );
    }
    this.logger.log('[RESTORE][STEP=prisma-migrate] Schema is current');
  }

  private dumpPostgres(outputPath: string): void {
    const {
      user,
      password,
      host,
      port,
      database: dbName,
    } = this.getPostgresConnection();

    this.logger.log(
      `[PG_DUMP] Starting — db=${dbName} host=${host} port=${port} user=${user}`,
    );
    this.logger.log(`[PG_DUMP] Output path: ${outputPath}`);

    this.logger.log(
      `[PG_DUMP] Command: pg_dump --format=custom --no-owner --no-privileges --file=${outputPath} -h ${host} -p ${port} -U ${user} -d ${dbName}`,
    );
    const result = spawnSync(
      'pg_dump',
      [
        '--no-password',
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        `--file=${outputPath}`,
        '-h',
        host,
        '-p',
        port,
        '-U',
        user,
        dbName,
      ],
      {
        env: { ...process.env, PGPASSWORD: password },
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'buffer',
      },
    );

    if (result.error) {
      this.logger.error(
        `[PG_DUMP] Impossible d'exécuter pg_dump: ${result.error.message}`,
      );
      throw new InternalServerErrorException(
        "postgresql-client n'est pas installé dans l'image backend.",
      );
    }

    const stderr = result.stderr
      ? Buffer.from(result.stderr).toString('utf8').trim()
      : '';
    this.logger.log(`[PG_DUMP] Exit code: ${result.status}`);
    if (stderr) this.logger.log(`[PG_DUMP] STDERR: ${stderr}`);

    if (result.status !== 0) {
      if (
        /could not connect|connection refused|connection.*failed|password authentication failed|no pg_hba\.conf entry|could not translate host name/i.test(
          stderr,
        )
      ) {
        throw new InternalServerErrorException(
          'Connexion PostgreSQL impossible. Vérifier POSTGRES_HOST/PORT/USER/PASSWORD/DB.',
        );
      }
      throw new InternalServerErrorException(
        `pg_dump a échoué (exit ${result.status ?? 'null'}): ${stderr || 'pas de message'}`,
      );
    }

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new InternalServerErrorException('pg_dump a produit un dump vide');
    }
    this.logger.log(
      `[PG_DUMP] Custom dump written successfully: ${outputPath} (${fs.statSync(outputPath).size} bytes)`,
    );
  }

  private restorePostgres(dumpPath: string): void {
    const connection = this.getPostgresConnection();
    const extension = path.extname(dumpPath).toLowerCase();
    const signature = fs
      .readFileSync(dumpPath)
      .subarray(0, 5)
      .toString('ascii');
    const isCustomDump =
      signature === 'PGDMP' || extension === '.dump' || extension === '.backup';
    const isPlainSql = !isCustomDump;
    const tool = isPlainSql ? 'psql' : 'pg_restore';
    const common = [
      '-h',
      connection.host,
      '-p',
      connection.port,
      '-U',
      connection.user,
      '-d',
      connection.database,
    ];
    let effectiveDumpPath = dumpPath;
    if (isPlainSql) {
      const sql = fs.readFileSync(dumpPath, 'utf8');
      const sanitized = sql.replace(
        /^\s*SET\s+transaction_timeout\s*=\s*0\s*;\s*$/gim,
        '',
      );
      if (sanitized !== sql) {
        effectiveDumpPath = path.join(
          path.dirname(dumpPath),
          'dump-without-transaction-timeout.sql',
        );
        fs.writeFileSync(effectiveDumpPath, sanitized, { mode: 0o600 });
        this.logger.warn(
          '[RESTORE] Removed legacy SET transaction_timeout = 0 compatibility statement',
        );
      }
    }
    const nativeArgs = isPlainSql
      ? [...common, '--set=ON_ERROR_STOP=1', '-f', effectiveDumpPath]
      : [
          ...common,
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-privileges',
          '--exit-on-error',
          effectiveDumpPath,
        ];
    this.logger.log(
      `[RESTORE] Dump format: ${isPlainSql ? 'plain SQL' : 'PostgreSQL custom'} (extension=${extension}, signature=${signature === 'PGDMP' ? 'PGDMP' : 'text'})`,
    );
    this.logger.log(
      `[RESTORE] Command: ${tool} ${nativeArgs.join(' ')} (PGPASSWORD hidden)`,
    );
    const result = this.runPostgresCommand(tool, nativeArgs);
    this.assertPostgresCommandSucceeded(`${tool} restore`, result);
    this.logger.log(`[RESTORE] PostgreSQL restore completed successfully`);
  }

  private async exportMinio(targetDir: string): Promise<MinioExportResult> {
    let keys: string[];
    try {
      if (!(await this.minio.bucketExists(this.minio.bucket))) {
        throw new Error(`bucket "${this.minio.bucket}" absent`);
      }
      keys = await this.minio.listAllObjects(this.minio.bucket);
    } catch (error) {
      throw new InternalServerErrorException(
        `Sauvegarde MinIO impossible : ${(error as Error).message}`,
      );
    }

    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    const checksums: Record<string, string> = {};
    let totalSizeBytes = 0;
    for (const key of keys.sort()) {
      const normalized = key.replace(/\\/g, '/');
      if (
        !normalized ||
        key.includes('\\') ||
        normalized.startsWith('/') ||
        normalized.includes('\0') ||
        normalized.split('/').includes('..')
      ) {
        throw new InternalServerErrorException(
          `Clé MinIO hors périmètre : ${key}`,
        );
      }
      const targetRoot = path.resolve(targetDir);
      const destination = path.resolve(
        targetRoot,
        normalized.replace(/\//g, path.sep),
      );
      if (!destination.startsWith(`${targetRoot}${path.sep}`)) {
        throw new InternalServerErrorException(
          `Clé MinIO hors périmètre : ${key}`,
        );
      }
      try {
        const buffer = await this.minio.getObject(this.minio.bucket, key);
        fs.mkdirSync(path.dirname(destination), {
          recursive: true,
          mode: 0o700,
        });
        fs.writeFileSync(destination, buffer, { mode: 0o600 });
        totalSizeBytes += buffer.length;
        checksums[`minio/${this.minio.bucket}/${normalized}`] = createHash(
          'sha256',
        )
          .update(buffer)
          .digest('hex');
      } catch (error) {
        throw new InternalServerErrorException(
          `Sauvegarde MinIO impossible pour "${key}" : ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`[BACKUP] MinIO: ${keys.length} objet(s) exporté(s)`);
    return { fileCount: keys.length, totalSizeBytes, checksums };
  }

  private async importMinio(
    sourceDir: string,
    clearExisting = false,
  ): Promise<number> {
    const sourceRoot = path.resolve(sourceDir);
    const objects = this.walkFiles(sourceRoot).map((filePath) => ({
      key: path.relative(sourceRoot, filePath).replace(/\\/g, '/'),
      buffer: fs.readFileSync(filePath),
    }));

    await this.minio.ensureBucketOrThrow(this.minio.bucket);
    if (clearExisting) {
      const existingKeys = await this.minio.listAllObjects(this.minio.bucket);
      for (const key of existingKeys) {
        await this.minio.removeObject(this.minio.bucket, key);
      }
      this.logger.log(
        `[RESTORE] MinIO: ${existingKeys.length} ancien(s) objet(s) supprimé(s)`,
      );
    }
    for (const object of objects) {
      await this.minio.putObject(
        this.minio.bucket,
        object.key,
        object.buffer,
        'application/octet-stream',
      );
    }
    return objects.length;
  }

  private async verifyMinioManifest(
    manifest: DatabaseBackupManifest,
  ): Promise<void> {
    const keys = (await this.minio.listAllObjects(this.minio.bucket)).sort();
    const expectedKeys = Object.keys(manifest.checksums)
      .filter((name) => name.startsWith(manifest.minioPrefix))
      .map((name) => name.slice(manifest.minioPrefix.length))
      .sort();
    if (
      keys.length !== manifest.minioFileCount ||
      JSON.stringify(keys) !== JSON.stringify(expectedKeys)
    ) {
      throw new InternalServerErrorException(
        `Vérification MinIO échouée : ${manifest.minioFileCount} objets attendus, ${keys.length} trouvés`,
      );
    }
    for (const key of keys) {
      const buffer = await this.minio.getObject(this.minio.bucket, key);
      const checksum = createHash('sha256').update(buffer).digest('hex');
      if (checksum !== manifest.checksums[`${manifest.minioPrefix}${key}`]) {
        throw new InternalServerErrorException(
          `Vérification MinIO échouée pour "${key}"`,
        );
      }
    }
  }

  private async rollbackRestore(
    safetyDumpPath: string,
    minioSafetyDir: string,
  ): Promise<void> {
    const failures: string[] = [];
    await this.prisma.$disconnect();
    try {
      this.preparePostgresForRestore();
      this.restorePostgres(safetyDumpPath);
    } catch (error) {
      failures.push(`PostgreSQL: ${(error as Error).message}`);
    } finally {
      await this.prisma.$connect();
    }
    try {
      await this.importMinio(minioSafetyDir, true);
    } catch (error) {
      failures.push(`MinIO: ${(error as Error).message}`);
    }
    if (failures.length) {
      throw new InternalServerErrorException(
        `Rollback incomplet (${failures.join('; ')}). Dump de sécurité conservé : ${safetyDumpPath}`,
      );
    }
  }

  private createDatabaseZip(payloadDir: string, destPath: string): void {
    const zip = new AdmZip();
    zip.addLocalFolder(payloadDir, '');
    const minioDirectory = `minio/${this.minio.bucket}/`;
    if (!zip.getEntry(minioDirectory)) {
      zip.addFile(minioDirectory, Buffer.alloc(0));
    }
    zip.writeZip(destPath);
  }

  private validateDatabaseZip(zipPath: string): void {
    const verifyDir = path.join(
      path.dirname(zipPath),
      `verify-${path.basename(zipPath, '.zip')}`,
    );
    try {
      const zip = new AdmZip(zipPath);
      zip.getEntries();
      this.assertSafeBackupEntries(zip);
      const manifestEntry = zip.getEntry('manifest.json');
      const dumpEntry = zip.getEntry('database/postgres.dump');
      if (!manifestEntry || !dumpEntry || dumpEntry.header.size === 0) {
        throw new Error(
          'manifest.json ou database/postgres.dump absent ou vide',
        );
      }
      this.extractSafeBackup(zip, verifyDir);
      this.validateBackupManifest(
        manifestEntry.getData().toString('utf8'),
        verifyDir,
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Vérification du ZIP échouée : ${(error as Error).message}`,
      );
    } finally {
      fs.rmSync(verifyDir, { recursive: true, force: true });
    }
  }

  private readBackupType(zipPath: string): BackupInfo['type'] {
    try {
      const zip = new AdmZip(zipPath);
      const manifestEntry = zip.getEntry('manifest.json');
      if (manifestEntry) {
        const manifest = JSON.parse(
          manifestEntry.getData().toString('utf8'),
        ) as { backupVersion?: number };
        return manifest.backupVersion === DATABASE_BACKUP_VERSION
          ? DATABASE_BACKUP_TYPE
          : 'LEGACY';
      }
      if (zip.getEntry('backup-manifest.json')) return 'DATABASE_ONLY';
      return 'LEGACY';
    } catch {
      return 'LEGACY';
    }
  }
}
