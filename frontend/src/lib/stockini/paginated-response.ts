import type {
  PaginatedApiResponse,
  PaginationMetadata,
} from './types';

type PaginationFallback = {
  page?: number;
  limit?: number;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

function warnUnexpectedPayload(context: string, payload: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[pagination] Réponse inattendue pour ${context}; une liste vide est utilisée.`,
      payload,
    );
  }
}

function buildMetadata(
  source: UnknownRecord,
  itemCount: number,
  fallback: PaginationFallback,
): PaginationMetadata {
  const nested = isRecord(source.pagination) ? source.pagination : {};
  const page = positiveInteger(nested.page ?? source.page, fallback.page ?? 1);
  const limit = positiveInteger(
    nested.limit ?? source.limit,
    fallback.limit ?? Math.max(itemCount, 1),
  );
  const totalItems = nonNegativeInteger(
    nested.totalItems ?? source.totalItems ?? source.total,
    itemCount,
  );
  const totalPages = positiveInteger(
    nested.totalPages ?? source.totalPages,
    Math.max(Math.ceil(totalItems / limit), 1),
  );

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasPreviousPage:
      typeof nested.hasPreviousPage === 'boolean'
        ? nested.hasPreviousPage
        : page > 1,
    hasNextPage:
      typeof nested.hasNextPage === 'boolean'
        ? nested.hasNextPage
        : page < totalPages,
  };
}

/**
 * Converts current paginated responses, legacy flat responses and legacy arrays
 * into the single contract consumed by list pages.
 */
export function normalizePaginatedResponse<T>(
  payload: unknown,
  fallback: PaginationFallback = {},
  context = 'API',
): PaginatedApiResponse<T> {
  if (Array.isArray(payload)) {
    const limit = fallback.limit ?? Math.max(payload.length, 1);
    return {
      data: payload as T[],
      pagination: {
        page: 1,
        limit,
        totalItems: payload.length,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    };
  }

  if (isRecord(payload) && Array.isArray(payload.data)) {
    return {
      data: payload.data as T[],
      pagination: buildMetadata(payload, payload.data.length, fallback),
    };
  }

  // Tolerate one accidental transport envelope: { data: { data, pagination } }.
  if (isRecord(payload) && isRecord(payload.data)) {
    return normalizePaginatedResponse<T>(
      payload.data,
      fallback,
      context,
    );
  }

  warnUnexpectedPayload(context, payload);
  const page = fallback.page ?? 1;
  const limit = fallback.limit ?? 10;
  return {
    data: [],
    pagination: {
      page,
      limit,
      totalItems: 0,
      totalPages: 1,
      hasPreviousPage: page > 1,
      hasNextPage: false,
    },
  };
}

