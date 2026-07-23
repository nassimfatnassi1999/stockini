import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPaginationItems,
  getPaginationDisabledState,
  getValidPage,
  normalizeProductLimit,
  normalizeProductPage,
} from './data-table-pagination';

test('affiche toutes les pages pour une pagination courte', () => {
  assert.deepEqual(getPaginationItems(1, 1), [1]);
  assert.deepEqual(getPaginationItems(1, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('compacte les nombreuses pages autour de la page active', () => {
  assert.deepEqual(
    getPaginationItems(6, 25),
    [1, 'ellipsis', 4, 5, 6, 7, 8, 'ellipsis', 25],
  );
  assert.deepEqual(
    getPaginationItems(1, 25),
    [1, 2, 3, 'ellipsis', 25],
  );
});

test('normalise les paramètres URL invalides', () => {
  assert.equal(normalizeProductPage(null), 1);
  assert.equal(normalizeProductPage('-2'), 1);
  assert.equal(normalizeProductPage('8'), 8);
  assert.equal(normalizeProductLimit('5'), 10);
  assert.equal(normalizeProductLimit('20'), 20);
  assert.equal(normalizeProductLimit('101'), 10);
});

test('désactive précédent sur la première page et suivant sur la dernière', () => {
  assert.deepEqual(getPaginationDisabledState(1, 10), {
    previousDisabled: true,
    nextDisabled: false,
  });
  assert.deepEqual(getPaginationDisabledState(10, 10), {
    previousDisabled: false,
    nextDisabled: true,
  });
  assert.deepEqual(getPaginationDisabledState(1, 0), {
    previousDisabled: true,
    nextDisabled: true,
  });
});

test('revient à la dernière page valide après suppression', () => {
  assert.equal(getValidPage(4, 3), 3);
  assert.equal(getValidPage(1, 0), 1);
});
