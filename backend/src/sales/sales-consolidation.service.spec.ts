import { BadRequestException } from '@nestjs/common';
import { DocumentType, PaymentStatus, Prisma, SaleStatus } from '@prisma/client';
import { SalesService } from './sales.service';

function source(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    invoiceNumber: `BL-${id}`,
    customerId: 'customer-1',
    customer: { id: 'customer-1', name: 'Client Test' },
    clientType: 'PERSISTENT',
    documentType: DocumentType.BON_LIVRAISON,
    status: SaleStatus.COMPLETED,
    deletedAt: null,
    isConsolidated: false,
    subtotal: new Prisma.Decimal(100),
    discount: new Prisma.Decimal(0),
    tax: new Prisma.Decimal(19),
    total: new Prisma.Decimal(119),
    stampDuty: new Prisma.Decimal(1),
    consolidationMemberships: [],
    payments: [],
    creditNotes: [],
    createdAt: new Date(),
    items: [{
      id: `item-${id}`, productId: 'product-1', designation: 'Produit', quantity: 1,
      unitPrice: new Prisma.Decimal(100), discountPercent: new Prisma.Decimal(0),
      marginPercent: new Prisma.Decimal(40), tvaPercent: new Prisma.Decimal(19),
      finalUnitPrice: new Prisma.Decimal(100), total: new Prisma.Decimal(100),
      unitPurchaseCostHt: new Prisma.Decimal(70), purchaseCostEstimated: false, calculationVersion: 4,
    }],
    ...overrides,
  };
}

function build(sources: ReturnType<typeof source>[]) {
  const created: { data?: any } = {};
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    sale: {
      findMany: jest.fn().mockResolvedValue(sources),
      create: jest.fn(({ data }: { data: any }) => {
        created.data = data;
        return Promise.resolve({ id: 'parent-1', ...data, customer: sources[0]?.customer, items: data.items.create, consolidationSources: data.consolidationSources.create });
      }),
    },
  };
  const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
  const references = { generateConsolidatedSalesDocumentNumber: jest.fn().mockResolvedValue('BLG-CLIENTTEST-18072026-001') };
  const audit = { audit: jest.fn().mockResolvedValue(undefined) };
  const service = new SalesService(prisma, {} as any, references as any, {} as any, {} as any, {} as any, audit as any);
  return { service, tx, created, audit };
}

describe('SalesService consolidations', () => {
  it('regroupe deux BL avec un seul timbre fiscal de 1 DT', async () => {
    const { service, created } = build([source('1'), source('2')]);
    await service.createConsolidation({ sourceIds: ['1', '2'], targetType: DocumentType.BON_LIVRAISON, date: '2026-07-18' });
    expect(created.data.invoiceNumber).toBe('BLG-CLIENTTEST-18072026-001');
    expect(created.data.total.toNumber()).toBe(238);
    expect(created.data.stampDuty.toNumber()).toBe(1);
    expect(created.data.total.plus(created.data.stampDuty).toNumber()).toBe(239);
    expect(created.data.items.create).toHaveLength(2);
    expect(created.data.items.create[0]).toEqual(expect.objectContaining({ sourceSaleId: '1', sourceReference: 'BL-1' }));
    expect(created.data.paymentStatus).toBe(PaymentStatus.UNPAID);
  });

  it('agrège les paiements et avoirs historiques sans les recréer', async () => {
    const paid = source('1', { payments: [{ amount: new Prisma.Decimal(50) }], creditNotes: [{ montantRembourse: new Prisma.Decimal(10) }] });
    const { service, created, tx } = build([paid, source('2')]);
    await service.createConsolidation({ sourceIds: ['1', '2'], targetType: DocumentType.FACTURE });
    expect(created.data.paidAmount.toNumber()).toBe(50);
    expect(created.data.totalRefunded.toNumber()).toBe(10);
    expect(created.data.remainingAmount.toNumber()).toBe(179);
    expect(tx.payment).toBeUndefined();
  });

  it('regroupe six BL sans multiplier le timbre fiscal', async () => {
    const sources = Array.from({ length: 6 }, (_, index) => source(String(index + 1)));
    const { service, created } = build(sources);
    await service.createConsolidation({ sourceIds: sources.map((sale) => sale.id), targetType: DocumentType.BON_LIVRAISON });
    expect(created.data.total.toNumber()).toBe(714);
    expect(created.data.stampDuty.toNumber()).toBe(1);
    expect(created.data.remainingAmount.toNumber()).toBe(715);
  });

  it('applique un timbre unique même si les sources sont sans timbre ou ont des timbres historiques différents', async () => {
    const sources = [
      source('1', { stampDuty: new Prisma.Decimal(0) }),
      source('2', { stampDuty: new Prisma.Decimal(2) }),
    ];
    const { service, created } = build(sources);
    await service.createConsolidation({ sourceIds: ['1', '2'], targetType: DocumentType.FACTURE });
    expect(created.data.total.toNumber()).toBe(238);
    expect(created.data.stampDuty.toNumber()).toBe(1);
    expect(created.data.remainingAmount.toNumber()).toBe(239);
  });

  it('calcule le reste partiellement payé avec le timbre unique', async () => {
    const sources = [
      source('1', { payments: [{ amount: new Prisma.Decimal(50) }] }),
      source('2'),
    ];
    const { service, created } = build(sources);
    await service.createConsolidation({ sourceIds: ['1', '2'], targetType: DocumentType.BON_LIVRAISON });
    expect(created.data.stampDuty.toNumber()).toBe(1);
    expect(created.data.paidAmount.toNumber()).toBe(50);
    expect(created.data.remainingAmount.toNumber()).toBe(189);
    expect(created.data.paymentStatus).toBe(PaymentStatus.PARTIAL);
  });

  it('refuse des clients différents', async () => {
    const { service } = build([source('1'), source('2', { customerId: 'customer-2' })]);
    await expect(service.createConsolidation({ sourceIds: ['1', '2'], targetType: DocumentType.BON_LIVRAISON })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse le mélange BL/facture et un document déjà regroupé', async () => {
    const mixed = build([source('1'), source('2', { documentType: DocumentType.FACTURE })]);
    await expect(mixed.service.createConsolidation({ sourceIds: ['1', '2'], targetType: DocumentType.FACTURE })).rejects.toThrow(/mélangés/);
    const grouped = build([source('1'), source('2', { consolidationMemberships: [{ consolidatedSaleId: 'other' }] })]);
    await expect(grouped.service.createConsolidation({ sourceIds: ['1', '2'], targetType: DocumentType.BON_LIVRAISON })).rejects.toThrow(/déjà/);
  });
});
