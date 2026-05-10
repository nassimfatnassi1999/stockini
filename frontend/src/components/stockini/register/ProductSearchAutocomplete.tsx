'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Product } from '@/lib/stockini/types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (product: Product) => void;
  placeholder?: string;
  className?: string;
  containerRef?: RefObject<HTMLDivElement>;
}

interface DropdownRect {
  top: number;
  left: number;
  width: number;
}

const DROPDOWN_MAX_H = 320; // must match max-h style below
const DROPDOWN_OFFSET = 12;

function fmt(v: number | string | null | undefined): string | null {
  const n = Number(v);
  if (!n || n <= 0) return null;
  return n.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function ProductSearchAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  containerRef,
}: Props) {
  const [searchText, setSearchText] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropRect, setDropRect] = useState<DropdownRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const trimmed = searchText.trim();
  const showDropdown = trimmed.length >= 1;

  const { data: results = [], isFetching } = useQuery<Product[]>({
    queryKey: ['product-search', trimmed],
    queryFn: () =>
      api
        .get<Product[]>('/products', { params: { search: trimmed } })
        .then((r) => r.data),
    enabled: showDropdown,
    staleTime: 30_000,
    placeholderData: [],
  });

  const sorted = useMemo(() => {
    if (!results.length) return results;
    const lower = trimmed.toLowerCase();
    const startsWith = results.filter(
      (p) =>
        p.reference.toLowerCase().startsWith(lower) ||
        p.name.toLowerCase().startsWith(lower),
    );
    const rest = results.filter(
      (p) =>
        !p.reference.toLowerCase().startsWith(lower) &&
        !p.name.toLowerCase().startsWith(lower),
    );
    return [...startsWith, ...rest];
  }, [results, trimmed]);

  const closeDropdown = useCallback(() => {
    setSearchText('');
    setActiveIndex(-1);
    setDropRect(null);
  }, []);

  const updateRect = useCallback(() => {
    if (!inputRef.current) return;

    const register =
      inputRef.current.closest<HTMLElement>('[data-product-register]') ??
      containerRef?.current;

    if (!register) {
      setDropRect(null);
      return;
    }

    const rect = register.getBoundingClientRect();
    const panelHeight = Math.min(DROPDOWN_MAX_H, panelRef.current?.offsetHeight ?? DROPDOWN_MAX_H);
    const hasSpaceAbove = rect.top >= panelHeight + DROPDOWN_OFFSET;
    const top = hasSpaceAbove
      ? rect.top - panelHeight - DROPDOWN_OFFSET
      : rect.top + DROPDOWN_OFFSET;

    setDropRect({
      top: Math.max(8, top),
      left: rect.left + 16,
      width: Math.max(260, Math.min(rect.width - 32, 620)),
    });
  }, [containerRef]);

  useEffect(() => {
    if (!showDropdown) {
      setDropRect(null);
      return;
    }
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [showDropdown, updateRect]);

  useEffect(() => {
    if (!showDropdown) return;
    const frame = requestAnimationFrame(updateRect);
    return () => cancelAnimationFrame(frame);
  }, [isFetching, showDropdown, sorted.length, updateRect]);

  useEffect(() => {
    if (!showDropdown) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (inputRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closeDropdown();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [closeDropdown, showDropdown]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    setSearchText(v);
    setActiveIndex(-1);
  };

  const handleSelect = (product: Product) => {
    onSelect(product);
    closeDropdown();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      return;
    }
    if (sorted.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, sorted.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(sorted[activeIndex]);
    }
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />

      {showDropdown &&
        dropRect &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: dropRect.top,
              left: dropRect.left,
              width: dropRect.width,
              maxHeight: DROPDOWN_MAX_H,
              overflowY: 'auto',
              zIndex: 999999,
              background: 'white',
            }}
            className="rounded-xl border border-slate-300 shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
          >
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                Résultats produits
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Recherche par référence ou désignation
              </div>
            </div>

            {/* Scrollable results */}
            <div>
              {isFetching && (
                <div className="px-4 py-3 text-xs text-slate-400 italic">Recherche en cours…</div>
              )}
              {!isFetching && sorted.length === 0 && (
                <div className="px-4 py-3 text-xs text-slate-400">Aucun produit trouvé</div>
              )}
              {sorted.map((product, index) => {
                const paHt = fmt(product.purchasePrice);
                const pvTtc = fmt(product.salePrice);
                const isActive = index === activeIndex;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onMouseDown={() => handleSelect(product)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full text-left px-4 py-3 transition-colors border-b border-slate-100 last:border-b-0 ${
                      isActive
                        ? 'bg-primary/15 border-l-4 border-l-primary ring-1 ring-inset ring-primary/20'
                        : 'hover:bg-slate-100 hover:border-l-4 hover:border-l-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: ref + name */}
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-[13px] text-slate-900 leading-tight">
                          {product.reference}
                        </div>
                        <div className="text-[12px] text-slate-600 truncate mt-0.5">
                          {product.name}
                        </div>
                      </div>
                      {/* Right: prices + stock */}
                      <div className="text-right shrink-0 space-y-0.5">
                        {paHt && (
                          <div className="text-[10px] text-slate-400">
                            PA HT :{' '}
                            <span className="font-semibold text-slate-600">{paHt} DT</span>
                          </div>
                        )}
                        {pvTtc && (
                          <div className="text-[10px] text-slate-400">
                            PV TTC :{' '}
                            <span className="font-semibold text-slate-700">{pvTtc} DT</span>
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400">
                          Stock :{' '}
                          <span
                            className={
                              product.quantity <= 0
                                ? 'text-red-500 font-bold'
                                : 'text-emerald-600 font-bold'
                            }
                          >
                            {product.quantity}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
