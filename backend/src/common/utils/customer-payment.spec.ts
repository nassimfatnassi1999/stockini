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

  it('solde le document sans gonfler le montant encaissé lorsque l’écart est accepté', () => {
    const result = allocateCustomerPayment({
      remainingBefore: '134.106',
      amountReceived: '130.000',
      method: PaymentMethod.CASH,
      hasCustomer: true,
      acceptAsFullyPaid: true,
    });
    expect(result.amountReceived.toFixed(3)).toBe('130.000');
    expect(result.amountApplied.toFixed(3)).toBe('130.000');
    expect(result.acceptedDifference.toFixed(3)).toBe('4.106');
    expect(result.remainingAfter.toFixed(3)).toBe('0.000');
    expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    expect(result.settlementMode).toBe('ACCEPTED_DIFFERENCE');
  });

  it('refuse l’option lorsque le montant atteint ou dépasse le reste', () => {
    expect(() => allocateCustomerPayment({
      remainingBefore: '100.000',
      amountReceived: '100.000',
      method: PaymentMethod.CASH,
      hasCustomer: true,
      acceptAsFullyPaid: true,
    })).toThrow(/montant inférieur/);
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
