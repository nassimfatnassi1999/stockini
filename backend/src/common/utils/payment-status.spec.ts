import { PaymentStatus } from '@prisma/client';
import { calculatePaymentAmounts } from './payment-status';

describe('calculatePaymentAmounts', () => {
  it.each([
    [100, 100, PaymentStatus.PAID, 0],
    [100, 99.999, PaymentStatus.PAID, 0],
    [100, 40, PaymentStatus.PARTIAL, 60],
    [100, 0, PaymentStatus.UNPAID, 100],
  ])(
    'calcule le statut depuis les montants réels',
    (total, paid, status, remaining) => {
      const result = calculatePaymentAmounts(total, paid);
      expect(result.paymentStatus).toBe(status);
      expect(result.remainingAmount.toNumber()).toBeCloseTo(remaining, 3);
    },
  );

  it('arrondit le TND à 3 décimales en ROUND_HALF_UP', () => {
    const result = calculatePaymentAmounts('295.8374', '100.0005');
    expect(result.paidAmount.toFixed(3)).toBe('100.001');
    expect(result.remainingAmount.toFixed(3)).toBe('195.836');
  });

  it('centralise la formule total TTC moins paiements moins avoirs', () => {
    const result = calculatePaymentAmounts('2032.161', '100.000', '50.000');
    expect(result.remainingAmount.toFixed(3)).toBe('1882.161');
    expect(result.remainingAmount.lte('2032.161')).toBe(true);
  });
});
