import { CustomerDebtCalculator } from './customer-debt-calculator';

describe('CustomerDebtCalculator', () => {
  it.each([
    ['facture 100, paiement 100', '0.000', '0.000'],
    ['facture 100, paiement 99, écart accepté 1', '0.000', '0.000'],
    ['facture 100, paiement 60', '40.000', '40.000'],
  ])('%s → dette %s', (_label, remainingAmount, expected) => {
    const result = CustomerDebtCalculator.summarize([{ remainingAmount }]);
    expect(result.debtAmount.toFixed(3)).toBe(expected);
  });

  it('paiement partiel, avoir puis paiement : toutes les vues lisent le même solde final', () => {
    // 100 - paiement 30 - avoir 20 - paiement 10 = 40, maintenu sur Sale.
    const sale = { customerId: 'customer-1', remainingAmount: '40.000' };
    const global = CustomerDebtCalculator.summarize([sale]);
    const byCustomer = CustomerDebtCalculator.groupByCustomer([sale]);
    const displayed = CustomerDebtCalculator.remaining(sale.remainingAmount);

    expect(global.debtAmount.toFixed(3)).toBe('40.000');
    expect(byCustomer.get('customer-1')?.debtAmount.toFixed(3)).toBe('40.000');
    expect(displayed.toFixed(3)).toBe('40.000');
  });

  it('ne crée jamais une dette négative', () => {
    expect(CustomerDebtCalculator.remaining('-1.000').toFixed(3)).toBe('0.000');
  });
});

