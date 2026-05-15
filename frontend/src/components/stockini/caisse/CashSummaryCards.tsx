'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarDays,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CashSummary {
  soldeGlobal:   number;
  entrees:       number;
  sorties:       number;
  profitPeriode: number;
  profitSemaine: number;
  profitMois:    number;
  profitAnnee:   number;
  period:        string;
}

interface KpiCardProps {
  label:    string;
  value:    number;
  icon:     React.ElementType;
  color:    string;
  bg:       string;
  positive?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n) + ' DT';
}

function KpiCard({ label, value, icon: Icon, color, bg, positive }: KpiCardProps) {
  const isPos = value >= 0;
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 shadow-sm', 'flex items-start gap-3')}>
      <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg', bg)}>
        <Icon size={18} className={color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-text-secondary">{label}</p>
        <p
          className={cn(
            'mt-0.5 text-[15px] font-bold leading-tight',
            positive !== undefined
              ? isPos ? 'text-emerald-600' : 'text-red-500'
              : 'text-text-primary',
          )}
        >
          {positive !== undefined && !isPos ? '−' : ''}
          {fmt(Math.abs(value))}
        </p>
      </div>
    </div>
  );
}

interface Props {
  summary:   CashSummary | undefined;
  isLoading: boolean;
}

const PERIOD_LABELS: Record<string, string> = {
  today:     "Aujourd'hui",
  yesterday: 'Hier',
  week:      'Cette semaine',
  month:     'Ce mois',
  year:      'Cette année',
};

export function CashSummaryCards({ summary, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-[84px] animate-pulse rounded-xl bg-border/40" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const periodLabel = PERIOD_LABELS[summary.period] ?? summary.period;

  const cards: KpiCardProps[] = [
    {
      label: 'Solde global',
      value: summary.soldeGlobal,
      icon:  Wallet,
      color: 'text-orange-500',
      bg:    'bg-orange-50',
    },
    {
      label: `Entrées — ${periodLabel}`,
      value: summary.entrees,
      icon:  ArrowUpCircle,
      color: 'text-emerald-600',
      bg:    'bg-emerald-50',
    },
    {
      label: `Sorties — ${periodLabel}`,
      value: summary.sorties,
      icon:  ArrowDownCircle,
      color: 'text-red-500',
      bg:    'bg-red-50',
    },
    {
      label: `Profit — ${periodLabel}`,
      value: summary.profitPeriode,
      icon:  summary.profitPeriode >= 0 ? TrendingUp : TrendingDown,
      color: summary.profitPeriode >= 0 ? 'text-emerald-600' : 'text-red-500',
      bg:    summary.profitPeriode >= 0 ? 'bg-emerald-50' : 'bg-red-50',
      positive: true,
    },
    {
      label: 'Profit semaine',
      value: summary.profitSemaine,
      icon:  CalendarDays,
      color: summary.profitSemaine >= 0 ? 'text-sky-600' : 'text-red-500',
      bg:    'bg-sky-50',
      positive: true,
    },
    {
      label: 'Profit mois',
      value: summary.profitMois,
      icon:  CalendarDays,
      color: summary.profitMois >= 0 ? 'text-violet-600' : 'text-red-500',
      bg:    'bg-violet-50',
      positive: true,
    },
    {
      label: 'Profit année',
      value: summary.profitAnnee,
      icon:  TrendingUp,
      color: summary.profitAnnee >= 0 ? 'text-amber-600' : 'text-red-500',
      bg:    'bg-amber-50',
      positive: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}
