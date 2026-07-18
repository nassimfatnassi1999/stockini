import { PaymentStatus } from '@prisma/client';
import { calculatePaymentAmounts } from './payment-status';

describe('calculatePaymentAmounts', () => {
  it.each([
    [100, 100, PaymentStatus.PAID, 0],
    [100, 99.999, PaymentStatus.PAID, 0.001],
    [100, 40, PaymentStatus.PARTIAL, 60],
    [100, 0, PaymentStatus.UNPAID, 100],
  ])('calcule le statut depuis les montants réels', (total, paid, status, remaining) => {
    const result = calculatePaymentAmounts(total, paid);
    expect(result.paymentStatus).toBe(status);
    expect(result.remainingAmount.toNumber()).toBeCloseTo(remaining, 3);
  });
});
