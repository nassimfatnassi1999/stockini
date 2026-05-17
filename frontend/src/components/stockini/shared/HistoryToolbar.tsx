'use client';

import { Search, X, RotateCcw } from 'lucide-react';

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
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-card px-4 py-2.5">
      {/* Search input */}
      <div className="relative min-w-[180px] flex-1">
        <Search
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-8 text-[13px] text-text-primary placeholder:text-text-muted transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-text-muted transition-colors hover:text-text-primary"
            aria-label="Effacer la recherche"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Inline filters */}
      {filters?.map((f) =>
        f.type === 'select' ? (
          <select
            key={f.key}
            value={filterValues[f.key] ?? ''}
            onChange={(e) => onFilterChange?.(f.key, e.target.value)}
            disabled={isFetching}
            style={f.width ? { minWidth: f.width } : undefined}
            className="app-select h-8 min-w-[140px] rounded-md border border-border bg-card px-2.5 text-[13px] text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-50"
          >
            {f.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={f.key}
            type="date"
            value={filterValues[f.key] ?? ''}
            onChange={(e) => onFilterChange?.(f.key, e.target.value)}
            placeholder={f.placeholder}
            disabled={isFetching}
            style={f.width ? { minWidth: f.width } : { minWidth: 130 }}
            className="h-8 rounded-md border border-border bg-card px-2.5 text-[13px] text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-50"
          />
        ),
      )}

      {/* Custom slot */}
      {children}

      {/* Right side: result count + reset */}
      <div className="ml-auto flex items-center gap-2">
        {resultsCount !== undefined && (
          <span className="whitespace-nowrap text-[12px] text-text-muted">
            {resultsCount} résultat{resultsCount !== 1 ? 's' : ''}
          </span>
        )}
        {hasActiveFilters && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[12px] text-text-muted transition-colors hover:border-red-300 hover:text-red-600"
          >
            <RotateCcw size={11} />
            Réinitialiser
          </button>
        )}
      </div>
    </div>
  );
}
