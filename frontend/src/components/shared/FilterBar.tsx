'use client';

import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  filters: FilterOption[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}

export function FilterBar({ filters, active, onChange, className }: FilterBarProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>
      {filters.map((f) => {
        const isActive = f.value === active;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            className={cn(
              'inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'border-primary bg-primary text-white hover:bg-primary-dark'
                : 'border-border bg-white text-text-secondary hover:border-border-strong hover:bg-muted hover:text-text-primary',
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
