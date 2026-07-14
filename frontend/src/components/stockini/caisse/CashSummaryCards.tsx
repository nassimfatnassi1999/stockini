'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Building2,
  CalendarDays,
  TrendingDown,
  TrendingUp,
  Wallet,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountSummary {
  solde:         number;
  entrees:       number;
  sorties:       number;
  profit:        number;
  profitSemaine: number;
  profitMois:    number;
  profitAnnee:   number;
}

export interface CashSummary {
  // Global (backward compat)
  soldeGlobal:      number;
  entrees:          number;
  sorties:          number;
  totalClientDebt:  number;
  profitPeriode:    number;
  profitSemaine:    number;
  profitMois:       number;
  profitAnnee:      number;
  period:           string;
  // Per-account detail
  soldeCaisse?:     number;
  soldeBanque?:     number;
  caisse?:          AccountSummary;
  banque?:          AccountSummary;
}

export type AccountView = 'global' | 'cash' | 'bank';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n) + ' DT';
}

const PERIOD_LABELS: Record<string, string> = {
  today:     "Aujourd'hui",
  yesterday: 'Hier',
  week:      'Cette semaine',
  month:     'Ce mois',
  year:      'Cette année',
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:     string;
  value:     number;
  icon:      React.ElementType;
  color:     string;
  bg:        string;
  positive?: boolean;
}

function KpiCard({ label, value, icon: Icon, color, bg, positive }: KpiCardProps) {
  const isPos = value >= 0;
  return (
    <div className={cn('rounded-xl border border-border bg-card p-3 shadow-sm', 'flex items-start gap-3 min-h-[80px]')}>
      <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', bg)}>
        <Icon size={16} className={color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-text-secondary leading-tight break-words">{label}</p>
        <p className={cn(
          'mt-0.5 text-[14px] font-bold leading-tight whitespace-nowrap',
          positive !== undefined
            ? isPos ? 'text-emerald-600' : 'text-red-500'
            : 'text-text-primary',
        )}>
          {positive !== undefined && !isPos ? '−' : ''}
          {fmt(Math.abs(value))}
        </p>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  summary:    CashSummary | undefined;
  isLoading:  boolean;
  view:       AccountView;
}

function buildGlobalCards(summary: CashSummary, periodLabel: string): KpiCardProps[] {
  return [
    { label: 'Solde global', value: summary.soldeGlobal, icon: Wallet, color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Caisse physique', value: summary.soldeCaisse ?? 0, icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Banque / Virements', value: summary.soldeBanque ?? 0, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Dettes clients', value: summary.totalClientDebt ?? 0, icon: AlertCircle, color: (summary.totalClientDebt ?? 0) > 0 ? 'text-orange-600' : 'text-text-muted', bg: (summary.totalClientDebt ?? 0) > 0 ? 'bg-orange-50' : 'bg-slate-50' },
    { label: `Entrées — ${periodLabel}`, value: summary.entrees, icon: ArrowUpCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: `Sorties — ${periodLabel}`, value: summary.sorties, icon: ArrowDownCircle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: `Flux net — ${periodLabel}`, value: summary.profitPeriode, icon: summary.profitPeriode >= 0 ? TrendingUp : TrendingDown, color: summary.profitPeriode >= 0 ? 'text-emerald-600' : 'text-red-500', bg: summary.profitPeriode >= 0 ? 'bg-emerald-50' : 'bg-red-50', positive: true },
    { label: 'Flux net du mois', value: summary.profitMois, icon: CalendarDays, color: summary.profitMois >= 0 ? 'text-violet-600' : 'text-red-500', bg: 'bg-violet-50', positive: true },
  ];
}

function buildAccountCards(acc: AccountSummary, solde: number, periodLabel: string, isCash: boolean): KpiCardProps[] {
  const Icon = isCash ? Banknote : Building2;
  const soldeBg = isCash ? 'bg-amber-50' : 'bg-blue-50';
  const soldeColor = isCash ? 'text-amber-600' : 'text-blue-600';
  return [
    { label: isCash ? 'Solde caisse physique' : 'Solde banque / virements', value: solde, icon: Icon, color: soldeColor, bg: soldeBg },
    { label: `Entrées — ${periodLabel}`, value: acc.entrees, icon: ArrowUpCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: `Sorties — ${periodLabel}`, value: acc.sorties, icon: ArrowDownCircle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: `Flux net — ${periodLabel}`, value: acc.profit, icon: acc.profit >= 0 ? TrendingUp : TrendingDown, color: acc.profit >= 0 ? 'text-emerald-600' : 'text-red-500', bg: acc.profit >= 0 ? 'bg-emerald-50' : 'bg-red-50', positive: true },
    { label: 'Flux net semaine', value: acc.profitSemaine, icon: CalendarDays, color: acc.profitSemaine >= 0 ? 'text-sky-600' : 'text-red-500', bg: 'bg-sky-50', positive: true },
    { label: 'Flux net mois', value: acc.profitMois, icon: CalendarDays, color: acc.profitMois >= 0 ? 'text-violet-600' : 'text-red-500', bg: 'bg-violet-50', positive: true },
    { label: 'Flux net année', value: acc.profitAnnee, icon: TrendingUp, color: acc.profitAnnee >= 0 ? 'text-amber-600' : 'text-red-500', bg: 'bg-amber-50', positive: true },
  ];
}

export function CashSummaryCards({ summary, isLoading, view }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[80px] animate-pulse rounded-xl bg-border/40" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const periodLabel = PERIOD_LABELS[summary.period] ?? summary.period;

  let cards: KpiCardProps[];
  if (view === 'cash' && summary.caisse) {
    cards = buildAccountCards(summary.caisse, summary.soldeCaisse ?? 0, periodLabel, true);
  } else if (view === 'bank' && summary.banque) {
    cards = buildAccountCards(summary.banque, summary.soldeBanque ?? 0, periodLabel, false);
  } else {
    cards = buildGlobalCards(summary, periodLabel);
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}
