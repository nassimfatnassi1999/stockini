import type {
  PaginatedResponse,
  PaginationMeta,
} from '../interfaces/paginated-response.interface';

export function buildPagination(
  page: number,
  limit: number,
  totalItems: number,
): PaginationMeta {
  const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  totalItems: number,
): PaginatedResponse<T> & {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
} {
  const pagination = buildPagination(page, limit, totalItems);
  return {
    data,
    pagination,
    total: totalItems,
    page,
    limit,
    totalPages: pagination.totalPages,
  };
}
