import { CaisseService } from './caisse.service';

const profit = (grossProfit: number) => ({
  netRevenueHt: grossProfit + 140,
  costOfGoodsSold: 140,
  grossProfit,
  creditNoteImpact: 0,
  saleCount: 1,
  dataQuality: {
    unknownCostLines: 0,
    estimatedCostLines: 0,
    complete: true,
  },
});

describe('CaisseService summary — trésorerie séparée du bénéfice', () => {
  function buildService() {
    const prisma = {
      caisseConfig: {
        findFirst: jest.fn().mockResolvedValue({
          solde: 500,
          soldeBanque: 100,
        }),
      },
      caisseMovement: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { montant: 500 } })
          .mockResolvedValueOnce({ _sum: { montant: -100 } })
          .mockResolvedValueOnce({ _sum: { montant: 0 } })
          .mockResolvedValueOnce({ _sum: { montant: 0 } }),
      },
    } as any;
    const reports = {
      getSalesProfitForPeriod: jest
        .fn()
        .mockResolvedValueOnce(profit(16.8))
        .mockResolvedValueOnce(profit(56))
        .mockResolvedValueOnce(profit(80))
        .mockResolvedValueOnce(profit(120)),
    } as any;
    const service = new CaisseService(
      prisma,
      {} as any,
      { getTotalClientDebt: jest.fn().mockResolvedValue(0) } as any,
      {} as any,
      reports,
    );
    return { service, reports };
  }

  it('un dépôt et un retrait changent les flux mais jamais le bénéfice ventes', async () => {
    const { service } = buildService();
    const summary = await service.getSummary({ period: 'today' });

    expect(summary.cash).toEqual({
      physicalBalance: 500,
      cashInflows: 500,
      cashOutflows: 100,
    });
    expect(summary.sales).toEqual(
      expect.objectContaining({ grossProfit: 16.8, costOfGoodsSold: 140 }),
    );
    expect(summary.profitPeriode).toBe(16.8);
    expect(summary.profitSemaine).toBe(56);
    expect(summary.profitMois).toBe(80);
    expect(summary.profitAnnee).toBe(120);
  });

  it('demande les quatre périodes au calcul financier partagé', async () => {
    const { service, reports } = buildService();
    await service.getSummary({ period: 'yesterday' });

    expect(reports.getSalesProfitForPeriod).toHaveBeenCalledTimes(4);
    expect(reports.getSalesProfitForPeriod).toHaveBeenNthCalledWith(1, {
      gte: expect.any(Date),
      lte: expect.any(Date),
    });
  });
});
