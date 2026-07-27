import { BadRequestException } from '@nestjs/common';
import {
  CaisseMovementType,
  ExpenseStatus,
  Prisma,
  TreasuryAccount,
} from '@prisma/client';
import { ExpensesService } from './expenses.service';

describe('ExpensesService.remove', () => {
  const expense = {
    id: 'expense-1',
    reference: 'DEP-2026-000001',
    amount: new Prisma.Decimal(90),
    paymentSource: TreasuryAccount.PHYSICAL_CASH,
    category: 'Transport',
    expenseDate: new Date('2026-07-25T10:00:00Z'),
    description: 'Livraison',
    supplierId: null,
    purchaseId: null,
    status: ExpenseStatus.ACTIVE,
  };

  function setup(overrides?: { status?: ExpenseStatus; reversalId?: string }) {
    const current = { ...expense, status: overrides?.status ?? expense.status };
    const updated = {
      ...current,
      status: ExpenseStatus.CANCELLED,
      cancelledAt: new Date('2026-07-27T10:00:00Z'),
      cancelledById: 'user-1',
    };
    const tx = {
      expense: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue(updated),
      },
      caisseMovement: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            overrides?.reversalId ? { id: overrides.reversalId } : null,
          ),
      },
    } as any;
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as any;
    const caisse = {
      recordMovement: jest.fn().mockResolvedValue({ id: 'reversal-1' }),
    } as any;
    const audit = { audit: jest.fn().mockResolvedValue(undefined) } as any;
    const service = new ExpensesService(prisma, {} as any, caisse, audit);
    return { service, tx, caisse, audit };
  }

  it('soft-supprime la dépense et crée une contre-écriture atomique', async () => {
    const { service, tx, caisse, audit } = setup();

    await service.remove(expense.id, {}, 'user-1');

    expect(tx.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: expense.id },
        data: expect.objectContaining({
          status: ExpenseStatus.CANCELLED,
          cancelledById: 'user-1',
        }),
      }),
    );
    expect(caisse.recordMovement).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: CaisseMovementType.ANNULATION_DEPENSE,
        montant: 90,
        expenseId: expense.id,
        treasuryAccount: TreasuryAccount.PHYSICAL_CASH,
      }),
    );
    expect(audit.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE_EXPENSE',
        entityId: expense.id,
        metadata: expect.objectContaining({
          reference: expense.reference,
          reversalMovementId: 'reversal-1',
          automaticReversal: true,
        }),
      }),
      tx,
    );
  });

  it('refuse une dépense déjà supprimée sans créer de remboursement', async () => {
    const { service, caisse } = setup({ status: ExpenseStatus.CANCELLED });

    await expect(
      service.remove(expense.id, {}, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(caisse.recordMovement).not.toHaveBeenCalled();
  });

  it('refuse une seconde contre-écriture même si le statut est encore actif', async () => {
    const { service, tx, caisse } = setup({ reversalId: 'existing-reversal' });

    await expect(
      service.remove(expense.id, {}, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.expense.update).not.toHaveBeenCalled();
    expect(caisse.recordMovement).not.toHaveBeenCalled();
  });
});
