'use client';

import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HistoryToolbar } from '@/components/stockini/shared/HistoryToolbar';
import { DataTablePagination } from './DataTablePagination';
import { ResponsiveTableContainer } from './ResponsiveTableContainer';
import type { ToolbarFilter } from '@/components/stockini/shared/HistoryToolbar';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ColumnDef<T = Record<string, unknown>> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

export interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'date' | 'text';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export interface DataTableProps<T = Record<string, unknown>> {
  columns: ColumnDef<T>[];
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  filters?: FilterConfig[];
  filterValues?: Record<string, string>;
  searchPlaceholder?: string;
  searchValue?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  onSearchChange?: (search: string) => void;
  onFilterChange?: (key: string, value: string) => void;
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  renderActions?: (row: T) => React.ReactNode;
  emptyMessage?: string;
  rowKey: (row: T) => string;
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-border/40">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortBy, sortOrder }: { col: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  if (col !== sortBy) return <ChevronsUpDown size={12} className="ml-1 inline text-text-muted/50" />;
  return sortOrder === 'asc'
    ? <ChevronUp size={12} className="ml-1 inline text-primary" />
    : <ChevronDown size={12} className="ml-1 inline text-primary" />;
}

// ─── DataTable ─────────────────────────────────────────────────────────────────

export function DataTable<T = Record<string, unknown>>({
  columns,
  data,
  total,
  page,
  limit,
  totalPages,
  loading = false,
  error,
  onRetry,
  filters,
  filterValues = {},
  searchPlaceholder = 'Rechercher…',
  searchValue = '',
  sortBy,
  sortOrder,
  onPageChange,
  onLimitChange,
  onSearchChange,
  onFilterChange,
  onSortChange,
  renderActions,
  emptyMessage = 'Aucun résultat.',
  rowKey,
}: DataTableProps<T>) {
  const [localSearch, setLocalSearch] = useState(searchValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange?.(value);
      onPageChange(1);
    }, 300);
  };

  const handleFilterChange = (key: string, value: string) => {
    onFilterChange?.(key, value);
    onPageChange(1);
  };

  const handleSort = (col: string) => {
    if (!onSortChange) return;
    if (sortBy === col) {
      onSortChange(col, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(col, 'desc');
    }
    onPageChange(1);
  };

  const totalCols = columns.length + (renderActions ? 1 : 0);
  const errorMessage = (() => {
    if (!error) return undefined;
    const message = (error as { response?: { data?: { message?: string | string[] } }; message?: string }).response?.data?.message;
    if (Array.isArray(message)) return message[0];
    return message ?? (error as { message?: string }).message ?? 'Erreur lors du chargement.';
  })();
  const toolbarFilters: ToolbarFilter[] | undefined = filters?.map((f) => ({
    key: f.key,
    type: f.type === 'text' ? 'select' : f.type,
    placeholder: f.placeholder,
    options: f.options,
  }));
  const hasActiveFilters =
    localSearch.trim().length > 0 ||
    Object.values(filterValues).some((v) => v !== '');

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      {/* ── Toolbar ── */}
      {(onSearchChange || (filters && filters.length > 0)) && (
        <HistoryToolbar
          search={localSearch}
          onSearch={handleSearchChange}
          searchPlaceholder={searchPlaceholder}
          filters={toolbarFilters}
          filterValues={filterValues}
          onFilterChange={handleFilterChange}
          resultsCount={total}
          onReset={
            hasActiveFilters
              ? () => {
                  handleSearchChange('');
                  filters?.forEach((f) => onFilterChange?.(f.key, ''));
                  onPageChange(1);
                }
              : undefined
          }
          isFetching={loading}
        />
      )}

      {/* ── Tableau ── */}
      <ResponsiveTableContainer>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted ${col.className ?? ''} ${col.sortable && onSortChange ? 'cursor-pointer select-none hover:text-text-primary' : ''}`}
                  onClick={() => col.sortable && onSortChange && handleSort(col.key)}
                >
                  {col.label}
                  {col.sortable && onSortChange && (
                    <SortIcon col={col.key} sortBy={sortBy} sortOrder={sortOrder} />
                  )}
                </th>
              ))}
              {renderActions && (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {errorMessage ? (
              <tr>
                <td colSpan={totalCols} className="px-4 py-10 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                    <p className="text-sm font-medium text-red-600">{errorMessage}</p>
                    {onRetry && (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex h-8 items-center rounded-md border border-border bg-white px-3 text-xs font-medium text-text-primary transition-colors hover:bg-muted"
                      >
                        Réessayer
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : loading ? (
              <SkeletonRows cols={totalCols} />
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="px-4 py-10 text-center text-sm text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="transition-colors hover:bg-muted/40"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                      {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                    </td>
                  ))}
                  {renderActions && (
                    <td className="px-4 py-3">{renderActions(row)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ResponsiveTableContainer>

      {/* ── Pagination ── */}
      <DataTablePagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        limit={limit}
        disabled={loading}
        onPageChange={onPageChange}
        onLimitChange={onLimitChange}
      />
    </div>
  );
}
