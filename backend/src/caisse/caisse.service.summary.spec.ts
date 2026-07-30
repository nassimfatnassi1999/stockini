import { CaisseMovementType, TreasuryAccount } from '@prisma/client';
import { CaisseService } from './caisse.service';

const profit = (grossProfit: number) => ({
  netRevenueHt: grossProfit + 140,
  costOfGoodsSold: 140,
  grossProfit,
  grossRevenueHt: grossProfit + 140,
  expenses: 5,
  netProfit: grossProfit - 5,
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
        findMany: jest.fn().mockResolvedValue([
          {
            type: CaisseMovementType.DEPOT_MANUEL,
            montant: 500,
            treasuryAccount: TreasuryAccount.PHYSICAL_CASH,
          },
          {
            type: CaisseMovementType.RETRAIT_MANUEL,
            montant: 100,
            treasuryAccount: TreasuryAccount.PHYSICAL_CASH,
          },
        ]),
      },
    } as any;
    const reports = {
      getSalesProfitForPeriod: jest
        .fn()
        .mockResolvedValueOnce(profit(16.8)),
    } as any;
    const service = new CaisseService(
      prisma,
      {} as any,
      { getTotalClientDebt: jest.fn().mockResolvedValue(0) } as any,
      {} as any,
      reports,
    );
    return { service, reports, prisma };
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
    expect(summary.profitPeriode).toBe(11.8);
    expect(summary.netProfit).toBe('11.800');
    expect(summary.grossProfit).toBe('16.800');
    expect(summary.expenses).toBe('5.000');
  });

  it('demande les quatre périodes au calcul financier partagé', async () => {
    const { service, reports } = buildService();
    await service.getSummary({ period: 'yesterday' });

    expect(reports.getSalesProfitForPeriod).toHaveBeenCalledTimes(1);
    expect(reports.getSalesProfitForPeriod).toHaveBeenNthCalledWith(1, {
      gte: expect.any(Date),
      lte: expect.any(Date),
    });
  });

  it('les flux de caisse ne sont jamais utilisés comme bénéfice', async () => {
    const { service } = buildService();
    const summary = await service.getSummary({ period: 'today' });
    expect(summary.entrees - summary.sorties).toBe(400);
    expect(summary.profitPeriode).toBe(11.8);
  });

  it('les KPIs excluent explicitement les mouvements supprimés', async () => {
    const { service, prisma } = buildService();
    await service.getSummary({ period: 'today' });

    expect(prisma.caisseMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });
});
