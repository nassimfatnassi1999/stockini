import { Prisma, PurchaseStatus } from '@prisma/client';
import { SuppliersService } from './suppliers.service';

/**
 * Test de l'enrichissement « Notre dette » par fournisseur :
 * dette = SUM(remainingAmount) des achats non totalement payés, hors annulés.
 */
describe('SuppliersService.findAll debt aggregation', () => {
  function buildService(
    suppliers: Array<{ id: string; name: string }>,
    grouped: Array<{ supplierId: string; remaining: number }>,
  ) {
    const findMany = jest.fn().mockResolvedValue(suppliers);
    const groupBy = jest.fn().mockResolvedValue(
      grouped.map((g) => ({
        supplierId: g.supplierId,
        _sum: { remainingAmount: new Prisma.Decimal(g.remaining) },
      })),
    );
    const prisma = {
      supplier: { findMany },
      purchase: { groupBy },
    } as any;
    const service = new SuppliersService(prisma, {} as any);
    return { service, groupBy };
  }

  it('attache la dette à chaque fournisseur et 0.000 si aucune dette', async () => {
    const { service, groupBy } = buildService(
      [
        { id: 's1', name: 'Alpha' },
        { id: 's2', name: 'Beta' },
      ],
      [{ supplierId: 's1', remaining: 80.5 }],
    );

    const result = await service.findAll();

    expect(result[0].totalDebt).toBe('80.500');
    expect(result[1].totalDebt).toBe('0.000');

    // l'agrégation exclut les achats annulés et ne garde que reste à payer > 0
    const where = groupBy.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: PurchaseStatus.CANCELLED });
    expect(where.remainingAmount).toEqual({ gt: 0 });
    expect(where.deletedAt).toBeNull();
  });
});
