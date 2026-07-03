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
import AdmZip from 'adm-zip';
import * as ExcelJS from 'exceljs';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { BackupStorageService } from './backup-storage.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: string;
  createdBy: string;
  type: string;
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

  async createBackup(user?: AuthUser): Promise<{ filename: string; size: number; path: string }> {
    if (this.restoreInProgress) throw new ConflictException('Une restauration est en cours');
    if (this.backupInProgress) throw new ConflictException('Une sauvegarde est déjà en cours');
    this.backupInProgress = true;
    await this.backupStorage.ensureAccessible();

    const now = new Date();
    const stamp = this.dateStamp(now);
    const tmpDir = path.join(os.tmpdir(), `backup-${stamp}-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      this.logger.log(`[BACKUP] Starting backup: ${stamp}`);

      // 1. SQL dump
      const databaseDir = path.join(tmpDir, 'database');
      fs.mkdirSync(databaseDir, { recursive: true });
      await this.dumpPostgres(path.join(databaseDir, 'dump.sql'));
      this.logger.log(`[BACKUP] SQL dump completed`);

      // 2. Full MinIO export, preserving every object key.
      const minioDir = path.join(tmpDir, 'minio', this.minio.bucket);
      fs.mkdirSync(minioDir, { recursive: true });
      await this.exportMinio(minioDir);
      this.logger.log(`[BACKUP] MinIO export completed`);

      // 3. Metadata
      const metadata = {
        app: 'Stockini',
        createdAt: now.toISOString(),
        database: 'postgresql',
        storage: 'minio',
        bucket: this.minio.bucket,
        backupVersion: 1,
      };
      fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(metadata, null, 2));

      // 5. Create ZIP
      const zipName = `backup-${stamp}.zip`;
      const zipPath = await this.backupStorage.destination(zipName);
      this.createZip(tmpDir, zipPath);
      this.logger.log(`[BACKUP] ZIP created`);

      const size = fs.statSync(zipPath).size;
      if (size === 0) {
        fs.rmSync(zipPath, { force: true });
        throw new InternalServerErrorException('ZIP créé vide — échec de la compression');
      }
      this.logger.log(`[BACKUP] ZIP size: ${size} bytes`);

      await this.audit.create({
        userId: user?.id,
        action: 'database.backup.created',
        entity: 'database',
        metadata: { filename: zipName, size, createdBy: user?.email ?? 'system' },
      });

      return { filename: zipName, size, path: zipPath };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      this.backupInProgress = false;
    }
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
          type: 'full',
          path: full,
          status: this.inspectBackupStatus(full),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

  async restoreBackup(zipBuffer: Buffer, user?: AuthUser, options: RestoreOptions = {}): Promise<{ restored: string[] }> {
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

    this.logger.log(`[RESTORE] Upload received: ${options.uploadedFilename ?? 'server backup'}`);
    this.logger.log(`[RESTORE] File size: ${zipBuffer.length} bytes`);
    this.logger.log(`[RESTORE] Mode: full database + MinIO`);
    this.logger.log(`[RESTORE] Temporary workspace: ${tmpDir}`);

    try {
      // 1. Write ZIP to temp dir
      const zipPath = path.join(tmpDir, 'restore.zip');
      fs.writeFileSync(zipPath, zipBuffer);

      // 2. Validate ZIP integrity with AdmZip (no external binary dependency)
      this.logger.log(`[RESTORE] Validating ZIP...`);
      let zip: AdmZip;
      try {
        zip = new AdmZip(zipPath);
        zip.getEntries();
      } catch (error) {
        throw new BadRequestException(`Archive ZIP invalide ou corrompue : ${(error as Error).message}`);
      }

      if (zipBuffer.length === 0) {
        throw new BadRequestException('Le fichier ZIP est vide');
      }

      this.assertSafeBackupEntries(zip);
      this.logger.log(
        `[RESTORE] ZIP entries (${zip.getEntries().length}): ${zip.getEntries().map((entry) => entry.entryName).join(', ')}`,
      );

      // 3. Extract to sub-directory to avoid mixing with restore.zip
      const extractDir = path.join(tmpDir, 'extracted');
      fs.mkdirSync(extractDir, { recursive: true });
      try {
        zip.extractAllTo(extractDir, true);
      } catch (error) {
        throw new BadRequestException(`Impossible d'extraire le fichier ZIP : ${(error as Error).message}`);
      }
      this.logger.log(`[RESTORE] ZIP validated and extracted to: ${extractDir}`);

      // 4. Validate required files
      const dumpPath = ['database/dump.sql', 'database/dump.dump', 'database/dump.backup']
        .map((name) => path.join(extractDir, name))
        .find((candidate) => fs.existsSync(candidate));
      // New backups use manifest.json. Keep metadata.json readable so existing
      // production archives remain restorable after this deployment.
      const metadataPath = ['manifest.json', 'metadata.json']
        .map((name) => path.join(extractDir, name))
        .find((candidate) => fs.existsSync(candidate));

      if (!dumpPath) {
        throw new BadRequestException('Dump PostgreSQL absent (attendu : database/dump.sql, dump.dump ou dump.backup)');
      }
      if (!metadataPath) {
        throw new BadRequestException('Métadonnées absentes (manifest.json ou metadata.json)');
      }
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
        if (
          metadata.app !== 'Stockini' ||
          metadata.database !== 'postgresql' || typeof metadata.createdAt !== 'string' ||
          metadata.storage !== 'minio' || metadata.bucket !== this.minio.bucket ||
          metadata.backupVersion !== 1
        ) {
          throw new Error('champs requis invalides');
        }
      } catch (error) {
        throw new BadRequestException(`manifest.json invalide : ${(error as Error).message}`);
      }
      const dumpStat = fs.statSync(dumpPath);
      if (dumpStat.size === 0) throw new BadRequestException(`Le dump ${path.basename(dumpPath)} est vide`);
      if (path.extname(dumpPath).toLowerCase() === '.sql') {
        const sqlPreview = fs.readFileSync(dumpPath, 'utf8').slice(0, 4096);
        if (sqlPreview.includes('pg_dump not available')) {
          throw new BadRequestException(
            'Ce backup ne contient pas de dump SQL valide (pg_dump n\'était pas disponible lors de la création)',
          );
        }
      }

      this.logger.log(`[RESTORE] Database dump path: ${dumpPath}`);
      this.logger.log(`[RESTORE] Dump detected: ${path.basename(dumpPath)} (${dumpStat.size} bytes)`);
      this.logger.log(`[RESTORE] ZIP validated`);

      const restored: string[] = [];

      // 6. Restore SQL
      this.logger.log(`[RESTORE][STEP=postgres] Restore started`);
      await this.prisma.$disconnect();
      try {
        this.preparePostgresForRestore();
        this.restorePostgres(dumpPath);
        this.deployCurrentMigrations();
      } finally {
        await this.prisma.$connect();
      }
      restored.push(path.basename(dumpPath));
      this.logger.log(`[RESTORE][STEP=postgres] Restore completed`);

      // The dump may come from an older release. Reconnect the Prisma pool,
      // apply current migrations, and verify the restored schema before success.
      await this.validateRestoredDatabase();
      restored.push('prisma-schema');

      // 7. Restore MinIO only after the database is healthy.
      const minioDir = path.join(extractDir, 'minio', this.minio.bucket);
      if (!fs.existsSync(minioDir)) {
        throw new BadRequestException(`minio/${this.minio.bucket} not found in backup`);
      }
      await this.minio.ensureBucketOrThrow(this.minio.bucket);
      this.logger.log(`[RESTORE] MinIO restore started; replacing bucket ${this.minio.bucket}`);
      const expectedObjects = await this.importMinio(minioDir, true);
      const actualObjects = (await this.minio.listAllObjects(this.minio.bucket)).length;
      if (actualObjects !== expectedObjects) {
        throw new InternalServerErrorException(
          `MinIO health check failed: expected ${expectedObjects} objects, found ${actualObjects}`,
        );
      }
      restored.push(`minio/${this.minio.bucket}/`);
      this.logger.log(`[RESTORE] MinIO restore completed and verified (${actualObjects} objects)`);

      // Final health check after both restore phases are complete.
      await this.validateRestoredDatabase();
      this.logger.log(`[RESTORE] Final database + MinIO health check passed`);

      // 8. Audit log
      await this.audit.create({
        userId: user?.id,
        action: 'database.backup.restored',
        entity: 'database',
        metadata: { restored, restoredBy: user?.email ?? 'system' },
      });

      this.logger.log(`[RESTORE] Restore completed successfully — restored: ${restored.join(', ')}`);
      return { restored };
    } catch (err) {
      this.logger.error(
        `[RESTORE][ERROR] ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    } finally {
      // 9. Cleanup temp dir
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
      this.restoreInProgress = false;
    }
  }

  async restoreBackupByFilename(filename: string, user?: AuthUser, options: RestoreOptions = {}): Promise<{ restored: string[] }> {
    try {
      this.logger.log(`[RESTORE][SOURCE=local] Backup filename: ${filename}`);
      this.logger.log(`[RESTORE][SOURCE=local] Backup directory: ${this.backupStorage.directory}`);
      const zipBuffer = await this.backupStorage.read(filename);
      return await this.restoreBackup(zipBuffer, user, {
        ...options,
        uploadedFilename: path.basename(filename),
      });
    } catch (error) {
      this.logger.error(`[RESTORE][FILENAME=${filename}] ${(error as Error).message}`, (error as Error).stack);
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
    const dateFilter = dateFrom || dateTo
      ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
      : {};

    switch (entity) {
      case 'products':
        return (await this.prisma.product.findMany({
          where: { deletedAt: null, ...dateFilter },
          include: { category: { select: { name: true } }, brand: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        })).map((p) => ({
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
        return (await this.prisma.customer.findMany({
          where: { ...dateFilter },
          orderBy: { createdAt: 'desc' },
        })).map((c) => ({
          reference: c.reference,
          nom: c.name,
          email: c.email ?? '',
          telephone: c.phone ?? '',
          adresse: c.address ?? '',
          solde_credit: Number(c.creditBalance ?? 0),
          cree_le: c.createdAt.toISOString(),
        }));

      case 'suppliers':
        return (await this.prisma.supplier.findMany({
          where: { ...dateFilter },
          orderBy: { createdAt: 'desc' },
        })).map((s) => ({
          nom: s.name,
          email: s.email ?? '',
          telephone: s.phone ?? '',
          adresse: s.address ?? '',
          cree_le: s.createdAt.toISOString(),
        }));

      case 'sales':
        return (await this.prisma.sale.findMany({
          where: { deletedAt: null, ...dateFilter },
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        })).map((s) => ({
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
        return (await this.prisma.purchase.findMany({
          where: { deletedAt: null, ...dateFilter },
          include: { supplier: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        })).map((p) => ({
          numero: p.orderNumber,
          fournisseur: p.supplier?.name ?? '',
          statut: p.status,
          total: Number(p.total ?? 0),
          paye: Number(p.paidAmount ?? 0),
          restant: Number(p.remainingAmount ?? 0),
          cree_le: p.createdAt.toISOString(),
        }));

      case 'payments':
        return (await this.prisma.payment.findMany({
          where: { deletedAt: null, ...dateFilter },
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        })).map((p) => ({
          client: p.customer?.name ?? '',
          montant: Number(p.amount),
          type: p.type,
          mode: p.method,
          reference: p.reference ?? '',
          cree_le: p.createdAt.toISOString(),
        }));

      case 'stock':
        return (await this.prisma.product.findMany({
          where: { deletedAt: null, isActive: true },
          include: { category: { select: { name: true } } },
          orderBy: { quantity: 'asc' },
        })).map((p) => ({
          reference: p.reference,
          nom: p.name,
          categorie: p.category?.name ?? '',
          quantite: p.quantity,
          stock_min: p.minStock,
          valeur_stock: Number(p.purchasePrice) * p.quantity,
          alerte: p.quantity <= p.minStock ? 'Oui' : 'Non',
        }));

      case 'audit_logs':
        return (await this.prisma.auditLog.findMany({
          where: { ...dateFilter },
          include: { user: { select: { fullName: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10000,
        })).map((l) => ({
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

  private async toExcel(rows: Record<string, unknown>[], sheetName: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);

    if (rows.length === 0) {
      ws.addRow(['Aucune donnée']);
      return Buffer.from(await wb.xlsx.writeBuffer());
    }

    const headers = Object.keys(rows[0]);
    const headerRow = ws.addRow(headers);
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
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
            const s = String(v);
            return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(';'),
      ),
    ];
    return Buffer.from('﻿' + lines.join('\n'), 'utf8');
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
      metadata: { entity, inserted: result.inserted, errors: result.errors.length },
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
      const text = buffer.toString('utf8').replace(/^﻿/, '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return [];
      const sep = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
      return lines.slice(1).map((line) => {
        const values = line.split(sep);
        return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? '']));
      });
    }

    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];

    const headers: string[] = [];
    ws.getRow(1).eachCell((cell) => {
      headers.push(String(cell.value ?? '').toLowerCase().trim());
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

  private validateRow(entity: string, row: Record<string, unknown>, line: number): string[] {
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
          const ref = String(row['reference'] || row['ref'] || '').trim() || `IMP-${Date.now()}-${i}`;
          const exists = await this.prisma.product.findFirst({ where: { reference: ref } });
          if (exists) { duplicates++; continue; }

          const defaultCategory = await this.prisma.category.findFirst();
          const defaultBrand = await this.prisma.brand.findFirst();
          if (!defaultCategory || !defaultBrand) {
            errors.push(`Ligne ${i + 2} : aucune catégorie/marque disponible pour l'import`);
            continue;
          }
          const uid = `${Date.now()}-${i}`;
          await this.prisma.product.create({
            data: {
              idProduct: uid,
              reference: ref,
              sku: `SKU-${uid}`,
              name: String(row['nom'] ?? row['name'] ?? ''),
              categoryId: defaultCategory.id,
              brandId: defaultBrand.id,
              purchasePrice: Number(row['prix_achat'] ?? row['purchase_price'] ?? 0),
              salePrice: Number(row['prix_vente'] ?? row['sale_price'] ?? 0),
              quantity: Number(row['quantite'] ?? row['quantity'] ?? 0),
              minStock: Number(row['stock_min'] ?? row['min_stock'] ?? 0),
            },
          });
          inserted++;
        } else if (entity === 'customers') {
          const email = String(row['email'] ?? '').trim();
          if (email) {
            const exists = await this.prisma.customer.findFirst({ where: { email } });
            if (exists) { duplicates++; continue; }
          }
          const refC = String(row['reference'] ?? row['ref'] ?? '').trim() || `IMP-C-${Date.now()}-${i}`;
          await this.prisma.customer.create({
            data: {
              reference: refC,
              name: String(row['nom'] ?? row['name'] ?? ''),
              email: email || undefined,
              phone: String(row['telephone'] ?? row['phone'] ?? '') || undefined,
              address: String(row['adresse'] ?? row['address'] ?? '') || undefined,
            },
          });
          inserted++;
        } else if (entity === 'suppliers') {
          const email = String(row['email'] ?? '').trim();
          if (email) {
            const exists = await this.prisma.supplier.findFirst({ where: { email } });
            if (exists) { duplicates++; continue; }
          }
          const refS = String(row['reference'] ?? row['ref'] ?? '').trim() || `IMP-S-${Date.now()}-${i}`;
          await this.prisma.supplier.create({
            data: {
              reference: refS,
              name: String(row['nom'] ?? row['name'] ?? ''),
              email: email || undefined,
              phone: String(row['telephone'] ?? row['phone'] ?? '') || undefined,
              address: String(row['adresse'] ?? row['address'] ?? '') || undefined,
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
    const [dbHealth, minioHealth, smtpHealth, stats, lastBackup] = await Promise.all([
      this.checkDatabase(),
      this.checkMinio(),
      this.checkSmtp(),
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

  private async checkDatabase(): Promise<{ status: 'ok' | 'error'; message?: string; responseMs?: number }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', responseMs: Date.now() - start };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  private async checkMinio(): Promise<{ status: 'ok' | 'error'; message?: string }> {
    try {
      await this.minio.bucketExists(this.minio.bucket);
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  private async checkSmtp(): Promise<{ status: 'ok' | 'error'; message?: string }> {
    try {
      const host = this.config.get<string>('SMTP_HOST');
      if (!host) return { status: 'error', message: 'SMTP_HOST non configuré' };
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
  }

  private async collectStats(): Promise<SystemHealth['stats']> {
    const [customers, products, sales, documents, auditLogs, dbSize] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.sale.count({ where: { deletedAt: null } }),
      this.prisma.generatedDocument.count({ where: { deletedAt: null } }),
      this.prisma.auditLog.count(),
      this.getDbSize(),
    ]);
    return { customers, products, sales, documents, auditLogs, dbSizeBytes: dbSize };
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

  private inspectBackupStatus(zipPath: string): 'valid' | 'invalid' | 'missing-sql' {
    try {
      const zip = new AdmZip(zipPath);
      const entryNames = zip.getEntries().map((e) => e.entryName);

      if (!entryNames.includes('manifest.json') && !entryNames.includes('metadata.json')) {
        return 'invalid';
      }
      const dumpEntryName = ['database/dump.sql', 'database/dump.dump', 'database/dump.backup']
        .find((name) => entryNames.includes(name));
      if (!dumpEntryName) {
        return 'missing-sql';
      }

      const sqlEntry = zip.getEntry(dumpEntryName);
      if (!sqlEntry) return 'missing-sql';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uncompressedSize: number = (sqlEntry as any).header?.size ?? 0;
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

  async runMaintenance(action: string, user?: AuthUser): Promise<{ message: string; details?: unknown }> {
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
    return { message: `${deleted.count} logs supprimés (> 90 jours)`, details: { count: deleted.count } };
  }

  private async checkDocumentsIntegrity(): Promise<{ message: string; details: unknown }> {
    const docs = await this.prisma.generatedDocument.findMany({
      select: { id: true, minioObjectKey: true, minioBucket: true },
      where: { deletedAt: null },
    });
    let missing = 0;
    for (const doc of docs) {
      const exists = await this.minio.objectExists(doc.minioBucket, doc.minioObjectKey).catch(() => false);
      if (!exists) missing++;
    }
    return {
      message: missing === 0
        ? 'Tous les documents sont intacts'
        : `${missing} document(s) manquant(s) dans MinIO`,
      details: { total: docs.length, missing },
    };
  }

  private async checkNegativeStock(): Promise<{ message: string; details: unknown }> {
    const products = await this.prisma.product.findMany({
      where: { quantity: { lt: 0 }, deletedAt: null },
      select: { id: true, name: true, reference: true, quantity: true },
    });
    return {
      message: products.length === 0
        ? 'Aucun stock négatif détecté'
        : `${products.length} produit(s) avec stock négatif`,
      details: { products },
    };
  }

  private async cleanOldTrash(): Promise<{ message: string; details: unknown }> {
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

  private async vacuumDatabase(): Promise<{ message: string; details: unknown }> {
    try {
      await this.prisma.$executeRaw`VACUUM ANALYZE`;
      return { message: 'VACUUM ANALYZE exécuté avec succès', details: {} };
    } catch (err) {
      return { message: `Erreur VACUUM : ${(err as Error).message}`, details: {} };
    }
  }

  private async checkOrphanedRecords(): Promise<{ message: string; details: unknown }> {
    const orphanedItems = await this.prisma.saleItem.count({
      where: { sale: { deletedAt: { not: null } } },
    });
    return {
      message: orphanedItems === 0
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
    const enabled = this.config.get<string>('AUTO_BACKUP_ENABLED', 'true') === 'true';
    if (!enabled) return;

    this.logger.log('Auto-backup started (cron 02:00)');
    try {
      const result = await this.createBackup();
      this.logger.log(`Auto-backup completed: ${result.filename} (${result.size} bytes)`);
      await this.cleanOldBackups();
    } catch (err) {
      this.logger.error('Auto-backup failed', (err as Error).message);
    }
  }

  private async cleanOldBackups() {
    const keepDays = parseInt(this.config.get<string>('AUTO_BACKUP_KEEP_DAYS', '30'), 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);

    const backups = await this.listBackups();
    for (const b of backups) {
      if (new Date(b.createdAt) < cutoff) {
        try {
          await this.backupStorage.remove(b.filename);
          this.logger.log(`Old backup removed: ${b.filename}`);
        } catch (err) {
          this.logger.warn(`Failed to remove old backup: ${b.filename}: ${(err as Error).message}`);
        }
      }
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
        normalized.startsWith('/') ||
        normalized.split('/').includes('..') ||
        path.isAbsolute(normalized);
      const isAllowed =
        normalized === 'database' ||
        normalized === 'database/' ||
        ['database/dump.sql', 'database/dump.dump', 'database/dump.backup'].includes(normalized) ||
        normalized === 'manifest.json' ||
        normalized === 'metadata.json' ||
        normalized === 'version.json' ||
        normalized === 'minio' ||
        normalized === 'minio/' ||
        normalized === `minio/${this.minio.bucket}` ||
        normalized === `minio/${this.minio.bucket}/` ||
        normalized.startsWith(`minio/${this.minio.bucket}/`);

      if (isUnsafePath || !isAllowed) {
        this.logger.warn(`[RESTORE] Rejected unsafe/out-of-scope ZIP entry: ${normalized}`);
        throw new BadRequestException(
          `Archive hors périmètre : ${normalized}. Seuls le dump PostgreSQL, les métadonnées et minio/${this.minio.bucket}/ sont autorisés.`,
        );
      }
    }
    this.logger.log(
      `[RESTORE] Archive scope validated: database and optional MinIO only; runtime folders are excluded`,
    );
  }

  private async validateRestoredDatabase(): Promise<void> {
    const requiredTables = ['User', 'Customer', 'Product', 'Sale'];
    const rows = await this.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const found = new Set(rows.map((row) => row.table_name));
    const missing = requiredTables.filter((table) => !found.has(table));
    if (missing.length) {
      throw new InternalServerErrorException(
        `Schéma restauré incomplet — tables manquantes : ${missing.join(', ')}`,
      );
    }

    this.logger.log(`[RESTORE][VALIDATION] ${requiredTables.length} critical tables present`);
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
      '-h', connection.host, '-p', connection.port, '-U', connection.user,
      '-d', connection.database, '--set=ON_ERROR_STOP=1', '-c', sql,
    ];
    this.logger.log(
      `[RESTORE][PREPARE] Command: psql -h ${connection.host} -p ${connection.port} -U ${connection.user} -d ${connection.database} -c "${sql}"`,
    );
    const result = this.runPostgresCommand(
      'psql',
      args,
      ['-U', connection.user, '-d', connection.database, '--set=ON_ERROR_STOP=1', '-c', sql],
    );
    this.assertPostgresCommandSucceeded('Préparation PostgreSQL', result);
  }

  private runPostgresCommand(
    tool: 'psql' | 'pg_restore',
    nativeArgs: string[],
    dockerArgs = nativeArgs,
    input?: Buffer,
  ) {
    const connection = this.getPostgresConnection();
    let result = spawnSync(tool, nativeArgs, {
      env: { ...process.env, PGPASSWORD: connection.password },
      input,
      encoding: input ? undefined : 'utf8',
      maxBuffer: 500 * 1024 * 1024,
    });
    if (result.error) {
      const container = this.config.get<string>('POSTGRES_CONTAINER_NAME', 'stockini-postgres');
      this.logger.warn(`[RESTORE] ${tool} unavailable locally: ${result.error.message}`);
      this.logger.log(`[RESTORE] Fallback command: docker exec -i ${container} ${tool} ${dockerArgs.join(' ')}`);
      result = spawnSync(
        'docker',
        ['exec', '-i', '-e', `PGPASSWORD=${connection.password}`, container, tool, ...dockerArgs],
        { input, maxBuffer: 500 * 1024 * 1024 },
      );
    }
    return result;
  }

  private assertPostgresCommandSucceeded(
    operation: string,
    result: ReturnType<typeof spawnSync>,
  ): void {
    const stdout = result.stdout ? Buffer.from(result.stdout as any).toString('utf8').trim() : '';
    const stderr = result.stderr ? Buffer.from(result.stderr as any).toString('utf8').trim() : '';
    this.logger.log(`[RESTORE] ${operation} exit code: ${result.status ?? 'interrupted'}`);
    this.logger.log(`[RESTORE] ${operation} stdout: ${stdout || '(empty)'}`);
    this.logger.log(`[RESTORE] ${operation} stderr: ${stderr || '(empty)'}`);
    if (result.error || result.status !== 0) {
      throw new InternalServerErrorException(
        `${operation} échouée : ${stderr || stdout || result.error?.message || `exit ${result.status ?? 'interrompu'}`}`,
      );
    }
  }

  private deployCurrentMigrations(): void {
    this.logger.log('[RESTORE][STEP=prisma-migrate] Applying pending migrations');
    const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
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
    this.logger.log(`[RESTORE][STEP=prisma-migrate] Exit code: ${result.status ?? 'interrupted'}`);
    if (stdout) this.logger.log(`[RESTORE][STEP=prisma-migrate] ${stdout}`);
    if (result.error || result.status !== 0) {
      throw new InternalServerErrorException(
        `Migration Prisma après restauration échouée : ${stderr || stdout || result.error?.message || `exit ${result.status ?? 'interrompu'}`}`,
      );
    }
    this.logger.log('[RESTORE][STEP=prisma-migrate] Schema is current');
  }

  private async dumpPostgres(outputPath: string): Promise<void> {
    const { user, password, host, port, database: dbName } = this.getPostgresConnection();

    this.logger.log(`[PG_DUMP] Starting — db=${dbName} host=${host} port=${port} user=${user}`);
    this.logger.log(`[PG_DUMP] Output path: ${outputPath}`);

    // ── Strategy 1: native pg_dump (works when postgresql-client is installed) ──
    this.logger.log(`[PG_DUMP] Trying native pg_dump...`);
    let result = spawnSync(
      'pg_dump',
      [
        '--no-password',
        '--format=plain',
        '--encoding=UTF8',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '-h', host,
        '-p', port,
        '-U', user,
        dbName,
      ],
      { env: { ...process.env, PGPASSWORD: password }, maxBuffer: 500 * 1024 * 1024, encoding: 'buffer' },
    );

    // ── Strategy 2: docker exec (dev mode — backend on host, postgres in Docker) ──
    if (result.error) {
      this.logger.warn(`[PG_DUMP] Native pg_dump not found (${result.error.message}), trying docker exec...`);
      const containerName = this.config.get<string>('POSTGRES_CONTAINER_NAME', 'stockini-postgres');
      this.logger.log(`[PG_DUMP] docker exec ${containerName} pg_dump ...`);

      result = spawnSync(
        'docker',
        [
          'exec',
          '-e', `PGPASSWORD=${password}`,
          containerName,
          'pg_dump',
          '--no-password',
          '--format=plain',
          '--encoding=UTF8',
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-privileges',
          '-U', user,
          '-d', dbName,
        ],
        { maxBuffer: 500 * 1024 * 1024, encoding: 'buffer' },
      );

      if (result.error) {
        throw new InternalServerErrorException(
          `pg_dump introuvable et docker exec échoué : ${result.error.message}. ` +
          `Installez postgresql-client ou définissez POSTGRES_CONTAINER_NAME.`,
        );
      }
    }

    const stderr = result.stderr ? Buffer.from(result.stderr).toString('utf8').trim() : '';
    const stdout = result.stdout ? Buffer.from(result.stdout) : Buffer.alloc(0);

    this.logger.log(`[PG_DUMP] Exit code: ${result.status}`);
    if (stderr) this.logger.log(`[PG_DUMP] STDERR: ${stderr.substring(0, 1000)}`);
    this.logger.log(`[PG_DUMP] SQL size: ${stdout.length} bytes`);

    if (result.status !== 0) {
      throw new InternalServerErrorException(
        `pg_dump a échoué (exit ${result.status ?? 'null'}): ${stderr || 'pas de message'}`,
      );
    }

    if (stdout.length === 0) {
      throw new InternalServerErrorException('pg_dump a produit un fichier SQL vide');
    }

    const sqlPreview = stdout.slice(0, 200).toString('utf8');
    this.logger.log(`[PG_DUMP] SQL preview: ${sqlPreview.replace(/\n/g, ' ').substring(0, 150)}`);

    fs.writeFileSync(outputPath, stdout);
    this.logger.log(`[PG_DUMP] SQL dump written successfully: ${outputPath} (${stdout.length} bytes)`);
  }

  private restorePostgres(dumpPath: string): void {
    const connection = this.getPostgresConnection();
    const extension = path.extname(dumpPath).toLowerCase();
    const signature = fs.readFileSync(dumpPath).subarray(0, 5).toString('ascii');
    const isCustomDump = signature === 'PGDMP' || extension === '.dump' || extension === '.backup';
    const isPlainSql = !isCustomDump;
    const tool = isPlainSql ? 'psql' : 'pg_restore';
    const common = [
      '-h', connection.host, '-p', connection.port,
      '-U', connection.user, '-d', connection.database,
    ];
    const nativeArgs = isPlainSql
      ? [...common, '--set=ON_ERROR_STOP=1', '-f', dumpPath]
      : [...common, '--clean', '--if-exists', '--no-owner', '--no-privileges', dumpPath];
    const dockerArgs = isPlainSql
      ? ['-U', connection.user, '-d', connection.database, '--set=ON_ERROR_STOP=1']
      : ['-U', connection.user, '-d', connection.database, '--clean', '--if-exists', '--no-owner', '--no-privileges'];
    const input = fs.readFileSync(dumpPath);

    this.logger.log(
      `[RESTORE] Dump format: ${isPlainSql ? 'plain SQL' : 'PostgreSQL custom'} (extension=${extension}, signature=${signature === 'PGDMP' ? 'PGDMP' : 'text'})`,
    );
    this.logger.log(
      `[RESTORE] Command: ${tool} ${nativeArgs.join(' ')} (PGPASSWORD hidden)`,
    );
    const result = this.runPostgresCommand(tool, nativeArgs, dockerArgs, input);
    this.assertPostgresCommandSucceeded(`${tool} restore`, result);
    this.logger.log(`[RESTORE] PostgreSQL restore completed successfully`);
  }

  private async exportMinio(targetDir: string): Promise<void> {
    const keys = await this.minio.listAllObjects(this.minio.bucket);
    for (const key of keys) {
      const buf = await this.minio.getObject(this.minio.bucket, key);
      const targetRoot = path.resolve(targetDir);
      const destPath = path.resolve(targetRoot, key.replace(/\//g, path.sep));
      if (destPath !== targetRoot && !destPath.startsWith(`${targetRoot}${path.sep}`)) {
        throw new InternalServerErrorException(`Clé MinIO hors périmètre : ${key}`);
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, buf);
    }
    this.logger.log(`[BACKUP] MinIO: exported ${keys.length} object(s)`);
  }

  private async importMinio(sourceDir: string, clearExisting = false): Promise<number> {
    const walk = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...walk(full));
        else files.push(full);
      }
      return files;
    };

    const files = walk(sourceDir);
    if (clearExisting) {
      const existingKeys = await this.minio.listAllObjects(this.minio.bucket);
      for (const key of existingKeys) await this.minio.removeObject(this.minio.bucket, key);
      this.logger.log(`[RESTORE] MinIO: removed ${existingKeys.length} existing object(s)`);
    }
    for (const f of files) {
      const objName = path.relative(sourceDir, f).replace(/\\/g, '/');
      const buf = fs.readFileSync(f);
      await this.minio.putObject(this.minio.bucket, objName, buf, 'application/octet-stream');
    }
    return files.length;
  }

  private createZip(sourceDir: string, destPath: string): void {
    const zip = new AdmZip();
    zip.addLocalFolder(sourceDir, '');
    zip.writeZip(destPath);
  }
}
