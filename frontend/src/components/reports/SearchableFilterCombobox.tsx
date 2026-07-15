'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SearchableFilterComboboxProps<T> = {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  value?: string;
  options: T[];
  isLoading?: boolean;
  disabled?: boolean;
  error?: boolean;
  minSearchLength?: number;
  getOptionValue: (item: T) => string;
  getOptionLabel: (item: T) => string;
  getOptionSecondaryLabel?: (item: T) => string | undefined;
  onChange: (value?: string, item?: T) => void;
  onSearch?: (query: string) => void;
  onRetry?: () => void;
};

export function SearchableFilterCombobox<T>({
  label, placeholder, searchPlaceholder, value, options, isLoading, disabled, error,
  minSearchLength = 0, getOptionValue, getOptionLabel, getOptionSecondaryLabel,
  onChange, onSearch, onRetry,
}: SearchableFilterComboboxProps<T>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((item) => getOptionValue(item) === value);

  useEffect(() => { onSearch?.(query); }, [onSearch, query]);
  useEffect(() => { setActiveIndex(0); }, [options]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (item: T) => {
    onChange(getOptionValue(item), item);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label id={`${id}-label`} className="mb-1.5 block text-xs font-semibold text-text-secondary">{label}</label>
      <div className="relative">
        <button
          type="button" disabled={disabled} aria-labelledby={`${id}-label`} aria-haspopup="listbox"
          aria-expanded={open} onClick={() => { setOpen((current) => !current); setTimeout(() => inputRef.current?.focus(), 0); }}
          title={selected ? getOptionLabel(selected) : undefined}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 text-left text-sm outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-app-ring disabled:opacity-50"
        >
          <span className={cn('truncate', !selected && 'text-text-muted')}>{selected ? getOptionLabel(selected) : placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
        </button>
        {value && (
          <button type="button" aria-label={`Effacer ${label}`} onClick={(event) => { event.stopPropagation(); onChange(); }}
            className="absolute right-8 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:bg-muted focus-visible:ring-2 focus-visible:ring-app-ring">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[260px] overflow-hidden rounded-xl border border-border bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-text-muted" />
            <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder} aria-controls={`${id}-listbox`}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
                if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, options.length - 1)); }
                if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
                if (event.key === 'Enter' && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex]); }
              }}
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted" />
          </div>
          <div id={`${id}-listbox`} role="listbox" aria-labelledby={`${id}-label`} className="max-h-64 overflow-y-auto p-1.5">
            {query.trim().length < minSearchLength ? (
              <p className="px-3 py-6 text-center text-xs text-text-muted">Commencez à saisir au moins {minSearchLength} caractères</p>
            ) : isLoading ? (
              <p className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Recherche en cours…</p>
            ) : error ? (
              <div className="px-3 py-5 text-center text-xs text-red-600">Impossible de charger les résultats{onRetry && <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">Réessayer</button>}</div>
            ) : options.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-text-muted">Aucun résultat trouvé</p>
            ) : options.map((item, index) => {
              const optionValue = getOptionValue(item);
              const isSelected = optionValue === value;
              return (
                <button key={optionValue} type="button" role="option" aria-selected={isSelected} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-muted focus:bg-muted focus:outline-none', index === activeIndex && 'bg-muted/70')}>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary">{getOptionLabel(item)}</span>{getOptionSecondaryLabel?.(item) && <span className="block truncate text-xs text-text-muted">{getOptionSecondaryLabel(item)}</span>}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-app-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
