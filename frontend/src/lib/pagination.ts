export const DEFAULT_PAGE_SIZE = 5;
export const PAGINATION_LIMIT_OPTIONS = [5, 10, 20, 30, 100] as const;

type PaginationParams = {
  page?: unknown;
  limit?: unknown;
};

function toInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return undefined;
  return Math.trunc(parsed);
}

export function cleanPaginationParams<T extends PaginationParams>(
  params?: T,
): Partial<T> & { page: number; limit: number } {
  const cleaned = Object.entries(params ?? {}).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (typeof value === 'number' && (Number.isNaN(value) || !Number.isFinite(value))) ||
      (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
    ) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});

  const pageValue = toInteger(cleaned.page);
  const limitValue = toInteger(cleaned.limit);

  const page = Math.max(1, pageValue ?? 1);
  let limit = DEFAULT_PAGE_SIZE;

  if (limitValue !== undefined) {
    if (limitValue > 100) {
      limit = 100;
    } else if ((PAGINATION_LIMIT_OPTIONS as readonly number[]).includes(limitValue)) {
      limit = limitValue;
    }
  }

  return {
    ...(cleaned as Partial<T>),
    page,
    limit,
  };
}
