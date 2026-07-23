import { Prisma, PurchaseDocumentType, PurchaseStatus } from '@prisma/client';
import { SuppliersService } from './suppliers.service';

/**
 * Test de l'enrichissement « Notre dette » par fournisseur :
 * dette = SUM(total TTC - paiements fournisseurs actifs), hors annulés/BC.
 */
describe('SuppliersService.findAll debt aggregation', () => {
  function buildService(
    suppliers: Array<{ id: string; name: string }>,
    purchases: Array<{ supplierId: string; total: number; paid: number[] }>,
  ) {
    const findMany = jest.fn().mockResolvedValue(suppliers);
    const purchaseFindMany = jest.fn().mockResolvedValue(
      purchases.map((purchase, index) => ({
        id: `p${index}`,
        supplierId: purchase.supplierId,
        total: new Prisma.Decimal(purchase.total),
        stampDuty: new Prisma.Decimal(0),
        payments: purchase.paid.map((amount) => ({
          amount: new Prisma.Decimal(amount),
        })),
      })),
    );
    const prisma = {
      supplier: {
        findMany,
        count: jest.fn().mockResolvedValue(suppliers.length),
      },
      purchase: { findMany: purchaseFindMany },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
    } as any;
    const service = new SuppliersService(prisma, {} as any);
    return { service, purchaseFindMany };
  }

  it('attache la dette à chaque fournisseur et 0.000 si aucune dette', async () => {
    const { service, purchaseFindMany } = buildService(
      [
        { id: 's1', name: 'Alpha' },
        { id: 's2', name: 'Beta' },
      ],
      [{ supplierId: 's1', total: 100.5, paid: [20] }],
    );

    const result = await service.findAll();

    expect(result.data[0].totalDebt).toBe('80.500');
    expect(result.data[1].totalDebt).toBe('0.000');

    // l'agrégation exclut les achats annulés et ne garde que reste à payer > 0
    const where = purchaseFindMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: PurchaseStatus.CANCELLED });
    expect(where.documentType).toEqual({
      not: PurchaseDocumentType.BON_COMMANDE,
    });
    expect(where.deletedAt).toBeNull();
  });
});
