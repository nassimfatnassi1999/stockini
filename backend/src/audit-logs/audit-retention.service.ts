import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { promisify } from 'util';
import { gzip } from 'zlib';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from './audit-logs.service';
import { MinioService } from '../documents/minio.service';

const gzipAsync = promisify(gzip);

// ─── Constants ───────────────────────────────────────────────────────────────

const ARCHIVE_BUCKET = 'audit-logs-archive';
const BATCH_SIZE = 1_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ArchiveResult {
  archivedCount: number;
  exportedFile: string;
  exportedSize: number;
  skipped: boolean;
  reason?: string;
}

export interface AuditLogStats {
  activeCount: number;
  archiveCount: number;
  eligibleCount: number;
  activeEstimatedBytes: number;
  archiveEstimatedBytes: number;
  retentionMonths: number;
  archiveEnabled: boolean;
  compressExport: boolean;
  nextCutoffDate: string;
  lastArchiveDate: string | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AuditRetentionService {
  private readonly logger = new Logger(AuditRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly minio: MinioService,
  ) {}

  // ── Cron job — 03:00 AM every night ────────────────────────────────────────

  @Cron('0 3 * * *')
  async scheduledArchive(): Promise<void> {
    this.logger.log('Scheduled audit log archiving started');
    try {
      const result = await this.runArchiving();
      if (result.skipped) {
        this.logger.log(`Archiving skipped: ${result.reason}`);
      } else {
        this.logger.log(
          `Archiving completed: ${result.archivedCount} logs → ${result.exportedFile} (${result.exportedSize} bytes)`,
        );
      }
    } catch (err) {
      this.logger.error('Scheduled archiving failed', (err as Error).message);
    }
  }

  // ── Main archiving workflow ─────────────────────────────────────────────────

  async runArchiving(triggeredByUserId?: string): Promise<ArchiveResult> {
    // Step 1 — Load settings
    const settings = await this.loadSettings();

    if (!settings.archiveEnabled) {
      return { archivedCount: 0, exportedFile: '', exportedSize: 0, skipped: true, reason: 'archiving disabled in settings' };
    }

    // Step 2 — Compute cutoff date
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - settings.retentionMonths);

    // Step 3 — Select logs to archive
    this.logger.log(`Fetching logs older than ${cutoff.toISOString()} (retention: ${settings.retentionMonths} months)`);
    const logsToArchive = await this.prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
    });

    if (logsToArchive.length === 0) {
      this.logger.log('No audit logs eligible for archiving');
      return { archivedCount: 0, exportedFile: '', exportedSize: 0, skipped: false };
    }

    this.logger.log(`${logsToArchive.length} logs selected for archiving`);

    // Step 4 — Build export file name
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const baseName = `audit-logs-archive-${yyyy}-${mm}-${dd}.json`;
    const objectKey = `audit-logs/${yyyy}/${mm}/${baseName}${settings.compressExport ? '.gz' : ''}`;

    // Step 5 — Serialize
    const jsonBuffer = Buffer.from(JSON.stringify(logsToArchive, null, 2), 'utf8');

    // Step 6 — Compress
    let uploadBuffer: Buffer;
    if (settings.compressExport) {
      uploadBuffer = await gzipAsync(jsonBuffer) as Buffer;
    } else {
      uploadBuffer = jsonBuffer;
    }

    // Step 7 — Ensure MinIO bucket exists
    await this.ensureArchiveBucket();

    // Step 8 — Upload to MinIO
    this.logger.log(`Uploading ${uploadBuffer.length} bytes to MinIO: ${objectKey}`);
    try {
      await this.minio.putObject(
        ARCHIVE_BUCKET,
        objectKey,
        uploadBuffer,
        settings.compressExport ? 'application/gzip' : 'application/json',
      );
    } catch (err) {
      const error = err as Error;
      this.logger.error('MinIO upload failed', error.message);
      await this.createFailedAudit(error, 'minio_upload', triggeredByUserId);
      throw new InternalServerErrorException(
        `Export MinIO échoué (${error.message}) — aucun log supprimé`,
      );
    }

    // Step 9 — Verify upload
    const uploaded = await this.minio.objectExists(ARCHIVE_BUCKET, objectKey);
    if (!uploaded) {
      const error = new Error('Object not found in MinIO after upload');
      this.logger.error('MinIO verification failed', error.message);
      await this.createFailedAudit(error, 'minio_verify', triggeredByUserId);
      throw new InternalServerErrorException(
        'Vérification MinIO échouée — aucun log supprimé',
      );
    }

    this.logger.log('MinIO upload verified');

    // Step 10 — Copy to AuditLogArchive + delete from AuditLog (in transaction, batched)
    const ids = logsToArchive.map((l) => l.id);

    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Batch insert into archive
          for (let i = 0; i < logsToArchive.length; i += BATCH_SIZE) {
            const batch = logsToArchive.slice(i, i + BATCH_SIZE);
            await tx.auditLogArchive.createMany({
              data: batch.map((log) => ({
                id: log.id,
                action: log.action,
                entity: log.entity,
                entityId: log.entityId ?? null,
                userId: log.userId ?? null,
                userName: log.userName ?? null,
                oldValue: log.oldValue == null ? Prisma.JsonNull : (log.oldValue as Prisma.InputJsonValue),
                newValue: log.newValue == null ? Prisma.JsonNull : (log.newValue as Prisma.InputJsonValue),
                metadata: log.metadata == null ? Prisma.JsonNull : (log.metadata as Prisma.InputJsonValue),
                ipAddress: log.ipAddress ?? null,
                userAgent: log.userAgent ?? null,
                createdAt: log.createdAt,
              })),
              skipDuplicates: true,
            });
          }

          // Step 11 — Verify archive count
          const archiveCount = await tx.auditLogArchive.count({
            where: { id: { in: ids } },
          });

          if (archiveCount !== logsToArchive.length) {
            throw new Error(
              `Archive count mismatch: expected ${logsToArchive.length}, got ${archiveCount}`,
            );
          }

          // Step 12 — Delete from AuditLog (batched to avoid lock timeout)
          for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            await tx.auditLog.deleteMany({
              where: { id: { in: ids.slice(i, i + BATCH_SIZE) } },
            });
          }
        },
        { timeout: 120_000 }, // 2 min timeout for large datasets
      );
    } catch (err) {
      const error = err as Error;
      this.logger.error('Archive transaction failed', error.message);
      await this.createFailedAudit(error, 'archive_copy', triggeredByUserId);
      throw new InternalServerErrorException(
        `Copie en archive échouée (${error.message}) — aucun log supprimé de la table principale`,
      );
    }

    // Step 13 — Create success audit log
    await this.auditLogs.audit({
      action: 'audit.archive.completed',
      entity: 'AuditLog',
      userId: triggeredByUserId ?? null,
      metadata: {
        archivedCount: logsToArchive.length,
        exportedFile: objectKey,
        exportedSize: uploadBuffer.length,
        archiveDate: now.toISOString(),
        retentionMonths: settings.retentionMonths,
        compressed: settings.compressExport,
      },
    });

    this.logger.log(`Archive completed: ${logsToArchive.length} logs archived`);

    return {
      archivedCount: logsToArchive.length,
      exportedFile: objectKey,
      exportedSize: uploadBuffer.length,
      skipped: false,
    };
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  async getStats(): Promise<AuditLogStats> {
    const settings = await this.loadSettings();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - settings.retentionMonths);

    const [activeCount, archiveCount, eligibleCount, lastArchiveLog] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLogArchive.count(),
      settings.retentionMonths === 0
        ? Promise.resolve(0)
        : this.prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.auditLog.findFirst({
        where: { action: 'audit.archive.completed' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    // Rough estimate: ~600 bytes per row (JSON fields can vary)
    const AVG_ROW_BYTES = 600;

    return {
      activeCount,
      archiveCount,
      eligibleCount,
      activeEstimatedBytes: activeCount * AVG_ROW_BYTES,
      archiveEstimatedBytes: archiveCount * AVG_ROW_BYTES,
      retentionMonths: settings.retentionMonths,
      archiveEnabled: settings.archiveEnabled,
      compressExport: settings.compressExport,
      nextCutoffDate: cutoff.toISOString(),
      lastArchiveDate: lastArchiveLog?.createdAt.toISOString() ?? null,
    };
  }

  // ── Last archive download (presigned URL) ───────────────────────────────────

  async getLastArchiveUrl(): Promise<{ objectKey: string; url: string } | null> {
    try {
      await this.ensureArchiveBucket();
      const objects = await this.minio.listAllObjects(ARCHIVE_BUCKET);
      if (objects.length === 0) return null;
      // Keys are lexicographically sortable (YYYY/MM/filename)
      const latest = objects.sort().at(-1)!;
      const url = await this.minio.presignedGetUrl(ARCHIVE_BUCKET, latest, 3600);
      return { objectKey: latest, url };
    } catch {
      return null;
    }
  }

  // ── List archives ───────────────────────────────────────────────────────────

  async listArchives(): Promise<string[]> {
    try {
      await this.ensureArchiveBucket();
      return (await this.minio.listAllObjects(ARCHIVE_BUCKET)).sort().reverse();
    } catch {
      return [];
    }
  }

  // ── Settings helpers ────────────────────────────────────────────────────────

  async loadSettings(): Promise<{ retentionMonths: number; archiveEnabled: boolean; compressExport: boolean }> {
    const keys = ['audit_logs.retention_months', 'audit_logs.archive_enabled', 'audit_logs.compress_export'];
    const rows = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return {
      retentionMonths: parseInt(map['audit_logs.retention_months'] ?? '12', 10),
      archiveEnabled: (map['audit_logs.archive_enabled'] ?? 'true') === 'true',
      compressExport: (map['audit_logs.compress_export'] ?? 'true') === 'true',
    };
  }

  async upsertSettings(dto: {
    retentionMonths?: number;
    archiveEnabled?: boolean;
    compressExport?: boolean;
  }): Promise<void> {
    const updates: { key: string; value: string }[] = [];
    if (dto.retentionMonths !== undefined) {
      updates.push({ key: 'audit_logs.retention_months', value: String(dto.retentionMonths) });
    }
    if (dto.archiveEnabled !== undefined) {
      updates.push({ key: 'audit_logs.archive_enabled', value: String(dto.archiveEnabled) });
    }
    if (dto.compressExport !== undefined) {
      updates.push({ key: 'audit_logs.compress_export', value: String(dto.compressExport) });
    }
    await Promise.all(
      updates.map((u) =>
        this.prisma.setting.upsert({
          where: { key: u.key },
          create: { key: u.key, value: u.value },
          update: { value: u.value },
        }),
      ),
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async ensureArchiveBucket(): Promise<void> {
    await this.minio.ensureBucket(ARCHIVE_BUCKET);
  }

  private async createFailedAudit(
    error: Error,
    step: string,
    triggeredByUserId?: string,
  ): Promise<void> {
    try {
      await this.auditLogs.audit({
        action: 'audit.archive.failed',
        entity: 'AuditLog',
        userId: triggeredByUserId ?? null,
        metadata: {
          error: error.message,
          step,
          date: new Date().toISOString(),
        },
      });
    } catch {
      this.logger.error('Failed to create failure audit log');
    }
  }
}
