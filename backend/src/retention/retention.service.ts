import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_RETAINED_ROWS = 1_000;

type RetentionClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  cleanupOldAlerts(client?: RetentionClient): Promise<number> {
    return this.cleanup('alerts', client);
  }

  cleanupOldAuditLogs(client?: RetentionClient): Promise<number> {
    return this.cleanup('auditLogs', client);
  }

  lockAlerts(client: RetentionClient): Promise<number> {
    return this.acquireLock('alerts', client);
  }

  lockAuditLogs(client: RetentionClient): Promise<number> {
    return this.acquireLock('auditLogs', client);
  }

  @Cron('30 2 * * *')
  async scheduledCleanup(): Promise<void> {
    try {
      const [alertsDeleted, auditLogsDeleted] = await this.prisma.$transaction(
        async (tx) => [
          await this.cleanupOldAlerts(tx),
          await this.cleanupOldAuditLogs(tx),
        ],
      );
      this.logger.log({
        event: 'retention.cleanup.completed',
        alertsDeleted,
        auditLogsDeleted,
      });
    } catch (error) {
      this.logger.error(
        'Automatic retention cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async cleanup(
    target: 'alerts' | 'auditLogs',
    client?: RetentionClient,
  ): Promise<number> {
    if (!client) {
      return this.prisma.$transaction((tx) => this.cleanup(target, tx));
    }

    // Transaction-scoped PostgreSQL advisory locks serialize retention across
    // every backend instance without leaving a lock behind after a failure.
    await this.acquireLock(target, client);

    if (target === 'alerts') {
      return client.$executeRaw`
        WITH overflow AS (
          SELECT "id"
          FROM "Alert"
          ORDER BY "createdAt" DESC, "id" DESC
          OFFSET ${MAX_RETAINED_ROWS}
        )
        DELETE FROM "Alert"
        WHERE "id" IN (SELECT "id" FROM overflow)
      `;
    }

    // Deliberately no AuditLog entry here: retention must never recursively
    // produce the rows it is responsible for removing.
    return client.$executeRaw`
      WITH overflow AS (
        SELECT "id"
        FROM "AuditLog"
        ORDER BY "createdAt" DESC, "id" DESC
        OFFSET ${MAX_RETAINED_ROWS}
      )
      DELETE FROM "AuditLog"
      WHERE "id" IN (SELECT "id" FROM overflow)
    `;
  }

  private acquireLock(
    target: 'alerts' | 'auditLogs',
    client: RetentionClient,
  ): Promise<number> {
    const lockKey = target === 'alerts' ? 7_310_001 : 7_310_002;
    return client.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
  }
}
