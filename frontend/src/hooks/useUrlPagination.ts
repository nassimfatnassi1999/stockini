'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  normalizeProductLimit,
  normalizeProductPage,
} from '@/lib/data-table-pagination';

export function useUrlPagination() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();
  const page = normalizeProductPage(searchParams.get('page'));
  const limit = normalizeProductLimit(searchParams.get('limit'));
  const urlSearch = searchParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);

  const updateParams = useCallback(
    (
      updates: Record<string, string | number | undefined>,
      mode: 'push' | 'replace' = 'push',
    ) => {
      const next = new URLSearchParams(paramsKey);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      });
      const href = `${pathname}${next.size ? `?${next.toString()}` : ''}`;
      router[mode](href, { scroll: false });
    },
    [paramsKey, pathname, router],
  );

  useEffect(() => setSearch(urlSearch), [urlSearch]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = search.trim();
      if (normalized !== urlSearch) {
        updateParams({ search: normalized || undefined, page: 1 }, 'replace');
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [search, updateParams, urlSearch]);

  const setPage = useCallback(
    (value: number | ((current: number) => number)) => {
      const next = typeof value === 'function' ? value(page) : value;
      updateParams({ page: Math.max(1, next) });
    },
    [page, updateParams],
  );
  const setLimit = useCallback(
    (value: number | ((current: number) => number)) => {
      const next = typeof value === 'function' ? value(limit) : value;
      updateParams({ limit: next, page: 1 });
    },
    [limit, updateParams],
  );

  return {
    page,
    limit,
    search,
    setSearch,
    urlSearch,
    searchParams,
    updateParams,
    setPage,
    setLimit,
  };
}
