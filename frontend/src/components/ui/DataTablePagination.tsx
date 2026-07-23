'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  getPaginationItems,
  getPaginationDisabledState,
  getPaginationRange,
  PRODUCT_PAGE_LIMITS,
} from '@/lib/data-table-pagination';

export type DataTablePaginationProps = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  allowedLimits?: readonly number[];
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  disabled?: boolean;
};

export function DataTablePagination({
  page,
  limit,
  totalItems,
  totalPages,
  allowedLimits = PRODUCT_PAGE_LIMITS,
  onPageChange,
  onLimitChange,
  disabled = false,
}: DataTablePaginationProps) {
  const { startItem: from, endItem: to } = getPaginationRange(
    page,
    limit,
    totalItems,
  );
  const items = getPaginationItems(page, totalPages);
  const { previousDisabled, nextDisabled } = getPaginationDisabledState(
    page,
    totalPages,
    disabled,
  );

  useEffect(() => {
    if (!disabled && page > Math.max(totalPages, 1)) {
      onPageChange(Math.max(totalPages, 1));
    }
  }, [disabled, onPageChange, page, totalPages]);

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="order-2 flex items-center justify-between gap-3 sm:order-1 sm:justify-start">
        <label className="flex items-center gap-2 text-text-muted">
          <span className="hidden md:inline">Lignes par page :</span>
          <span className="md:hidden">Lignes :</span>
          <select
            aria-label="Lignes par page"
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            disabled={disabled}
            className="h-9 rounded-md border border-border bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          >
            {allowedLimits.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <span className="whitespace-nowrap text-text-muted" aria-live="polite">
          {from}–{to} sur {totalItems}
        </span>
      </div>

      <nav className="order-1 flex items-center justify-between gap-1 sm:order-2 sm:justify-end" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={previousDisabled}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-white px-2 text-text-muted transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Page précédente"
        >
          <ChevronLeft size={15} />
          <span className="sm:hidden lg:inline">Précédent</span>
        </button>

        <div className="hidden items-center gap-1 sm:flex">
          {items.map((item, index) =>
            item === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="inline-flex h-9 w-7 items-center justify-center text-text-muted">…</span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                disabled={disabled}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Aller à la page ${item}`}
                className={cn(
                  'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  item === page
                    ? 'border-primary bg-primary font-semibold text-white'
                    : 'border-border bg-white text-text-muted hover:bg-muted hover:text-text-primary',
                )}
              >
                {item}
              </button>
            ),
          )}
        </div>
        <span className="px-2 text-xs font-medium sm:hidden">
          Page {page} / {Math.max(totalPages, 1)}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={nextDisabled}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-white px-2 text-text-muted transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Page suivante"
        >
          <span className="sm:hidden lg:inline">Suivant</span>
          <ChevronRight size={15} />
        </button>
      </nav>
    </div>
  );
}
