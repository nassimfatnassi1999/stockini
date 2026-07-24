'use client';

import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface ToolbarFilter {
  key: string;
  type: 'select' | 'date';
  placeholder?: string;
  width?: number;
  options?: { value: string; label: string }[];
}

export interface HistoryToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  resultsCount?: number;
  onReset?: () => void;
  isFetching?: boolean;
  children?: React.ReactNode;
}

export function HistoryToolbar({
  search,
  onSearch,
  searchPlaceholder = 'Rechercher…',
  filters,
  filterValues = {},
  onFilterChange,
  resultsCount,
  onReset,
  isFetching,
  children,
}: HistoryToolbarProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const hasActiveFilters =
    search.trim().length > 0 ||
    Object.values(filterValues).some((v) => v !== '');
  const activeFilterCount = Object.values(filterValues).filter((v) => v !== '').length;

  return (
    <div className="border-b border-slate-100 bg-white px-3 py-2.5 sm:px-4 md:flex md:flex-wrap md:items-center md:gap-2">
      <div className="flex min-w-0 items-center gap-2 md:flex-1">
        {/* Search */}
        <div className="relative min-w-0 flex-1 sm:min-w-[200px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className={cn(
              'h-10 w-full rounded-xl border pl-9 pr-8 text-[13px] text-slate-800 sm:h-9',
              'placeholder:text-slate-400',
              'transition-all duration-150',
              'border-slate-200 bg-slate-50 hover:border-slate-300',
              'focus:border-orange-400/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/25',
            )}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch('')}
              className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Effacer la recherche"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {filters && filters.length > 0 && (
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((open) => !open)}
            aria-expanded={mobileFiltersOpen}
            aria-controls="responsive-filter-panel"
            className={cn(
              'relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold md:hidden',
              mobileFiltersOpen || activeFilterCount > 0
                ? 'border-orange-300 bg-orange-50 text-orange-700'
                : 'border-slate-200 bg-white text-slate-600',
            )}
          >
            <SlidersHorizontal size={14} />
            <span className="hidden min-[360px]:inline">Filtres</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>

      <div
        id="responsive-filter-panel"
        className={cn(
          'mt-2 flex-col gap-2 md:mt-0 md:flex md:flex-row md:flex-wrap md:items-center',
          mobileFiltersOpen ? 'flex' : 'hidden',
        )}
      >
        {/* Filters */}
        {filters?.map((f) =>
          f.type === 'select' ? (
            <div key={f.key} className="relative w-full md:w-auto">
              <SlidersHorizontal
                size={11}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <select
                value={filterValues[f.key] ?? ''}
                onChange={(e) => onFilterChange?.(f.key, e.target.value)}
                disabled={isFetching}
                style={f.width ? { minWidth: f.width } : undefined}
                aria-label={f.placeholder ?? `Filtre ${f.key}`}
                className={cn(
                  'h-10 w-full appearance-none rounded-xl border bg-white pl-7 pr-6 text-[13px] font-medium text-slate-700 md:h-9 md:w-auto md:min-w-[160px]',
                  'transition-all duration-150',
                  'border-slate-200 hover:border-slate-300',
                  'focus:border-orange-400/60 focus:outline-none focus:ring-2 focus:ring-orange-400/25',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  filterValues[f.key]
                    ? 'border-orange-300/70 bg-orange-50/60 text-slate-900'
                    : '',
                )}
              >
                {f.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={11}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          ) : (
            <input
              key={f.key}
              type="date"
              value={filterValues[f.key] ?? ''}
              onChange={(e) => onFilterChange?.(f.key, e.target.value)}
              placeholder={f.placeholder}
              aria-label={f.placeholder ?? `Filtre ${f.key}`}
              disabled={isFetching}
              style={f.width ? { minWidth: f.width } : undefined}
              className={cn(
                'h-10 w-full rounded-xl border bg-white px-3 text-[13px] text-slate-700 md:h-9 md:w-auto md:min-w-[130px]',
                'transition-all duration-150',
                'border-slate-200 hover:border-slate-300',
                'focus:border-orange-400/60 focus:outline-none focus:ring-2 focus:ring-orange-400/25',
                'disabled:opacity-50',
              )}
            />
          ),
        )}

        {children}

        <div className="flex w-full flex-wrap items-center justify-between gap-2 md:ml-auto md:w-auto md:justify-end">
          {resultsCount !== undefined && (
            <span className="whitespace-nowrap text-[12px] font-medium text-slate-400">
              {resultsCount.toLocaleString('fr-FR')} résultat{resultsCount !== 1 ? 's' : ''}
            </span>
          )}
          {hasActiveFilters && onReset && (
            <button
              type="button"
              onClick={onReset}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium md:h-8',
                'border-slate-200 bg-white text-slate-500',
                'transition-all duration-150 hover:border-red-200 hover:bg-red-50 hover:text-red-600',
              )}
            >
              <RotateCcw size={12} />
              Réinitialiser
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
