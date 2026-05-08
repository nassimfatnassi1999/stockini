'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Product } from '@/lib/stockini/types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (product: Product) => void;
  placeholder?: string;
  className?: string;
}

export function ProductSearchAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
}: Props) {
  const [searchText, setSearchText] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = searchText.trim();
  const showDropdown = trimmed.length >= 2;

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    setSearchText(v);
    setActiveIndex(-1);
  };

  const handleSelect = (product: Product) => {
    onSelect(product);
    setSearchText('');
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setSearchText('');
    }
  };

  const handleBlur = () => {
    setTimeout(() => setSearchText(''), 200);
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
      />
      {showDropdown && (
        <div className="absolute z-50 left-0 top-full mt-0.5 w-64 rounded-md border border-border bg-white shadow-lg max-h-52 overflow-y-auto">
          {isFetching && (
            <div className="px-3 py-2 text-xs text-text-muted">Recherche…</div>
          )}
          {!isFetching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">Aucun produit trouvé</div>
          )}
          {results.map((product, index) => (
            <button
              key={product.id}
              type="button"
              onMouseDown={() => handleSelect(product)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-muted ${
                index === activeIndex ? 'bg-muted' : ''
              }`}
            >
              <div className="font-mono font-semibold text-text-primary">{product.reference}</div>
              <div className="text-text-secondary truncate">{product.name}</div>
              <div className="text-text-muted">
                Stock :{' '}
                <span className={product.quantity <= 0 ? 'text-red-500' : 'text-emerald-600'}>
                  {product.quantity}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
