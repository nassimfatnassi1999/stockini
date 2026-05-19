'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { SaleDetailsModal } from '@/components/stockini/SaleDetailsModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef, type FilterConfig } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, money } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { Payment, PaymentsQueryParams, Sale } from '@/lib/stockini/types';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PageHeader } from '../shared/PageHeader';
import { useDropdownOptions } from '../shared/form-utils';

// ─── Sub-components ────────────────────────────────────────────────────────────

function PaymentStatusBadge({ status }: { status: string | null }) {
  if (status === 'PAID')    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Payé</Badge>;
  if (status === 'PARTIAL') return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Partiel</Badge>;
  if (!status)              return <Badge className="border-gray-200 bg-gray-100 text-gray-500">—</Badge>;
  return <Badge className="border-red-200 bg-red-50 text-red-700">Non payé</Badge>;
}

function PaymentMethodLabel({ method }: { method: string }) {
  const labels: Record<string, string> = {
    CASH: 'Espèces', CARD: 'Carte', BANK_TRANSFER: 'Virement', CHECK: 'Chèque', CREDIT: 'Crédit',
  };
  return <>{labels[method] ?? method}</>;
}

// ─── Invoices tab columns ──────────────────────────────────────────────────────

function invoicesColumns(
  canReceivePayment: boolean,
  onViewSale: (id: string) => void,
  onPaySale: (sale: Sale) => void,
): ColumnDef<Sale>[] {
  const cols: ColumnDef<Sale>[] = [
    {
      key: 'invoiceNumber',
      label: 'N° Document',
      sortable: true,
      render: (row) => (
        <button
          type="button"
          className="font-mono font-semibold text-primary underline-offset-2 hover:underline"
          onClick={() => onViewSale(row.id)}
        >
          {row.invoiceNumber}
        </button>
      ),
    },
    {
      key: 'customer',
      label: 'Client',
      render: (row) => <>{row.customer?.name ?? '-'}</>,
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (row) => <span className="text-text-secondary">{dateTime(row.createdAt)}</span>,
    },
    {
      key: 'total',
      label: 'Total TTC',
      sortable: true,
      className: 'text-right',
      render: (row) => <span className="font-mono">{money(row.total)}</span>,
    },
    {
      key: 'paidAmount',
      label: 'Déjà payé',
      sortable: true,
      className: 'text-right',
      render: (row) => <span className="font-mono text-emerald-600">{money(row.paidAmount)}</span>,
    },
    {
      key: 'remainingAmount',
      label: 'Reste à payer',
      sortable: true,
      className: 'text-right',
      render: (row) => <span className="font-mono font-semibold text-red-600">{money(row.remainingAmount)}</span>,
    },
    {
      key: 'paymentStatus',
      label: 'Statut',
      render: (row) => <PaymentStatusBadge status={row.paymentStatus} />,
    },
  ];
  if (canReceivePayment) {
    cols.push({
      key: '_actions',
      label: 'Action',
      className: 'text-right',
      render: (row) => (
        <Button
          type="button"
          size="sm"
          onClick={() => onPaySale(row)}
        >
          Payer
        </Button>
      ),
    });
  }
  return cols;
}

const INVOICES_FILTERS: FilterConfig[] = [
  {
    key: 'paymentStatus',
    label: 'Statut paiement',
    type: 'select',
    options: [
      { value: '', label: 'Tous' },
      { value: 'UNPAID', label: 'Non payé' },
      { value: 'PARTIAL', label: 'Partiellement payé' },
      { value: 'PAID', label: 'Payé' },
    ],
  },
  { key: 'dateFrom', label: 'Date début', type: 'date' },
  { key: 'dateTo',   label: 'Date fin',   type: 'date' },
];

// ─── Payments history columns ──────────────────────────────────────────────────

function historyColumns(onViewSale: (id: string) => void): ColumnDef<Payment>[] {
  return [
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (row) => <span className="text-text-secondary">{dateTime(row.createdAt)}</span>,
    },
    {
      key: 'reference',
      label: 'Référence',
      render: (row) => <span className="font-mono font-semibold">{row.reference}</span>,
    },
    {
      key: 'sale',
      label: 'Facture',
      render: (row) =>
        row.sale?.id ? (
          <button
            type="button"
            className="font-mono text-primary underline-offset-2 hover:underline"
            onClick={() => onViewSale(row.sale!.id)}
          >
            {(row.sale as Sale & { invoiceNumber?: string }).invoiceNumber}
          </button>
        ) : (
          '-'
        ),
    },
    {
      key: 'customer',
      label: 'Client',
      render: (row) => <>{row.customer?.name ?? (row.sale as Sale | null)?.customer?.name ?? '-'}</>,
    },
    {
      key: 'amount',
      label: 'Montant',
      sortable: true,
      className: 'text-right',
      render: (row) => <span className="font-mono font-semibold text-emerald-600">{money(row.amount)}</span>,
    },
    {
      key: 'method',
      label: 'Mode',
      render: (row) => <PaymentMethodLabel method={row.method} />,
    },
    {
      key: 'note',
      label: 'Note',
      render: (row) => <span className="text-text-secondary">{row.note ?? '-'}</span>,
    },
  ];
}

const HISTORY_FILTERS: FilterConfig[] = [
  {
    key: 'method',
    label: 'Mode paiement',
    type: 'select',
    options: [
      { value: '', label: 'Tous' },
      { value: 'CASH', label: 'Espèces' },
      { value: 'CARD', label: 'Carte' },
      { value: 'BANK_TRANSFER', label: 'Virement' },
      { value: 'CHECK', label: 'Chèque' },
      { value: 'CREDIT', label: 'Crédit' },
    ],
  },
  { key: 'dateFrom', label: 'Date début', type: 'date' },
  { key: 'dateTo',   label: 'Date fin',   type: 'date' },
];

// ─── PaymentsPage ──────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState<'invoices' | 'history'>('invoices');
  const [payTarget, setPayTarget] = useState<Sale | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'CASH', note: '' });
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const paymentMethodOptions = useDropdownOptions('payment_methods');

  const canViewSales        = can('sales.view');
  const canViewPayments     = can('payments.view');
  const canReceivePayment   = can('payments.receive_client_payment');

  // ── Invoices tab state ──────────────────────────────────────────────────────
  const [invPage,    setInvPage]    = useState(1);
  const [invLimit,   setInvLimit]   = useState(20);
  const [invSearch,  setInvSearch]  = useState('');
  const [invSort,    setInvSort]    = useState('createdAt');
  const [invOrder,   setInvOrder]   = useState<'asc' | 'desc'>('desc');
  const [invFilters, setInvFilters] = useState<Record<string, string>>({
    paymentStatus: '', dateFrom: '', dateTo: '',
  });

  const invParams = {
    page: invPage, limit: invLimit,
    search: invSearch || undefined,
    payableOnly: true,
    paymentStatus: invFilters.paymentStatus || undefined,
    dateFrom: invFilters.dateFrom || undefined,
    dateTo:   invFilters.dateTo   || undefined,
    sortBy:   invSort,
    sortOrder: invOrder,
  };

  const salesQuery = useQuery({
    queryKey: ['stockini-sales', 'payable', invPage, invLimit, invSearch, invFilters, invSort, invOrder],
    queryFn: () => stockiniApi.sales(invParams),
    enabled: canViewSales,
    placeholderData: (prev) => prev,
  });

  const salesData = Array.isArray(salesQuery.data?.data) ? salesQuery.data.data : [];
  const unpaidSales = salesData.filter(
    (s) => (s.paymentStatus === 'UNPAID' || s.paymentStatus === 'PARTIAL') && !s.deletedAt,
  );

  // ── History tab state ───────────────────────────────────────────────────────
  const [histPage,    setHistPage]    = useState(1);
  const [histLimit,   setHistLimit]   = useState(20);
  const [histSearch,  setHistSearch]  = useState('');
  const [histSort,    setHistSort]    = useState('date');
  const [histOrder,   setHistOrder]   = useState<'asc' | 'desc'>('desc');
  const [histFilters, setHistFilters] = useState<Record<string, string>>({
    method: '', dateFrom: '', dateTo: '',
  });

  const histParams: PaymentsQueryParams = {
    page: histPage, limit: histLimit,
    search: histSearch || undefined,
    type: 'CUSTOMER_PAYMENT',
    method: histFilters.method || undefined,
    dateFrom: histFilters.dateFrom || undefined,
    dateTo:   histFilters.dateTo   || undefined,
    sortBy:   histSort,
    sortOrder: histOrder,
  };

  const paymentsQuery = useQuery({
    queryKey: ['stockini-payments', histPage, histLimit, histSearch, histFilters, histSort, histOrder],
    queryFn: () => stockiniApi.payments(histParams),
    enabled: canViewPayments,
    placeholderData: (prev) => prev,
  });

  const paymentsData = Array.isArray(paymentsQuery.data?.data) ? paymentsQuery.data.data : [];

  // ── Pay mutation ────────────────────────────────────────────────────────────
  const payMutation = useMutation({
    mutationFn: () =>
      stockiniApi.paySale(payTarget!.id, {
        amount: Number(payForm.amount),
        method: payForm.method,
        note: payForm.note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-summary'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-analytics'] });
      setPayTarget(null);
      setPayForm({ amount: '', method: 'CASH', note: '' });
      toast.success('Paiement enregistré avec succès');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors du paiement');
    },
  });

  const remaining  = payTarget ? Number(payTarget.remainingAmount) : 0;
  const amountNum  = Number(payForm.amount);
  const amountValid = amountNum > 0 && amountNum <= remaining + 0.001;

  const unpaidCount = salesQuery.data?.total ?? 0;

  return (
    <>
      <PageHeader title="Paiements" subtitle="Gestion des encaissements clients et suivi des dettes." />

      <div className="mb-4 flex gap-0 border-b border-border">
        <button
          type="button"
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'invoices'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
          onClick={() => setActiveTab('invoices')}
        >
          Factures à payer
          {unpaidCount > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
              {unpaidCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
          onClick={() => setActiveTab('history')}
        >
          Historique des paiements
        </button>
      </div>

      {/* ── Factures à payer ── */}
      {activeTab === 'invoices' && (
        canViewSales ? (
          <DataTable<Sale>
            columns={invoicesColumns(canReceivePayment, setSelectedSaleId, (sale) => {
              setPayTarget(sale);
              setPayForm({ amount: Number(sale.remainingAmount).toFixed(3), method: 'CASH', note: '' });
            })}
            data={unpaidSales}
            total={salesQuery.data?.total ?? 0}
            page={invPage}
            limit={invLimit}
            totalPages={salesQuery.data?.totalPages ?? 1}
            loading={salesQuery.isFetching && !salesQuery.isError}
            error={salesQuery.error}
            onRetry={() => salesQuery.refetch()}
            filters={INVOICES_FILTERS}
            filterValues={invFilters}
            searchPlaceholder="Rechercher par référence, client…"
            searchValue={invSearch}
            sortBy={invSort}
            sortOrder={invOrder}
            onPageChange={setInvPage}
            onLimitChange={(l) => { setInvLimit(l); setInvPage(1); }}
            onSearchChange={(s) => { setInvSearch(s); setInvPage(1); }}
            onFilterChange={(k, v) => { setInvFilters((p) => ({ ...p, [k]: v })); setInvPage(1); }}
            onSortChange={(col, order) => { setInvSort(col); setInvOrder(order); setInvPage(1); }}
            rowKey={(row) => row.id}
            emptyMessage="Aucune facture à payer."
          />
        ) : (
          <div className="rounded-lg border border-border/70 bg-white flex items-center justify-center py-12 text-sm text-muted-foreground">
            Vous n&apos;avez pas accès à la liste des ventes. Contactez un administrateur.
          </div>
        )
      )}

      {/* ── Historique des paiements ── */}
      {activeTab === 'history' && (
        <DataTable<Payment>
          columns={historyColumns(setSelectedSaleId)}
          data={paymentsData}
          total={paymentsQuery.data?.total ?? 0}
          page={histPage}
          limit={histLimit}
          totalPages={paymentsQuery.data?.totalPages ?? 1}
          loading={paymentsQuery.isFetching && !paymentsQuery.isError}
          error={paymentsQuery.error}
          onRetry={() => paymentsQuery.refetch()}
          filters={HISTORY_FILTERS}
          filterValues={histFilters}
          searchPlaceholder="Rechercher par référence, facture, client…"
          searchValue={histSearch}
          sortBy={histSort}
          sortOrder={histOrder}
          onPageChange={setHistPage}
          onLimitChange={(l) => { setHistLimit(l); setHistPage(1); }}
          onSearchChange={(s) => { setHistSearch(s); setHistPage(1); }}
          onFilterChange={(k, v) => { setHistFilters((p) => ({ ...p, [k]: v })); setHistPage(1); }}
          onSortChange={(col, order) => { setHistSort(col); setHistOrder(order); setHistPage(1); }}
          rowKey={(row) => row.id}
          emptyMessage="Aucun paiement enregistré."
        />
      )}

      {selectedSaleId && (
        <SaleDetailsModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
      )}

      {/* ── Modal paiement ── */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-text-primary">
                Payer — {payTarget.invoiceNumber}
              </h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setPayTarget(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-muted">Client</span>
                  <span className="font-medium">{payTarget.customer?.name ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Total TTC</span>
                  <span className="font-mono font-medium">{money(payTarget.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Déjà payé</span>
                  <span className="font-mono font-medium text-emerald-600">{money(payTarget.paidAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="font-semibold">Reste à payer</span>
                  <span className="font-mono font-bold text-red-600">{money(payTarget.remainingAmount)}</span>
                </div>
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); if (!amountValid) return; payMutation.mutate(); }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="pay-amount">Montant à payer *</Label>
                  <Input
                    id="pay-amount"
                    type="number"
                    min="0.001"
                    max={remaining}
                    step="0.001"
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                    className={payForm.amount && !amountValid ? 'border-red-400' : ''}
                  />
                  {payForm.amount && !amountValid && (
                    <p className="text-xs text-red-600">
                      {amountNum <= 0
                        ? 'Le montant doit être supérieur à 0'
                        : `Le montant ne peut pas dépasser ${money(remaining)}`}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-method">Mode de paiement *</Label>
                  <select
                    id="pay-method"
                    value={payForm.method}
                    onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                    className="app-select"
                    required
                  >
                    {paymentMethodOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-note">Note (optionnel)</Label>
                  <Input
                    id="pay-note"
                    type="text"
                    value={payForm.note}
                    onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="Référence chèque, virement..."
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button type="button" variant="outline" onClick={() => setPayTarget(null)}>Annuler</Button>
                  <Button type="submit" disabled={payMutation.isPending || !amountValid}>
                    <Check size={14} />
                    {payMutation.isPending ? 'Enregistrement...' : 'Confirmer le paiement'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
