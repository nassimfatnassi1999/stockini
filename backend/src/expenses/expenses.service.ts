import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CaisseMovementType,
  ExpenseStatus,
  Prisma,
  TreasuryAccount,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CaisseService } from '../caisse/caisse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceGeneratorService } from '../references/reference-generator.service';
import {
  CancelExpenseDto,
  CreateExpenseDto,
  ExpenseQueryDto,
} from './dto/expense.dto';
import { buildPaginatedResponse } from '../common/utils/pagination.util';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly references: ReferenceGeneratorService,
    private readonly caisse: CaisseService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(query: ExpenseQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {
      ...(query.category && { category: query.category }),
      ...(query.paymentSource && { paymentSource: query.paymentSource }),
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...(query.status && { status: query.status }),
      ...((query.dateFrom || query.dateTo) && {
        expenseDate: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && {
            lte: new Date(`${query.dateTo}T23:59:59.999Z`),
          }),
        },
      }),
      ...(query.search && {
        OR: [
          { reference: { contains: query.search, mode: 'insensitive' } },
          { category: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          {
            supplier: { name: { contains: query.search, mode: 'insensitive' } },
          },
          {
            purchase: {
              orderNumber: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };

    const sortOrder = query.sortOrder ?? 'desc';
    const allowedSortFields: Record<
      string,
      Prisma.ExpenseOrderByWithRelationInput
    > = {
      date: { expenseDate: sortOrder },
      expenseDate: { expenseDate: sortOrder },
      createdAt: { createdAt: sortOrder },
      amount: { amount: sortOrder },
      category: { category: sortOrder },
      paymentSource: { paymentSource: sortOrder },
      status: { status: sortOrder },
      reference: { reference: sortOrder },
    };
    const orderBy = (query.sortBy && allowedSortFields[query.sortBy]) || {
      expenseDate: 'desc' as const,
    };

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true, reference: true } },
          purchase: { select: { id: true, orderNumber: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return buildPaginatedResponse(data, page, limit, total);
  }

  async create(dto: CreateExpenseDto, userId?: string) {
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à zéro.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertRelations(dto, tx);

      const reference = await this.references.generate('DEP', 'expense', tx);
      const expense = await tx.expense.create({
        data: {
          reference,
          amount,
          paymentSource: dto.paymentSource,
          category: dto.category.trim(),
          subcategory: dto.subcategory?.trim() || null,
          expenseDate: new Date(dto.date),
          description: dto.description.trim(),
          observations: dto.observations?.trim() || null,
          supplierId: dto.supplierId || null,
          purchaseId: dto.purchaseId || null,
          attachmentUrl: dto.attachmentUrl || null,
          createdById: userId,
        },
        include: {
          supplier: { select: { id: true, name: true, reference: true } },
          purchase: { select: { id: true, orderNumber: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
        },
      });

      await this.caisse.recordMovement(tx, {
        type: CaisseMovementType.DEPENSE_GENERALE,
        montant: -amount,
        motif: `Dépense ${expense.category} - ${expense.description}`,
        referenceDoc: expense.reference,
        expenseId: expense.id,
        userId,
        treasuryAccount: dto.paymentSource,
      });

      await this.auditLogs.audit(
        {
          action: 'expense.created',
          entity: 'Expense',
          entityId: expense.id,
          userId: userId ?? null,
          oldValue: null,
          newValue: this.toAuditValue(expense),
          metadata: {
            amount,
            paymentSource: dto.paymentSource,
            supplierId: dto.supplierId ?? null,
            purchaseId: dto.purchaseId ?? null,
          },
        },
        tx,
      );

      return expense;
    });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, reference: true } },
        purchase: { select: { id: true, orderNumber: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
        caisseMovements: {
          where: {
            type: {
              in: [
                CaisseMovementType.DEPENSE_GENERALE,
                CaisseMovementType.ANNULATION_DEPENSE,
              ],
            },
          },
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!expense) throw new NotFoundException('Dépense introuvable.');

    const auditLogs = await this.prisma.auditLog.findMany({
      where: { entity: 'Expense', entityId: id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return { ...expense, auditLogs };
  }

  async remove(id: string, dto: CancelExpenseDto, userId?: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const expense = await tx.expense.findUnique({ where: { id } });
        if (!expense) throw new NotFoundException('Dépense introuvable.');
        if (expense.status === ExpenseStatus.CANCELLED) {
          throw new BadRequestException('Cette dépense est déjà supprimée.');
        }

        const existingReversal = await tx.caisseMovement.findFirst({
          where: {
            expenseId: expense.id,
            type: CaisseMovementType.ANNULATION_DEPENSE,
          },
          select: { id: true },
        });
        if (existingReversal) {
          throw new BadRequestException(
            'Cette dépense a déjà généré un mouvement inverse.',
          );
        }

        const updated = await tx.expense.update({
          where: { id },
          data: {
            status: ExpenseStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledById: userId,
            cancelReason: dto.reason || 'Suppression de la dépense',
          },
          include: {
            supplier: { select: { id: true, name: true, reference: true } },
            purchase: { select: { id: true, orderNumber: true } },
            createdBy: { select: { id: true, fullName: true, email: true } },
          },
        });

        const reversal = await this.caisse.recordMovement(tx, {
          type: CaisseMovementType.ANNULATION_DEPENSE,
          montant: Number(expense.amount),
          motif: `Suppression de la dépense ${expense.reference} - ${expense.category}${dto.reason ? ` - ${dto.reason}` : ''}`,
          referenceDoc: expense.reference,
          expenseId: expense.id,
          userId,
          treasuryAccount: expense.paymentSource,
        });

        await this.auditLogs.audit(
          {
            action: 'DELETE_EXPENSE',
            entity: 'Expense',
            entityId: expense.id,
            userId: userId ?? null,
            oldValue: this.toAuditValue(expense),
            newValue: this.toAuditValue(updated),
            metadata: {
              reference: expense.reference,
              amount: Number(expense.amount),
              paymentSource: expense.paymentSource,
              supplierId: expense.supplierId ?? null,
              purchaseId: expense.purchaseId ?? null,
              reason: dto.reason ?? null,
              reversalMovementId: reversal.id,
              automaticReversal: true,
            },
          },
          tx,
        );

        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Cette dépense a déjà généré un mouvement inverse.',
        );
      }
      throw error;
    }
  }

  private async assertRelations(
    dto: CreateExpenseDto,
    tx: Prisma.TransactionClient,
  ) {
    if (dto.supplierId) {
      const supplier = await tx.supplier.findFirst({
        where: { id: dto.supplierId, deletedAt: null },
        select: { id: true },
      });
      if (!supplier) throw new BadRequestException('Fournisseur introuvable.');
    }

    if (dto.purchaseId) {
      const purchase = await tx.purchase.findFirst({
        where: { id: dto.purchaseId, deletedAt: null },
        select: { id: true, supplierId: true },
      });
      if (!purchase)
        throw new BadRequestException('Document achat introuvable.');
      if (dto.supplierId && purchase.supplierId !== dto.supplierId) {
        throw new BadRequestException(
          'Le document achat ne correspond pas au fournisseur sélectionné.',
        );
      }
    }
  }

  private toAuditValue(expense: {
    id: string;
    reference: string;
    amount: Prisma.Decimal | number;
    paymentSource: TreasuryAccount;
    category: string;
    subcategory?: string | null;
    expenseDate: Date;
    description: string;
    observations?: string | null;
    supplierId?: string | null;
    purchaseId?: string | null;
    status: ExpenseStatus;
  }) {
    return {
      id: expense.id,
      reference: expense.reference,
      amount: Number(expense.amount),
      paymentSource: expense.paymentSource,
      category: expense.category,
      subcategory: expense.subcategory ?? null,
      expenseDate: expense.expenseDate,
      description: expense.description,
      observations: expense.observations ?? null,
      supplierId: expense.supplierId ?? null,
      purchaseId: expense.purchaseId ?? null,
      status: expense.status,
    };
  }
}
