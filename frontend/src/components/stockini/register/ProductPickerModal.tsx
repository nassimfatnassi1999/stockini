'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Product } from '@/lib/stockini/types';

export type SearchMode = 'REFERENCE' | 'DESIGNATION';

const MODE_CONFIG: Record<SearchMode, { title: string; subtitle: string; placeholder: string }> = {
  REFERENCE: {
    title: 'Recherche par référence',
    subtitle: 'Référence, SKU ou code-barres',
    placeholder: 'Rechercher par référence...',
  },
  DESIGNATION: {
    title: 'Recherche par désignation',
    subtitle: 'Libellé ou désignation produit',
    placeholder: 'Rechercher par désignation...',
  },
};

interface ProductPickerModalProps {
  open: boolean;
  searchMode: SearchMode;
  initialSearch?: string;
  onClose: () => void;
  onSelect: (product: Product) => void;
}

function fmt(v: number | string | null | undefined): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function productMatchesMode(product: Product, search: string, mode: SearchMode): boolean {
  if (mode === 'REFERENCE') {
    const ref = normalize(product.reference);
    const sku = normalize(product.sku);
    const barcode = normalize(product.barcode);
    return ref.includes(search) || sku.includes(search) || (!!product.barcode && barcode.includes(search));
  }
  return normalize(product.name).includes(search);
}

function sortProductsByMode(products: Product[], search: string, mode: SearchMode): Product[] {
  if (!search) return products;

  return [...products]
    .filter((p) => productMatchesMode(p, search, mode))
    .sort((a, b) => {
      const aVal = normalize(mode === 'REFERENCE' ? a.reference : a.name);
      const bVal = normalize(mode === 'REFERENCE' ? b.reference : b.name);
      const aStarts = aVal.startsWith(search);
      const bStarts = bVal.startsWith(search);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return aVal.localeCompare(bVal, 'fr');
    });
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ProductPickerModal({
  open,
  searchMode,
  initialSearch = '',
  onClose,
  onSelect,
}: ProductPickerModalProps) {
  const [searchText, setSearchText] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(searchText, 250);
  const trimmed = debouncedSearch.trim();
  const normalizedSearch = normalize(trimmed);
  const canSearch = normalizedSearch.length >= 1;

  useEffect(() => {
    if (!open) return;
    setSearchText(initialSearch.trim());
    setActiveIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [initialSearch, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const { data: results = [], isFetching } = useQuery<Product[]>({
    queryKey: ['product-picker-search', trimmed, searchMode],
    queryFn: () =>
      api
        .get<Product[]>('/products', { params: { search: trimmed, searchMode } })
        .then((response) => response.data),
    enabled: open && canSearch,
    staleTime: 30_000,
    placeholderData: [],
  });

  const sorted = useMemo(
    () => sortProductsByMode(results, normalizedSearch, searchMode),
    [normalizedSearch, results, searchMode],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedSearch]);

  useEffect(() => {
    console.log('[PRODUCT_SEARCH]', {
      mode: searchMode,
      query: trimmed,
      resultsCount: sorted.length,
    });
  }, [searchMode, trimmed, sorted.length]);

  const selectProduct = useCallback(
    (product: Product) => {
      onSelect(product);
      onClose();
    },
    [onClose, onSelect],
  );

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(sorted.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Enter' && sorted[activeIndex]) {
      event.preventDefault();
      selectProduct(sorted[activeIndex]);
    }
  };

  if (!open) return null;

  const config = MODE_CONFIG[searchMode];

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={config.title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[700px] md:w-[700px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">{config.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{config.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-slate-200 p-4">
          <div className="relative">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={config.placeholder}
              className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <div className="max-h-[430px] overflow-y-auto">
          {!canSearch && (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              Saisir au moins 1 caractère pour rechercher.
            </div>
          )}

          {canSearch && isFetching && (
            <div className="px-5 py-6 text-sm text-slate-500">Recherche en cours...</div>
          )}

          {canSearch && !isFetching && sorted.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-slate-500">Aucun produit trouvé</div>
          )}

          {canSearch &&
            sorted.map((product, index) => {
              const isActive = index === activeIndex;
              const brand = product.brand?.name ?? product.category?.name ?? '—';

              return (
                <button
                  key={product.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectProduct(product)}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-slate-100 px-5 py-4 text-left transition-colors last:border-b-0 ${
                    isActive ? 'bg-primary/10' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-bold text-slate-950">
                      {product.reference}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{product.name}</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Marque : {brand}</span>
                      <span>Emplacement : {product.location || '—'}</span>
                    </div>
                  </div>

                  <div className="min-w-[150px] text-right text-xs text-slate-500">
                    <div>
                      Stock :{' '}
                      <span
                        className={
                          product.quantity <= 0
                            ? 'font-semibold text-red-600'
                            : 'font-semibold text-emerald-600'
                        }
                      >
                        {product.quantity}
                      </span>
                    </div>
                    <div className="mt-1">
                      Achat HT : <span className="font-semibold text-slate-700">{fmt(product.purchasePrice)} DT</span>
                    </div>
                    <div className="mt-1">
                      Vente HT : <span className="font-semibold text-slate-700">{fmt(product.salePrice)} DT</span>
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
