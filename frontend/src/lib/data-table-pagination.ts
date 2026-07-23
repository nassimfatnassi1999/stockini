export const PRODUCT_PAGE_LIMITS = [10, 20, 30, 50, 100] as const;

export type PaginationItem = number | 'ellipsis';

export function getPaginationItems(
  page: number,
  totalPages: number,
): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: Math.max(totalPages, 0) }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages]);
  for (let candidate = page - 2; candidate <= page + 2; candidate += 1) {
    if (candidate > 1 && candidate < totalPages) pages.add(candidate);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) items.push('ellipsis');
    items.push(value);
  });
  return items;
}

export function normalizeProductPage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export function normalizeProductLimit(value: string | null): number {
  const parsed = Number(value);
  return (PRODUCT_PAGE_LIMITS as readonly number[]).includes(parsed) ? parsed : 10;
}

export function getValidPage(page: number, totalPages: number): number {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

export function getPaginationDisabledState(
  page: number,
  totalPages: number,
  disabled = false,
) {
  return {
    previousDisabled: disabled || page <= 1,
    nextDisabled: disabled || totalPages === 0 || page >= totalPages,
  };
}

export function getPaginationRange(
  page: number,
  limit: number,
  totalItems: number,
) {
  return {
    startItem: totalItems === 0 ? 0 : (page - 1) * limit + 1,
    endItem: Math.min(page * limit, totalItems),
  };
}
