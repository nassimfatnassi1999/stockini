import {
  PaymentType,
  Prisma,
  PurchaseDocumentType,
  PurchaseStatus,
} from '@prisma/client';
import {
  getSupplierDebtMap,
  VALID_SUPPLIER_PAYMENT_WHERE,
} from './purchase-payment-state';

describe('source de vérité dette fournisseur', () => {
  function purchase(
    id: string,
    supplierId: string,
    total: string,
    payments: string[],
  ) {
    return {
      id,
      supplierId,
      total: new Prisma.Decimal(total),
      stampDuty: new Prisma.Decimal(0),
      payments: payments.map((amount) => ({
        amount: new Prisma.Decimal(amount),
      })),
    };
  }

  it.each([
    ['sans paiement', [], '295.837'],
    ['totalement payée', ['295.837'], '0.000'],
    ['partiellement payée', ['100.000'], '195.837'],
  ])(
    '%s : calcule le reste exact en TND',
    async (_label, payments, expected) => {
      const findMany = jest
        .fn()
        .mockResolvedValue([purchase('p1', 'supplier-1', '295.837', payments)]);
      const result = await getSupplierDebtMap({
        purchase: { findMany },
      } as any);
      expect(result.get('supplier-1')?.toFixed(3)).toBe(expected);
    },
  );

  it('additionne uniquement les restes de plusieurs factures', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        purchase('p1', 'supplier-1', '295.837', ['295.837']),
        purchase('p2', 'supplier-1', '200.000', ['50.000']),
        purchase('p3', 'supplier-1', '25.125', []),
      ]);
    const result = await getSupplierDebtMap({ purchase: { findMany } } as any);
    expect(result.get('supplier-1')?.toFixed(3)).toBe('175.125');
  });

  it('réaugmente la dette quand un paiement supprimé n’est plus actif', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        purchase('p1', 'supplier-1', '295.837', ['295.837']),
      ])
      .mockResolvedValueOnce([purchase('p1', 'supplier-1', '295.837', [])]);
    const db = { purchase: { findMany } } as any;
    const beforeDeletion = await getSupplierDebtMap(db);
    const afterDeletion = await getSupplierDebtMap(db);
    expect(beforeDeletion.get('supplier-1')?.toFixed(3)).toBe('0.000');
    expect(afterDeletion.get('supplier-1')?.toFixed(3)).toBe('295.837');
  });

  it('demande seulement les achats validés et paiements fournisseurs non supprimés', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await getSupplierDebtMap({ purchase: { findMany } } as any);
    const query = findMany.mock.calls[0][0];
    expect(query.where).toEqual(
      expect.objectContaining({
        deletedAt: null,
        status: { not: PurchaseStatus.CANCELLED },
        documentType: { not: PurchaseDocumentType.BON_COMMANDE },
      }),
    );
    expect(query.select.payments.where).toEqual({
      type: PaymentType.SUPPLIER_PAYMENT,
      deletedAt: null,
    });
    expect(VALID_SUPPLIER_PAYMENT_WHERE).toEqual({
      type: PaymentType.SUPPLIER_PAYMENT,
      deletedAt: null,
    });
  });

  it('n’interroge jamais les dépenses générales', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const expenseFindMany = jest.fn();
    await getSupplierDebtMap({
      purchase: { findMany },
      expense: { findMany: expenseFindMany },
    } as any);
    expect(expenseFindMany).not.toHaveBeenCalled();
  });
});
