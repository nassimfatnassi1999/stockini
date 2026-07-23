'use client';

import { ArrowDownCircle, ArrowUpCircle, Banknote, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CashTransaction {
  id:             string;
  date:           string;
  type:           string;
  account:        'PHYSICAL_CASH' | 'BANK_TREASURY';
  direction:      'IN' | 'OUT';
  reference:      string | null;
  montant:        number;
  ancienSolde:    number;
  nouveauSolde:   number;
  motif:          string | null;
  user:           { id: string; fullName: string; email: string } | null;
}

export interface CashPagination {
  page:       number;
  limit:      number;
  total:      number;
  totalPages: number;
}

interface Props {
  data:         CashTransaction[];
  pagination:   CashPagination | undefined;
  isLoading:    boolean;
  onPageChange: (page: number) => void;
  showAccount?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  ENCAISSEMENT_VENTE:  'Vente',
  CUSTOMER_CHANGE_OUT: 'Monnaie client',
  CASH_SURPLUS_IN:      'Écart encaissé',
  DECAISSEMENT_ACHAT:  'Achat',
  DEPOT_MANUEL:        'Dépôt manuel',
  RETRAIT_MANUEL:      'Retrait manuel',
  ANNULATION_VENTE:    'Annulation vente',
  REFUND_OUT:          'Remboursement avoir',
  ANNULATION_ACHAT:    'Annulation achat',
  CASH_RESET:          'Remise à zéro',
};

const ACCOUNT_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  PHYSICAL_CASH: { label: 'Caisse',  icon: Banknote,   color: 'text-amber-700',  bg: 'bg-amber-50' },
  BANK_TREASURY: { label: 'Banque',  icon: Building2,  color: 'text-blue-700',   bg: 'bg-blue-50'  },
};

function fmt(n: number) {
  return new Intl.NumberFormat('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function CashTransactionsTable({ data, pagination, isLoading, onPageChange, showAccount = true }: Props) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="animate-pulse p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mb-3 h-9 rounded-lg bg-border/40" />
          ))}
        </div>
      </div>
    );
  }

  const colSpan = showAccount ? 10 : 9;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-[12px]">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Type</th>
              {showAccount && (
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Compte</th>
              )}
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Sens</th>
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Référence</th>
              <th className="px-4 py-3 text-right font-semibold text-text-secondary">Montant</th>
              <th className="px-4 py-3 text-right font-semibold text-text-secondary">Solde avant</th>
              <th className="px-4 py-3 text-right font-semibold text-text-secondary">Solde après</th>
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Utilisateur</th>
              <th className="px-4 py-3 text-left font-semibold text-text-secondary">Note</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-12 text-center text-text-secondary">
                  Aucune transaction pour cette période
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const acc = ACCOUNT_META[row.account] ?? ACCOUNT_META.PHYSICAL_CASH;
                const AccIcon = acc.icon;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/50 transition-colors hover:bg-surface/60"
                  >
                    <td className="px-4 py-2.5 text-text-secondary">{formatDate(row.date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-text-primary">
                        {TYPE_LABELS[row.type] ?? row.type}
                      </span>
                    </td>
                    {showAccount && (
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
                          acc.bg, acc.color,
                        )}>
                          <AccIcon size={11} />
                          {acc.label}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      {row.direction === 'IN' ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <ArrowUpCircle size={13} />
                          <span className="font-medium">Entrée</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-500">
                          <ArrowDownCircle size={13} />
                          <span className="font-medium">Sortie</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-text-secondary">
                      {row.reference ?? '—'}
                    </td>
                    <td className={cn(
                      'px-4 py-2.5 text-right font-semibold tabular-nums',
                      row.direction === 'IN' ? 'text-emerald-600' : 'text-red-500',
                    )}>
                      {row.direction === 'IN' ? '+' : '−'}{fmt(row.montant)} DT
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                      {fmt(row.ancienSolde)} DT
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">
                      {fmt(row.nouveauSolde)} DT
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {row.user?.fullName ?? row.user?.email ?? '—'}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2.5 text-text-secondary">
                      {row.motif ?? '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-[11px] text-text-secondary">
            {pagination.total} transaction{pagination.total !== 1 ? 's' : ''} — page {pagination.page}/{pagination.totalPages}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface disabled:opacity-40"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface disabled:opacity-40"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
