import assert from 'node:assert/strict';
import test from 'node:test';
import { canShowCashMovementDeletion, isDeletionReasonValid } from './cash-movement-deletion';

test('la suppression est visible uniquement pour les rôles administrateurs', () => {
  assert.equal(canShowCashMovementDeletion('ADMIN'), true);
  assert.equal(canShowCashMovementDeletion('SUPER_ADMIN'), true);
  assert.equal(canShowCashMovementDeletion('CASHIER'), false);
  assert.equal(canShowCashMovementDeletion('STOCK_MANAGER'), false);
});

test('le motif de suppression est obligatoire et ne peut pas être blanc', () => {
  assert.equal(isDeletionReasonValid(''), false);
  assert.equal(isDeletionReasonValid('   '), false);
  assert.equal(isDeletionReasonValid('Mouvement créé en double'), true);
});
