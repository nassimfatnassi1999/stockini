'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Building2,
  TrendingDown,
  TrendingUp,
  Wallet,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MetricInfoTooltip } from '../shared/MetricInfoTooltip';
import type { KpiDefinitionKey } from '@/lib/kpi-definitions';
import Decimal from 'decimal.js';
import { cashProfitTitle } from './cash-period';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountSummary {
  solde:         number;
  entrees:       number;
  sorties:       number;
  profit:        number;
}

export interface CashSummary {
  // Global (backward compat)
  soldeGlobal:      number;
  entrees:          number;
  sorties:          number;
  totalClientDebt:  number;
  retainedSurplus:  number;
  profitPeriode:    number;
  period:           string;
  label:            string;
  startDate:        string;
  endDate:          string;
  grossSalesHt:     string;
  creditsAndReturnsHt: string;
  netSalesHt:       string;
  historicalCost:   string;
  grossProfit:      string;
  expenses:         string;
  netProfit:        string;
  // Per-account detail
  soldeCaisse?:     number;
  soldeBanque?:     number;
  caisse?:          AccountSummary;
  banque?:          AccountSummary;
  cash?: {
    physicalBalance: number;
    cashInflows: number;
    cashOutflows: number;
  };
  sales?: SalesProfitMetrics;
}

interface SalesProfitMetrics {
  netRevenueHt: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMargin: number;
  expenses: number;
  netProfit: number;
  creditNoteImpact: number;
  saleCount: number;
}

export type AccountView = 'global' | 'cash' | 'bank';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | string) {
  return new Intl.NumberFormat('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(new Decimal(n).toNumber()) + ' DT';
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
  description?: string;
  metric?: KpiDefinitionKey;
  period?: string;
  details?: Array<{ label: string; value: string }>;
}

function KpiCard({ label, value, icon: Icon, color, bg, positive, description, metric, period = 'Période affichée', details }: KpiCardProps) {
  const isPos = value >= 0;
  const content = (triggerProps?: React.HTMLAttributes<HTMLDivElement> & { ref?: React.RefObject<HTMLDivElement> }, infoButton?: React.ReactNode) => (
    <div {...triggerProps} className={cn('rounded-xl border border-border bg-card p-3 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ring', 'flex min-h-[80px] items-start gap-3')}>
      <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', bg)}>
        <Icon size={16} className={color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <p className="text-[11px] font-medium text-text-secondary leading-tight break-words">{label}</p>
          {infoButton}
        </div>
        <p className={cn(
          'mt-0.5 text-[14px] font-bold leading-tight whitespace-nowrap',
          positive !== undefined
            ? isPos ? 'text-emerald-600' : 'text-red-500'
            : 'text-text-primary',
        )}>
          {positive !== undefined && !isPos ? '−' : ''}
          {fmt(Math.abs(value))}
        </p>
        {description && <p className="mt-1 text-[9px] leading-tight text-text-muted">{description}</p>}
      </div>
    </div>
  );
  if (!metric) return content();
  return <MetricInfoTooltip metric={metric} period={period} details={details}>{(triggerProps, infoButton) => content(triggerProps, infoButton)}</MetricInfoTooltip>;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  summary:    CashSummary | undefined;
  isLoading:  boolean;
  view:       AccountView;
  error?: unknown;
  onRetry?: () => void;
}

function buildProfitDetails(summary: CashSummary) {
  return [
    { label: 'Ventes brutes HT', value: fmt(summary.grossSalesHt) },
    { label: 'Avoirs et retours HT', value: fmt(summary.creditsAndReturnsHt) },
    { label: 'Ventes nettes HT', value: fmt(summary.netSalesHt) },
    { label: 'Coût historique', value: fmt(summary.historicalCost) },
    { label: 'Marge brute réelle', value: fmt(summary.grossProfit) },
    { label: 'Dépenses actives', value: fmt(summary.expenses) },
    { label: 'Bénéfice net réel', value: fmt(summary.netProfit) },
  ];
}

function buildGlobalCards(summary: CashSummary, periodLabel: string): KpiCardProps[] {
  const benefitDescription = 'Ventes nettes HT − coût historique − dépenses actives';
  const profitDetails = buildProfitDetails(summary);
  return [
    { label: 'Solde global', value: summary.soldeGlobal, icon: Wallet, color: 'text-orange-500', bg: 'bg-orange-50', metric: 'globalBalance', period: periodLabel },
    { label: 'Caisse physique', value: summary.soldeCaisse ?? 0, icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50', metric: 'physicalCash', period: periodLabel },
    { label: 'Banque / Virements', value: summary.soldeBanque ?? 0, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50', metric: 'bankBalance', period: periodLabel },
    { label: 'Dettes clients', value: summary.totalClientDebt ?? 0, icon: AlertCircle, color: (summary.totalClientDebt ?? 0) > 0 ? 'text-orange-600' : 'text-text-muted', bg: (summary.totalClientDebt ?? 0) > 0 ? 'bg-orange-50' : 'bg-slate-50', metric: 'currentCustomerDebt', period: periodLabel },
    { label: `Écarts encaissés — ${periodLabel}`, value: summary.retainedSurplus ?? 0, icon: Banknote, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50', metric: 'retainedSurplus', period: periodLabel },
    { label: `Entrées — ${periodLabel}`, value: summary.entrees, icon: ArrowUpCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', metric: 'cashInflows', period: periodLabel },
    { label: `Sorties — ${periodLabel}`, value: summary.sorties, icon: ArrowDownCircle, color: 'text-red-500', bg: 'bg-red-50', metric: 'cashOutflows', period: periodLabel },
    { label: cashProfitTitle(periodLabel), value: new Decimal(summary.netProfit).toNumber(), icon: new Decimal(summary.netProfit).gte(0) ? TrendingUp : TrendingDown, color: new Decimal(summary.netProfit).gte(0) ? 'text-emerald-600' : 'text-red-500', bg: new Decimal(summary.netProfit).gte(0) ? 'bg-emerald-50' : 'bg-red-50', positive: true, description: benefitDescription, metric: 'netProfit', period: periodLabel, details: profitDetails },
  ];
}

function buildAccountCards(acc: AccountSummary, solde: number, periodLabel: string, isCash: boolean, summary: CashSummary): KpiCardProps[] {
  const Icon = isCash ? Banknote : Building2;
  const soldeBg = isCash ? 'bg-amber-50' : 'bg-blue-50';
  const soldeColor = isCash ? 'text-amber-600' : 'text-blue-600';
  return [
    { label: isCash ? 'Solde caisse physique' : 'Solde banque / virements', value: solde, icon: Icon, color: soldeColor, bg: soldeBg, metric: isCash ? 'physicalCash' : 'bankBalance', period: periodLabel },
    { label: `Entrées — ${periodLabel}`, value: acc.entrees, icon: ArrowUpCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', metric: 'cashInflows', period: periodLabel },
    { label: `Sorties — ${periodLabel}`, value: acc.sorties, icon: ArrowDownCircle, color: 'text-red-500', bg: 'bg-red-50', metric: 'cashOutflows', period: periodLabel },
    { label: cashProfitTitle(periodLabel), value: acc.profit, icon: acc.profit >= 0 ? TrendingUp : TrendingDown, color: acc.profit >= 0 ? 'text-emerald-600' : 'text-red-500', bg: acc.profit >= 0 ? 'bg-emerald-50' : 'bg-red-50', positive: true, description: 'Ventes nettes HT − coût historique − dépenses actives', metric: 'netProfit', period: periodLabel, details: buildProfitDetails(summary) },
  ];
}

export function CashSummaryCards({ summary, isLoading, view, error, onRetry }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[80px] animate-pulse rounded-xl bg-border/40" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p>Impossible de charger les indicateurs financiers pour cette période.</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium">Réessayer</button>}
    </div>;
  }

  if (!summary) return null;

  const periodLabel = summary.label ?? PERIOD_LABELS[summary.period] ?? summary.period;

  let cards: KpiCardProps[];
  if (view === 'cash' && summary.caisse) {
    cards = buildAccountCards(summary.caisse, summary.soldeCaisse ?? 0, periodLabel, true, summary);
  } else if (view === 'bank' && summary.banque) {
    cards = buildAccountCards(summary.banque, summary.soldeBanque ?? 0, periodLabel, false, summary);
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
