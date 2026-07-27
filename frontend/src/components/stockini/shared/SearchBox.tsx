'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function SearchBox({
  value,
  onChange,
  placeholder = 'Rechercher...',
  className,
  clearable = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  clearable?: boolean;
}) {
  return (
    <div className={cn('relative', className ?? 'w-full sm:max-w-xs')}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={15} />
      <Input
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn('pl-9 text-sm', clearable ? 'h-10 pr-9' : 'h-9')}
      />
      {clearable && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ring"
          aria-label="Effacer la recherche"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
