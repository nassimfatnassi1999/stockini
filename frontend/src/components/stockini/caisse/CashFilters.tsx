'use client';

import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CashPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

export interface CashFilterState {
  period:    CashPeriod;
  startDate: string;
  endDate:   string;
}

interface Props {
  value:    CashFilterState;
  onChange: (f: CashFilterState) => void;
}

const PERIODS: { value: CashPeriod; label: string }[] = [
  { value: 'today',     label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: 'week',      label: 'Semaine' },
  { value: 'month',     label: 'Mois' },
  { value: 'year',      label: 'Année' },
  { value: 'custom',    label: 'Personnalisé' },
];

export function CashFilters({ value, onChange }: Props) {
  function setPeriod(period: CashPeriod) {
    onChange({ ...value, period });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
              value.period === p.value
                ? 'bg-accent text-white shadow-sm'
                : 'bg-surface-alt text-text-secondary hover:bg-border hover:text-text-primary',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {value.period === 'custom' && (
        <div className="flex items-center gap-2">
          <Calendar size={13} className="text-text-secondary" />
          <input
            type="date"
            value={value.startDate}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
            className="app-select h-8 rounded-md border border-border bg-card px-2 text-[12px] text-text-primary"
          />
          <span className="text-[11px] text-text-secondary">→</span>
          <input
            type="date"
            value={value.endDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            className="app-select h-8 rounded-md border border-border bg-card px-2 text-[12px] text-text-primary"
          />
        </div>
      )}
    </div>
  );
}
