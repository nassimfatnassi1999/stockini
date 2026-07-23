import { PaymentMethod, PaymentStatus, SurplusDisposition } from '@prisma/client';
import { allocateCustomerPayment } from './customer-payment';

describe('allocateCustomerPayment', () => {
  it.each([
    ['200.000', '200.000', '129.549', PaymentStatus.PARTIAL],
    ['329.549', '329.549', '0.000', PaymentStatus.PAID],
  ])('alloue un reçu de %s', (received, applied, remaining, status) => {
    const result = allocateCustomerPayment({
      remainingBefore: '329.549',
      amountReceived: received,
      method: PaymentMethod.CASH,
      hasCustomer: true,
    });
    expect(result.amountApplied.toFixed(3)).toBe(applied);
    expect(result.remainingAfter.toFixed(3)).toBe(remaining);
    expect(result.paymentStatus).toBe(status);
  });

  it.each([
    [SurplusDisposition.RETURNED, '0.451', '0.000', '0.000'],
    [SurplusDisposition.CASH_SURPLUS, '0.000', '0.451', '0.000'],
    [SurplusDisposition.CUSTOMER_CREDIT, '0.000', '0.000', '0.451'],
  ])('répartit exactement un trop-perçu %s', (disposition, returned, retained, credit) => {
    const result = allocateCustomerPayment({
      remainingBefore: '329.549',
      amountReceived: '330.000',
      method: PaymentMethod.CASH,
      surplusDisposition: disposition,
      hasCustomer: true,
    });
    expect(result.amountApplied.toFixed(3)).toBe('329.549');
    expect(result.changeDue.toFixed(3)).toBe('0.451');
    expect(result.changeReturned.toFixed(3)).toBe(returned);
    expect(result.retainedSurplus.toFixed(3)).toBe(retained);
    expect(result.customerCreditCreated.toFixed(3)).toBe(credit);
    expect(result.remainingAfter.toFixed(3)).toBe('0.000');
  });
});
