'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={15} />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Rechercher..."
        className="h-9 pl-9 text-sm"
      />
    </div>
  );
}
