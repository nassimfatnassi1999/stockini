import {
  buildPaginatedResponse,
  buildPagination,
} from './pagination.util';

describe('pagination utilities', () => {
  it.each([
    [0, 1],
    [1, 1],
    [10, 1],
    [11, 2],
    [74, 8],
  ])('calcule %i éléments en %i page(s)', (totalItems, totalPages) => {
    expect(buildPagination(1, 10, totalItems)).toEqual({
      page: 1,
      limit: 10,
      totalItems,
      totalPages,
      hasPreviousPage: false,
      hasNextPage: totalPages > 1,
    });
  });

  it('conserve les alias pendant la migration des écrans', () => {
    const response = buildPaginatedResponse(['row'], 6, 10, 74);
    expect(response.pagination).toEqual({
      page: 6,
      limit: 10,
      totalItems: 74,
      totalPages: 8,
      hasPreviousPage: true,
      hasNextPage: true,
    });
    expect(response).toEqual(expect.objectContaining({
      data: ['row'],
      total: 74,
      page: 6,
      limit: 10,
      totalPages: 8,
    }));
  });
});
