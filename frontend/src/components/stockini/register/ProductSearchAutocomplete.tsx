'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { ProductPickerModal } from './ProductPickerModal';
import type { SearchMode } from './ProductPickerModal';
import type { Product } from '@/lib/stockini/types';

interface ProductPickerFieldProps {
  value: string;
  searchMode: SearchMode;
  onChange: (value: string) => void;
  onSelect: (product: Product) => void;
  placeholder?: string;
  className?: string;
}

export function ProductSearchAutocomplete({
  value,
  searchMode,
  onChange,
  onSelect,
  placeholder,
  className,
}: ProductPickerFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex w-full items-center">
      <input
        type="text"
        value={value}
        readOnly
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        placeholder={placeholder}
        className={`${className ?? ''} cursor-pointer rounded-r-none border-r-0`}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-r text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
        aria-label="Rechercher un produit"
      >
        <Search size={13} />
      </button>
      <ProductPickerModal
        open={open}
        searchMode={searchMode}
        initialSearch={value}
        onClose={() => setOpen(false)}
        onSelect={(product) => {
          onChange(searchMode === 'REFERENCE' ? product.reference : product.name);
          onSelect(product);
        }}
      />
    </div>
  );
}
