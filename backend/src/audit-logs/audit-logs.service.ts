import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditParams {
  action: string;
  entity: string;
  entityId?: string | null;
  userId?: string | null;
  userName?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditFindAllQuery {
  page?: number;
  limit?: number;
  entity?: string;
  action?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** 'active' (default) | 'archive' */
  source?: 'active' | 'archive';
}

const toJson = (v: Record<string, unknown> | null | undefined): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =>
  v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée un audit log de façon atomique.
   * Passer `tx` pour l'inclure dans une transaction Prisma existante.
   */
  async audit(params: AuditParams, tx?: Prisma.TransactionClient): Promise<void> {
    const client = (tx ?? this.prisma) as Prisma.TransactionClient;
    await client.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        userId: params.userId ?? null,
        userName: params.userName ?? null,
        oldValue: toJson(params.oldValue),
        newValue: toJson(params.newValue),
        metadata: toJson(params.metadata),
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }

  /** Backward-compat alias used by legacy callers (users.service, database.service). */
  create(dto: {
    userId?: string;
    action: string;
    entity: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    return this.audit({
      action: dto.action,
      entity: dto.entity,
      entityId: dto.entityId,
      userId: dto.userId,
      metadata: dto.metadata,
    });
  }

  async findAll(query?: AuditFindAllQuery) {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(200, Math.max(1, query?.limit ?? 50));
    const skip = (page - 1) * limit;
    const source = query?.source ?? 'active';

    const andConditions: Prisma.AuditLogWhereInput[] = [];

    if (query?.search) {
      const s = query.search;
      andConditions.push({
        OR: [
          { entityId: { contains: s, mode: 'insensitive' } },
          { userName: { contains: s, mode: 'insensitive' } },
        ],
      });
    }

    const baseWhere = {
      ...(query?.entity && { entity: { equals: query.entity, mode: 'insensitive' as const } }),
      ...(query?.action && { action: { contains: query.action, mode: 'insensitive' as const } }),
      ...(query?.userId && { userId: query.userId }),
      ...((query?.dateFrom || query?.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo + 'T23:59:59.999Z') }),
        },
      }),
      ...(andConditions.length > 0 && { AND: andConditions }),
    };

    if (source === 'archive') {
      const archiveWhere: Prisma.AuditLogArchiveWhereInput = baseWhere as Prisma.AuditLogArchiveWhereInput;
      const [raw, total] = await Promise.all([
        this.prisma.auditLogArchive.findMany({
          where: archiveWhere,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.auditLogArchive.count({ where: archiveWhere }),
      ]);

      const data = raw.map((r) => ({ ...r, user: null, _source: 'archive' as const }));
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    // Default: active AuditLog table
    const where: Prisma.AuditLogWhereInput = baseWhere;
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
