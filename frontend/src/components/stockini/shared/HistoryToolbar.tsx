'use client';

import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
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
  const hasActiveFilters =
    search.trim().length > 0 ||
    Object.values(filterValues).some((v) => v !== '');

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-4 py-2.5">
      {/* Search */}
      <div className="relative min-w-[200px] flex-1">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className={cn(
            'h-9 w-full rounded-xl border pl-9 pr-8 text-[13px] text-slate-800',
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
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Effacer la recherche"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Filters */}
      {filters?.map((f) =>
        f.type === 'select' ? (
          <div key={f.key} className="relative">
            <SlidersHorizontal
              size={11}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={filterValues[f.key] ?? ''}
              onChange={(e) => onFilterChange?.(f.key, e.target.value)}
              disabled={isFetching}
              style={f.width ? { minWidth: f.width } : { minWidth: 160 }}
              className={cn(
                'h-9 appearance-none rounded-xl border bg-white pl-7 pr-6 text-[13px] font-medium text-slate-700',
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
            disabled={isFetching}
            style={f.width ? { minWidth: f.width } : { minWidth: 130 }}
            className={cn(
              'h-9 rounded-xl border bg-white px-3 text-[13px] text-slate-700',
              'transition-all duration-150',
              'border-slate-200 hover:border-slate-300',
              'focus:border-orange-400/60 focus:outline-none focus:ring-2 focus:ring-orange-400/25',
              'disabled:opacity-50',
            )}
          />
        ),
      )}

      {/* Custom slot */}
      {children}

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
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
              'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium',
              'border-slate-200 bg-white text-slate-500',
              'transition-all duration-150 hover:border-red-200 hover:bg-red-50 hover:text-red-600',
            )}
          >
            <RotateCcw size={10} />
            Réinitialiser
          </button>
        )}
      </div>
    </div>
  );
}
