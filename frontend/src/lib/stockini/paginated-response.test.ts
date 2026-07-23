import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePaginatedResponse } from './paginated-response';

const rows = [{ id: '1' }, { id: '2' }];

test('conserve le contrat paginé courant', () => {
  const result = normalizePaginatedResponse({
    data: rows,
    pagination: {
      page: 2,
      limit: 10,
      totalItems: 22,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    },
  });

  assert.deepEqual(result.data, rows);
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.totalItems, 22);
});

test('normalise le contrat paginé legacy à plat', () => {
  const result = normalizePaginatedResponse({
    data: rows,
    page: 2,
    limit: 10,
    total: 22,
    totalPages: 3,
  });

  assert.deepEqual(result.data, rows);
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 10,
    totalItems: 22,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: true,
  });
});

test('normalise un ancien tableau en page unique', () => {
  const result = normalizePaginatedResponse(rows, { limit: 100 });

  assert.deepEqual(result.data, rows);
  assert.deepEqual(result.pagination, {
    page: 1,
    limit: 100,
    totalItems: 2,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
});

test('retourne une page vide sûre pour null et les objets inattendus', () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const nullResult = normalizePaginatedResponse(null, { page: 3, limit: 20 });
    const objectResult = normalizePaginatedResponse({});

    assert.deepEqual(nullResult.data, []);
    assert.equal(nullResult.pagination.page, 3);
    assert.deepEqual(objectResult.data, []);
  } finally {
    console.warn = originalWarn;
  }
});

