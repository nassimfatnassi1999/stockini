'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, List, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CashSummaryCards, type CashSummary } from './CashSummaryCards';
import { CashFilters, type CashFilterState, type CashPeriod } from './CashFilters';
import { CashTransactionsTable, type CashTransaction, type CashPagination } from './CashTransactionsTable';
import { CashAnalyticsCharts, type CashAnalytics } from './CashAnalyticsCharts';

type Tab = 'transactions' | 'analytics';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export function CashDashboard() {
  const [tab, setTab] = useState<Tab>('transactions');
  const [filters, setFilters] = useState<CashFilterState>({
    period:    'today',
    startDate: todayStr(),
    endDate:   todayStr(),
  });
  const [page, setPage] = useState(1);

  // Summary query
  const summaryParams = buildPeriodParams(filters);
  const summaryQuery  = useQuery<CashSummary>({
    queryKey: ['caisse-summary', summaryParams],
    queryFn:  () => api.get('/caisse/summary', { params: summaryParams }).then((r) => r.data),
    staleTime: 30_000,
  });

  // Transactions query
  const txParams = buildPeriodParams(filters);
  const txQuery  = useQuery<{ data: CashTransaction[]; pagination: CashPagination }>({
    queryKey: ['caisse-transactions', txParams, page],
    queryFn:  () =>
      api.get('/caisse/transactions', { params: { ...txParams, page, limit: 50 } }).then((r) => r.data),
    staleTime: 30_000,
  });

  // Analytics query — same params as summary/transactions
  const analyticsParams = buildPeriodParams(filters);
  const analyticsQuery = useQuery<CashAnalytics>({
    queryKey: ['caisse-analytics', analyticsParams],
    queryFn:  () =>
      api.get('/caisse/analytics', { params: analyticsParams }).then((r) => r.data),
    staleTime: 60_000,
    enabled: tab === 'analytics',
  });

  function handleFilterChange(f: CashFilterState) {
    setFilters(f);
    setPage(1);
  }

  function handleRefresh() {
    summaryQuery.refetch();
    txQuery.refetch();
    if (tab === 'analytics') analyticsQuery.refetch();
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CashFilters value={filters} onChange={handleFilterChange} />
        <button
          type="button"
          onClick={handleRefresh}
          disabled={summaryQuery.isFetching}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[12px] font-medium text-text-secondary',
            'transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-50',
          )}
        >
          <RefreshCw size={13} className={summaryQuery.isFetching ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* KPI Cards */}
      <CashSummaryCards summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />

      {/* Tab switch */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: 'transactions' as Tab, label: 'Transactions',  icon: List },
          { id: 'analytics'    as Tab, label: 'Analytiques',   icon: BarChart3 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 pb-2.5 pt-2 text-[12px] font-medium transition-colors',
              tab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'transactions' && (
        <CashTransactionsTable
          data={txQuery.data?.data ?? []}
          pagination={txQuery.data?.pagination}
          isLoading={txQuery.isLoading}
          onPageChange={setPage}
        />
      )}

      {tab === 'analytics' && (
        <CashAnalyticsCharts analytics={analyticsQuery.data} isLoading={analyticsQuery.isLoading} />
      )}
    </div>
  );
}

function buildPeriodParams(f: CashFilterState): Record<string, string> {
  if (f.period === 'custom' && f.startDate && f.endDate) {
    return { startDate: f.startDate, endDate: f.endDate };
  }
  return { period: f.period };
}
