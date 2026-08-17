import assert from 'node:assert/strict';
import test from 'node:test';
import { getPaymentDisplay, isPayableDocument } from './format';

test('a DEVIS always has a neutral payment display', () => {
  assert.equal(isPayableDocument('DEVIS'), false);
  assert.deepEqual(getPaymentDisplay('DEVIS', 'UNPAID'), {
    label: '—',
    className: 'border-gray-200 bg-gray-100 text-gray-500',
  });
});

test('payable sales retain their payment status', () => {
  assert.equal(isPayableDocument('BON_LIVRAISON'), true);
  assert.equal(getPaymentDisplay('BON_LIVRAISON', 'UNPAID').label, 'Non payé');
  assert.equal(getPaymentDisplay('FACTURE', 'PAID').label, 'Payé');
});
