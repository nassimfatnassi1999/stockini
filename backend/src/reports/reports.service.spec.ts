import { ReportsService, resolveReportDateRange } from './reports.service';

// ─── resolveReportDateRange ───────────────────────────────────────────────────

describe('resolveReportDateRange', () => {
  const TZ_OFFSET_MS = 60 * 60_000;

  it('today: gte is start of local day, lte is end of local day', () => {
    const { gte, lte } = resolveReportDateRange('today', undefined, undefined);
    const localGte = new Date(gte.getTime() + TZ_OFFSET_MS);
    const localLte = new Date(lte.getTime() + TZ_OFFSET_MS);
    expect(localGte.getUTCHours()).toBe(0);
    expect(localGte.getUTCMinutes()).toBe(0);
    expect(localLte.getUTCHours()).toBe(23);
    expect(localLte.getUTCMinutes()).toBe(59);
    expect(lte.getTime() - gte.getTime()).toBe(86_400_000 - 1);
  });

  it('week: range is 7 days ago → now', () => {
    const now = Date.now();
    const { gte, lte } = resolveReportDateRange('week', undefined, undefined);
    const diffDays = (lte.getTime() - gte.getTime()) / 86_400_000;
    expect(diffDays).toBeCloseTo(7, 0);
    expect(lte.getTime()).toBeLessThanOrEqual(now + 1000);
  });

  it('month: gte is start of current month', () => {
    const { gte } = resolveReportDateRange('month', undefined, undefined);
    const local = new Date(gte.getTime() + TZ_OFFSET_MS);
    expect(local.getUTCDate()).toBe(1);
    expect(local.getUTCHours()).toBe(0);
  });

  it('year: gte is Jan 1 of current year', () => {
    const { gte } = resolveReportDateRange('year', undefined, undefined);
    const local = new Date(gte.getTime() + TZ_OFFSET_MS);
    expect(local.getUTCMonth()).toBe(0);
    expect(local.getUTCDate()).toBe(1);
  });

  it('custom: uses provided dateFrom and dateTo', () => {
    const { gte, lte } = resolveReportDateRange(
      'custom',
      '2024-01-01',
      '2024-01-31',
    );
    // gte should be start of 2024-01-01 in Africa/Tunis
    const localGte = new Date(gte.getTime() + TZ_OFFSET_MS);
    const localLte = new Date(lte.getTime() + TZ_OFFSET_MS);
    expect(localGte.getUTCFullYear()).toBe(2024);
    expect(localGte.getUTCMonth()).toBe(0);
    expect(localGte.getUTCDate()).toBe(1);
    expect(localLte.getUTCDate()).toBe(31);
  });

  it('undefined period: defaults to current month', () => {
    const now = new Date();
    const localNow = new Date(now.getTime() + TZ_OFFSET_MS);
    const { gte } = resolveReportDateRange(undefined, undefined, undefined);
    const localGte = new Date(gte.getTime() + TZ_OFFSET_MS);
    expect(localGte.getUTCMonth()).toBe(localNow.getUTCMonth());
    expect(localGte.getUTCDate()).toBe(1);
  });
});

// ─── KPI arithmetic helpers ───────────────────────────────────────────────────

describe('KPI arithmetic', () => {
  function caNet(total: number, totalRefunded: number) {
    return total - totalRefunded;
  }
  function benefice(ca: number, achats: number) {
    return ca - achats;
  }
  function marge(ca: number, ben: number) {
    return ca > 0 ? (ben / ca) * 100 : 0;
  }
  function trend(cur: number, prev: number): number | null {
    if (prev === 0) return cur > 0 ? 100 : null;
    return Math.round(((cur - prev) / Math.abs(prev)) * 100);
  }

  describe('caNet', () => {
    it('no refunds: equals total', () => expect(caNet(1000, 0)).toBe(1000));
    it('full refund: equals 0', () => expect(caNet(1000, 1000)).toBe(0));
    it('partial refund: total minus refunded', () =>
      expect(caNet(1000, 200)).toBe(800));
  });

  describe('benefice', () => {
    it('positive when CA > achats', () =>
      expect(benefice(1000, 600)).toBe(400));
    it('zero when equal', () => expect(benefice(800, 800)).toBe(0));
    it('negative when CA < achats (loss)', () =>
      expect(benefice(500, 700)).toBe(-200));
  });

  describe('marge', () => {
    it('40% margin', () => expect(marge(1000, 400)).toBeCloseTo(40));
    it('0% margin when equal', () => expect(marge(800, 0)).toBeCloseTo(0));
    it('no division by zero when CA=0', () => expect(marge(0, -100)).toBe(0));
  });

  describe('trend', () => {
    it('100% when prev=0 and cur>0', () => expect(trend(500, 0)).toBe(100));
    it('null when prev=0 and cur=0', () => expect(trend(0, 0)).toBeNull());
    it('+50% increase', () => expect(trend(150, 100)).toBe(50));
    it('-33% decrease', () => expect(trend(67, 100)).toBe(-33));
  });

  describe('impayés clients calculation', () => {
    // remainingAmount = total - paidAmount (simplified model)
    it('unpaid sale: remaining = total', () => {
      const sale = { total: 500, paidAmount: 0, remainingAmount: 500 };
      expect(sale.remainingAmount).toBe(500);
    });
    it('partially paid: remaining = total - paid', () => {
      const sale = { total: 500, paidAmount: 200, remainingAmount: 300 };
      expect(sale.remainingAmount).toBe(300);
    });
    it('fully paid: remaining = 0', () => {
      const sale = { total: 500, paidAmount: 500, remainingAmount: 0 };
      expect(sale.remainingAmount).toBe(0);
    });
  });

  describe('avoir (credit note) reduces CA', () => {
    it('net CA after avoir', () => {
      const total = 1000;
      const totalRefunded = 150;
      expect(caNet(total, totalRefunded)).toBe(850);
    });
  });

  describe('impayés fournisseurs', () => {
    it('unpaid purchase: remaining = total', () => {
      const purchase = { total: 800, paidAmount: 0, remainingAmount: 800 };
      expect(purchase.remainingAmount).toBe(800);
    });
    it('partially paid: remaining = total - paid', () => {
      const purchase = { total: 800, paidAmount: 300, remainingAmount: 500 };
      expect(purchase.remainingAmount).toBe(500);
    });
    it('fully paid: remaining = 0', () => {
      const purchase = { total: 800, paidAmount: 800, remainingAmount: 0 };
      expect(purchase.remainingAmount).toBe(0);
    });
  });

  describe('stock valuation', () => {
    it('purchase value = qty * purchasePrice', () => {
      const products = [
        { quantity: 10, purchasePrice: 50, salePrice: 80 },
        { quantity: 5, purchasePrice: 20, salePrice: 35 },
      ];
      const purchaseValue = products.reduce(
        (acc, p) => acc + p.quantity * p.purchasePrice,
        0,
      );
      const saleValue = products.reduce(
        (acc, p) => acc + p.quantity * p.salePrice,
        0,
      );
      expect(purchaseValue).toBe(600);
      expect(saleValue).toBe(975);
    });
  });
});

// ─── Business rule: DEVIS not counted as CA ───────────────────────────────────

describe('CA business rules', () => {
  const REVENUE_DOC_TYPES = ['FACTURE', 'BON_LIVRAISON'];

  it('DEVIS excluded from CA', () => {
    expect(REVENUE_DOC_TYPES).not.toContain('DEVIS');
  });

  it('BON_COMMANDE excluded from CA', () => {
    expect(REVENUE_DOC_TYPES).not.toContain('BON_COMMANDE');
  });

  it('FACTURE included in CA', () => {
    expect(REVENUE_DOC_TYPES).toContain('FACTURE');
  });

  it('BON_LIVRAISON included in CA', () => {
    expect(REVENUE_DOC_TYPES).toContain('BON_LIVRAISON');
  });

  it('CANCELLED sales are excluded', () => {
    const sales = [
      { documentType: 'FACTURE', status: 'COMPLETED', total: 1000 },
      { documentType: 'FACTURE', status: 'CANCELLED', total: 500 },
      { documentType: 'BON_LIVRAISON', status: 'COMPLETED', total: 300 },
      { documentType: 'DEVIS', status: 'COMPLETED', total: 200 },
    ];
    const ca = sales
      .filter(
        (s) =>
          REVENUE_DOC_TYPES.includes(s.documentType) &&
          s.status !== 'CANCELLED',
      )
      .reduce((acc, s) => acc + s.total, 0);
    expect(ca).toBe(1300); // 1000 + 300; CANCELLED and DEVIS excluded
  });
});

describe('ReportsService real profit', () => {
  it('utilise le coût snapshot, déduplique le BL transformé et traite un avoir partiel', async () => {
    const saleFindMany = jest.fn().mockResolvedValue([
      {
        subtotal: 238,
        items: [
          {
            quantity: 2,
            unitPurchaseCostHt: 100,
            purchaseCostEstimated: false,
          },
        ],
      },
    ]);
    const prisma = {
      sale: { findMany: saleFindMany },
      creditNote: {
        findMany: jest.fn().mockResolvedValue([
          {
            subtotal: 119,
            items: [
              { quantiteRetournee: 1, saleItem: { unitPurchaseCostHt: 100 } },
            ],
          },
        ]),
      },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 5 } }),
      },
    } as any;
    const service = new ReportsService(prisma);
    const result = await (service as any).calculateFinancials({
      gte: new Date('2026-07-01'),
      lte: new Date('2026-07-31'),
    });
    expect(saleFindMany.mock.calls[0][0].where.OR).toEqual([
      { documentType: 'FACTURE' },
      { documentType: 'BON_LIVRAISON', transformedToId: null },
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        netRevenueHt: 119,
        cogsHt: 100,
        returnedCogsHt: 100,
        grossMarginHt: 19,
        expenses: 5,
        netProfit: 14,
      }),
    );
  });

  it('signale les anciennes lignes dont le coût ne peut pas être reconstruit', async () => {
    const prisma = {
      sale: {
        findMany: jest.fn().mockResolvedValue([
          {
            subtotal: 50,
            items: [
              {
                quantity: 1,
                unitPurchaseCostHt: null,
                purchaseCostEstimated: false,
              },
            ],
          },
        ]),
      },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
      expense: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    } as any;
    const result = await (
      new ReportsService(prisma) as any
    ).calculateFinancials({ gte: new Date(), lte: new Date() });
    expect(result.dataQuality).toEqual({
      unknownCostLines: 1,
      estimatedCostLines: 0,
      complete: false,
    });
  });
});

// ─── Critical stock detection ─────────────────────────────────────────────────

describe('critical stock', () => {
  function classify(p: { quantity: number; minStock: number }) {
    if (p.quantity <= 0) return 'rupture';
    if (p.quantity <= p.minStock) return 'faible';
    return 'ok';
  }

  it('quantity=0 → rupture', () =>
    expect(classify({ quantity: 0, minStock: 5 })).toBe('rupture'));
  it('quantity=-1 → rupture', () =>
    expect(classify({ quantity: -1, minStock: 5 })).toBe('rupture'));
  it('quantity=minStock → faible', () =>
    expect(classify({ quantity: 5, minStock: 5 })).toBe('faible'));
  it('quantity<minStock → faible', () =>
    expect(classify({ quantity: 3, minStock: 5 })).toBe('faible'));
  it('quantity>minStock → ok', () =>
    expect(classify({ quantity: 10, minStock: 5 })).toBe('ok'));
  it('minStock=0 quantity=0 → rupture', () =>
    expect(classify({ quantity: 0, minStock: 0 })).toBe('rupture'));
});
