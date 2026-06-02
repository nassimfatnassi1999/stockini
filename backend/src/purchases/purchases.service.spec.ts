import { Prisma, PurchaseStatus } from '@prisma/client';
import { PurchasesService } from './purchases.service';

/**
 * Tests de la liste « Factures fournisseurs à payer » :
 * - inclut les factures non payées et partiellement payées (reste à payer > 0)
 * - exclut les factures totalement payées et les achats annulés
 * - agrège le total des restes à payer côté backend (Decimal)
 */
describe('PurchasesService.findPayable', () => {
  function buildService(
    rows: Array<{ id: string; remainingAmount: number; paymentStatus: PurchaseStatus | string }>,
    sumRemaining: number,
  ) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { remainingAmount: new Prisma.Decimal(sumRemaining) },
    });
    const prisma = { purchase: { findMany, aggregate } } as any;

    const service = new PurchasesService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, findMany, aggregate };
  }

  it('filtre sur reste à payer > 0 et exclut les achats annulés', async () => {
    const { service, findMany } = buildService(
      [
        { id: 'p1', remainingAmount: 100, paymentStatus: 'UNPAID' },
        { id: 'p2', remainingAmount: 40, paymentStatus: 'PARTIAL' },
      ],
      140,
    );

    const result = await service.findPayable();

    const where = findMany.mock.calls[0][0].where;
    expect(where.remainingAmount).toEqual({ gt: 0 });
    expect(where.status).toEqual({ not: PurchaseStatus.CANCELLED });
    expect(where.deletedAt).toBeNull();

    expect(result.count).toBe(2);
    expect(result.totalRemaining).toBe('140.000');
  });

  it('renvoie 0.000 quand il n\'y a aucune facture à payer', async () => {
    const { service } = buildService([], 0);
    const result = await service.findPayable();
    expect(result.count).toBe(0);
    expect(result.totalRemaining).toBe('0.000');
  });

  it('applique le filtre fournisseur et statut de paiement', async () => {
    const { service, findMany } = buildService([], 0);

    await service.findPayable({
      supplierId: 'supplier-1',
      paymentStatus: 'PARTIAL' as any,
      search: 'ACH',
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.supplierId).toBe('supplier-1');
    expect(where.paymentStatus).toBe('PARTIAL');
    expect(where.OR).toBeDefined();
  });
});
