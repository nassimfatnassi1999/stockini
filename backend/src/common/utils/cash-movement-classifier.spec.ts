import {
  CaisseMovementType,
  CashDirection,
  TreasuryAccount,
} from '@prisma/client';
import { CaisseService } from '../../caisse/caisse.service';
import { summarizeCashMovements } from '../../reports/reports-financial.utils';
import {
  CASH_IN_MOVEMENT_TYPES,
  CASH_OUT_MOVEMENT_TYPES,
  CashMovementClassifier,
} from './cash-movement-classifier';

describe('CashMovementClassifier', () => {
  it.each(CASH_IN_MOVEMENT_TYPES)('%s est toujours une entrée', (type) => {
    expect(CashMovementClassifier.direction(type)).toBe(CashDirection.IN);
  });

  it.each(CASH_OUT_MOVEMENT_TYPES)('%s est toujours une sortie', (type) => {
    expect(CashMovementClassifier.direction(type)).toBe(CashDirection.OUT);
  });

  it('classe les montants absolus de production uniquement par leur type', () => {
    const summary = CashMovementClassifier.summarize([
      { type: CaisseMovementType.ENCAISSEMENT_VENTE, montant: '100.000' },
      { type: CaisseMovementType.DEPENSE_GENERALE, montant: '70.000' },
      { type: CaisseMovementType.REFUND_OUT, montant: '5.000' },
    ]);

    expect(summary.inflows.toFixed(3)).toBe('100.000');
    expect(summary.outflows.toFixed(3)).toBe('75.000');
    expect(summary.netFlow.toFixed(3)).toBe('25.000');
  });

  it('donne exactement les mêmes flux à Caisse et au calcul utilisé par Rapports', async () => {
    const movements = [
      {
        type: CaisseMovementType.ENCAISSEMENT_VENTE,
        montant: '100.000',
        treasuryAccount: TreasuryAccount.PHYSICAL_CASH,
      },
      {
        type: CaisseMovementType.DEPENSE_GENERALE,
        montant: '30.000',
        treasuryAccount: TreasuryAccount.PHYSICAL_CASH,
      },
      {
        type: CaisseMovementType.DEPOT_MANUEL,
        montant: '50.000',
        treasuryAccount: TreasuryAccount.BANK_TREASURY,
      },
      {
        type: CaisseMovementType.DECAISSEMENT_ACHAT,
        montant: '20.000',
        treasuryAccount: TreasuryAccount.BANK_TREASURY,
      },
    ];
    const prisma = {
      caisseConfig: {
        findFirst: jest.fn().mockResolvedValue({ solde: 70, soldeBanque: 30 }),
      },
      caisseMovement: { findMany: jest.fn().mockResolvedValue(movements) },
    } as any;
    const reports = {
      getSalesProfitForPeriod: jest.fn().mockResolvedValue({
        netRevenueHt: 0,
        costOfGoodsSold: 0,
        grossProfit: 0,
        grossRevenueHt: 0,
        expenses: 0,
        netProfit: 0,
        creditNoteImpact: 0,
        saleCount: 0,
        dataQuality: {
          unknownCostLines: 0,
          estimatedCostLines: 0,
          complete: true,
        },
      }),
    } as any;
    const caisse = new CaisseService(
      prisma,
      {} as any,
      { getTotalClientDebt: jest.fn().mockResolvedValue(0) } as any,
      {} as any,
      reports,
    );

    const caisseSummary = await caisse.getSummary({ period: 'today' });
    const reportsSummary = summarizeCashMovements(movements);

    expect(caisseSummary.cashIn).toBe(reportsSummary.inflows.toFixed(3));
    expect(caisseSummary.cashOut).toBe(reportsSummary.outflows.toFixed(3));
    expect(
      (Number(caisseSummary.cashIn) - Number(caisseSummary.cashOut)).toFixed(3),
    ).toBe(reportsSummary.netFlow.toFixed(3));
    expect(caisseSummary.cashBalance).toBe('100.000');
  });
});

