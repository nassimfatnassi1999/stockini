import { FinancialAnalyticsService } from './financial-analytics.service';

describe('FinancialAnalyticsService', () => {
  const product = { id: 'p1', reference: 'P1', name: 'Produit', quantity: 10, category: { name: 'Cat' }, brand: { name: 'Marque' } };
  const sale = (id: string, net: number, cost: number, paid = net * 1.19) => {
    const soldProduct = id === '4' ? { ...product, id: 'p2', reference: 'P2', name: 'Produit perte' } : product;
    return ({
    id, invoiceNumber: `FAC-${id}`, createdAt: new Date('2026-07-14T10:00:00Z'), customerId: 'c1', customer: { name: 'Client' }, counterClientFullName: null,
    subtotal: net, tax: net * .19, stampDuty: 1, paidAmount: paid, remainingAmount: net * 1.19 + 1 - paid, paymentStatus: 'PARTIAL',
    items: [{ productId: soldProduct.id, quantity: 1, unitPrice: net, total: net, discountPercent: 0, unitPurchaseCostHTSnapshot: cost, purchaseCostEstimated: false, designation: soldProduct.name, product: soldProduct }],
  }); };
  const prisma: any = {
    sale: { findMany: jest.fn().mockResolvedValue([sale('1', 82.787, 68.989), sale('2', 100, 60, 50), sale('3', 50, 30), sale('4', 40, 45)]), aggregate: jest.fn().mockResolvedValue({ _sum: { remainingAmount: 99 } }) },
    creditNote: { findMany: jest.fn().mockResolvedValue([]) }, expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 10 } }) },
    payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 150 } }) }, purchase: { aggregate: jest.fn().mockResolvedValue({ _sum: { remainingAmount: 80 } }) },
    caisseConfig: { findFirst: jest.fn().mockResolvedValue({ solde: 200, soldeBanque: 300 }) },
  };
  const service = new FinancialAnalyticsService(prisma);

  it('aggregates four sales from historical COGS snapshots and separates payments', async () => {
    const result = await service.getFinancialSummary({ period: 'today' });
    expect(result.summary.salesCount).toBe(4);
    expect(result.summary.quantitySold).toBe(4);
    expect(result.summary.netRevenueHT).toBe(272.787);
    expect(result.summary.cogsHT).toBe(203.989);
    expect(result.summary.grossMarginHT).toBe(68.798);
    expect(result.summary.netProfit).toBe(58.798);
    expect(result.summary.customerPayments).toBe(150);
    expect(result.sales.reduce((sum, row) => sum + row.netProfit, 0)).toBeCloseTo(result.summary.netProfit, 3);
  });

  it('keeps a loss-making product visible', async () => {
    const result = await service.getFinancialSummary({ period: 'today' });
    expect(result.products.reduce((sum, row) => sum + row.marginHT, 0)).toBe(68.798);
    expect(result.products.some((row) => row.profitability === 'LOSS')).toBe(true);
    expect(result.sales.some((row) => row.marginHT < 0)).toBe(true);
  });
});
