'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Banknote,
  Building2,
  Globe,
  List,
  Plus,
  Minus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cleanPaginationParams } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import { CashSummaryCards, type CashSummary, type AccountView } from './CashSummaryCards';
import { CashFilters, type CashFilterState } from './CashFilters';
import { CashTransactionsTable, type CashTransaction, type CashPagination } from './CashTransactionsTable';
import { CashAnalyticsCharts, type CashAnalytics } from './CashAnalyticsCharts';
import { CashResetModal } from './CashResetModal';
import { CashManualOpModal } from './CashManualOpModal';
import { ClearHistoryModal } from '../shared/ClearHistoryModal';

type ContentTab = 'transactions' | 'analytics';
type AccountTab = 'global' | 'cash' | 'bank';

const ACCOUNT_TABS: { id: AccountTab; label: string; icon: React.ElementType; account?: string }[] = [
  { id: 'cash',   label: 'Caisse physique',        icon: Banknote,   account: 'PHYSICAL_CASH' },
  { id: 'bank',   label: 'Banque / Chèques',        icon: Building2,  account: 'BANK_TREASURY' },
  { id: 'global', label: 'Vue globale',             icon: Globe,      account: undefined },
];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export function CashDashboard() {
  const queryClient = useQueryClient();
  const [accountTab, setAccountTab] = useState<AccountTab>('cash');
  const [contentTab, setContentTab] = useState<ContentTab>('transactions');
  const [filters, setFilters] = useState<CashFilterState>({
    period:    'today',
    startDate: todayStr(),
    endDate:   todayStr(),
  });
  const [page, setPage] = useState(1);
  const [showReset, setShowReset] = useState(false);
  const [showDepot, setShowDepot] = useState(false);
  const [showRetrait, setShowRetrait] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const { can } = usePermissions();
  const canClearHistory = can('finance.history.clear');
  const canOperate = can('caisse.operate');

  const currentAccountMeta = ACCOUNT_TABS.find((t) => t.id === accountTab)!;
  const accountParam = currentAccountMeta.account;

  const clearCaisseMutation = useMutation({
    mutationFn: () => stockiniApi.clearCaisseHistory(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['caisse-transactions'] });
      setShowClearModal(false);
      toast.success(`Historique caisse vidé (${res.count} entrées masquées)`);
    },
    onError: () => toast.error('Erreur lors du vidage de l\'historique caisse'),
  });

  // Build period params (+ optional account filter for transactions/analytics)
  function buildParams(withAccount: boolean): Record<string, string> {
    const base: Record<string, string> =
      filters.period === 'custom' && filters.startDate && filters.endDate
        ? { startDate: filters.startDate, endDate: filters.endDate }
        : { period: filters.period };
    if (withAccount && accountParam) base.account = accountParam;
    return base;
  }

  // Summary always global (returns both breakdowns)
  const summaryParams = buildParams(false);
  const summaryQuery = useQuery<CashSummary>({
    queryKey: ['caisse-summary', summaryParams],
    queryFn:  () => api.get('/caisse/summary', { params: summaryParams }).then((r) => r.data),
    staleTime: 30_000,
  });

  const txParams = buildParams(true);
  const txQuery = useQuery<{ data: CashTransaction[]; pagination: CashPagination }>({
    queryKey: ['caisse-transactions', txParams, page],
    queryFn:  () =>
      api.get('/caisse/transactions', { params: cleanPaginationParams({ ...txParams, page, limit: 50 }) }).then((r) => r.data),
    staleTime: 30_000,
  });

  const analyticsParams = buildParams(true);
  const analyticsQuery = useQuery<CashAnalytics>({
    queryKey: ['caisse-analytics', analyticsParams],
    queryFn:  () =>
      api.get('/caisse/analytics', { params: analyticsParams }).then((r) => r.data),
    staleTime: 60_000,
    enabled: contentTab === 'analytics',
  });

  function handleFilterChange(f: CashFilterState) {
    setFilters(f);
    setPage(1);
  }

  function handleRefresh() {
    summaryQuery.refetch();
    txQuery.refetch();
    if (contentTab === 'analytics') analyticsQuery.refetch();
  }

  function handleAccountTabChange(id: AccountTab) {
    setAccountTab(id);
    setPage(1);
  }

  const viewMap: Record<AccountTab, AccountView> = { cash: 'cash', bank: 'bank', global: 'global' };

  return (
    <div className="space-y-4">
      {/* Modals */}
      {showReset && (
        <CashResetModal
          defaultAccount={accountTab === 'bank' ? 'BANK_TREASURY' : 'PHYSICAL_CASH'}
          onClose={() => setShowReset(false)}
        />
      )}
      {showDepot && (
        <CashManualOpModal
          type="depot"
          defaultAccount={accountTab === 'bank' ? 'BANK_TREASURY' : 'PHYSICAL_CASH'}
          onClose={() => setShowDepot(false)}
        />
      )}
      {showRetrait && (
        <CashManualOpModal
          type="retrait"
          defaultAccount={accountTab === 'bank' ? 'BANK_TREASURY' : 'PHYSICAL_CASH'}
          onClose={() => setShowRetrait(false)}
        />
      )}

      <ClearHistoryModal
        open={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={() => clearCaisseMutation.mutate()}
        isPending={clearCaisseMutation.isPending}
        moduleName="Transactions caisse"
      />

      {/* Account sub-tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {ACCOUNT_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleAccountTabChange(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium transition-colors',
              accountTab === id
                ? 'bg-card text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CashFilters value={filters} onChange={handleFilterChange} />
        <div className="flex items-center gap-2">
          {canOperate && (
            <>
              <button
                type="button"
                onClick={() => setShowDepot(true)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-medium text-emerald-700',
                  'transition-colors hover:bg-emerald-100',
                )}
              >
                <Plus size={13} />
                Dépôt
              </button>
              <button
                type="button"
                onClick={() => setShowRetrait(true)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-[12px] font-medium text-red-600',
                  'transition-colors hover:bg-red-100',
                )}
              >
                <Minus size={13} />
                Retrait
              </button>
            </>
          )}
          {can('cash.reset_balance') && (
            <button
              type="button"
              onClick={() => setShowReset(true)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-[12px] font-medium text-red-600',
                'transition-colors hover:bg-red-100 hover:border-red-300',
              )}
            >
              <RotateCcw size={13} />
              Remise à zéro
            </button>
          )}
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
      </div>

      {/* KPI Cards (filtered by account tab) */}
      <CashSummaryCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        view={viewMap[accountTab]}
      />

      {/* Content tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: 'transactions' as ContentTab, label: 'Transactions', icon: List },
          { id: 'analytics'    as ContentTab, label: 'Analytiques',  icon: BarChart3 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setContentTab(id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 pb-2.5 pt-2 text-[12px] font-medium transition-colors',
              contentTab === id
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
      {contentTab === 'transactions' && (
        <>
          {canClearHistory && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600',
                  'transition-colors hover:bg-red-100 hover:border-red-300',
                )}
              >
                <Trash2 size={13} />
                Vider l&apos;historique
              </button>
            </div>
          )}
          <CashTransactionsTable
            data={txQuery.data?.data ?? []}
            pagination={txQuery.data?.pagination}
            isLoading={txQuery.isLoading}
            onPageChange={setPage}
            showAccount={accountTab === 'global'}
          />
        </>
      )}

      {contentTab === 'analytics' && (
        <CashAnalyticsCharts analytics={analyticsQuery.data} isLoading={analyticsQuery.isLoading} />
      )}
    </div>
  );
}
