'use client';

import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Trash2 } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { SaleDetailsModal } from '@/components/stockini/SaleDetailsModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef, type FilterConfig } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { stockiniApi } from '@/lib/stockini/api';
import {
  calculateCustomerPayment,
  type SurplusDisposition,
} from '@/lib/stockini/customer-payment';
import { dateTime, money } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { Payment, PaymentsQueryParams, Sale } from '@/lib/stockini/types';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PageHeader } from '../shared/PageHeader';
import { useDropdownOptions } from '../shared/form-utils';
import { ClearHistoryModal } from '../shared/ClearHistoryModal';

// ─── Sub-components ────────────────────────────────────────────────────────────

function PaymentStatusBadge({ status }: { status: string | null }) {
  if (status === 'PAID')    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Payé</Badge>;
  if (status === 'PARTIAL') return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Partiellement payé</Badge>;
  if (status === 'UNPAID')  return <Badge className="border-red-200 bg-red-50 text-red-700">Non payé</Badge>;
  return <Badge className="border-gray-200 bg-gray-100 text-gray-500">—</Badge>;
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
      { value: '', label: 'Tous (non soldés)' },
      { value: 'UNPAID', label: 'Non payé' },
      { value: 'PARTIAL', label: 'Partiellement payé' },
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
      label: 'Reçu / appliqué',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <div className="text-right font-mono">
          <div className="font-semibold text-emerald-600">{money(row.amountReceived ?? row.amount)}</div>
          {Number(row.amountReceived ?? row.amount) !== Number(row.amountApplied ?? row.amount) && (
            <div className="text-xs text-text-muted">appliqué {money(row.amountApplied ?? row.amount)}</div>
          )}
          {Number(row.changeReturned ?? 0) > 0 && (
            <div className="text-xs text-blue-600">monnaie rendue {money(row.changeReturned)}</div>
          )}
          {Number(row.customerCreditCreated ?? 0) > 0 && (
            <div className="text-xs text-violet-600">crédit {money(row.customerCreditCreated)}</div>
          )}
          {Number(row.retainedSurplus ?? 0) > 0 && (
            <div className="text-xs text-fuchsia-600">écart {money(row.retainedSurplus)}</div>
          )}
        </div>
      ),
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
  const payFormId = useId();
  const [activeTab, setActiveTab] = useState<'invoices' | 'history'>('invoices');
  const [payTarget, setPayTarget] = useState<Sale | null>(null);
  const [payForm, setPayForm] = useState({
    amountReceived: '',
    method: 'CASH',
    note: '',
    idempotencyKey: '',
  });
  const [confirmOverpayment, setConfirmOverpayment] = useState(false);
  const [surplusDisposition, setSurplusDisposition] =
    useState<SurplusDisposition>('NONE');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const paymentMethodOptions = useDropdownOptions('payment_methods');

  const canViewSales        = can('sales.view');
  const canViewPayments     = can('payments.view');
  const canReceivePayment   = can('payments.receive_client_payment');
  const canClearHistory     = can('finance.history.clear');

  const [showClearModal, setShowClearModal] = useState(false);

  const clearHistoryMutation = useMutation({
    mutationFn: () => stockiniApi.clearCustomerPaymentsHistory(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      setShowClearModal(false);
      toast.success(`Historique vidé (${res.count} entrées masquées)`);
    },
    onError: () => toast.error('Erreur lors du vidage de l\'historique'),
  });

  // ── Invoices tab state ──────────────────────────────────────────────────────
  const [invPage,    setInvPage]    = useState(1);
  const [invLimit,   setInvLimit]   = useState(10);
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

  // Le backend filtre déjà via payableOnly=true + remainingAmount>0 : pas de re-filtrage ici.
  const salesData = Array.isArray(salesQuery.data?.data) ? salesQuery.data.data : [];

  // ── History tab state ───────────────────────────────────────────────────────
  const [histPage,    setHistPage]    = useState(1);
  const [histLimit,   setHistLimit]   = useState(10);
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
    mutationFn: (overrideDisposition?: SurplusDisposition) => {
      const selectedDisposition = overrideDisposition ?? surplusDisposition;
      const disposition =
        selectedDisposition === 'NONE' ? undefined : selectedDisposition;
      return stockiniApi.paySale(payTarget!.id, {
        amountReceived: Number(payForm.amountReceived),
        method: payForm.method,
        surplusDisposition:
          paymentPreview.changeDue.gt(0) ? disposition : undefined,
        idempotencyKey: payForm.idempotencyKey,
        note: payForm.note || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-customers-page'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-customer-options'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-summary'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-analytics'] });
      setPayTarget(null);
      setPayForm({ amountReceived: '', method: 'CASH', note: '', idempotencyKey: '' });
      setConfirmOverpayment(false);
      setSurplusDisposition('NONE');
      toast.success('Paiement enregistré avec succès');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? (error as Error).message ?? 'Erreur lors du paiement');
    },
  });

  const remaining  = payTarget ? Number(payTarget.remainingAmount) : 0;
  const amountNum  = Number(payForm.amountReceived);
  const paymentPreview = calculateCustomerPayment(
    remaining.toFixed(3),
    payForm.amountReceived || '0',
  );
  const isOverpayment = paymentPreview.changeDue.gt(0);
  const nonCashOverpayment = payForm.method !== 'CASH' && isOverpayment;
  const amountValid =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    (!nonCashOverpayment || (Boolean(payTarget?.customer?.id) && surplusDisposition === 'CUSTOMER_CREDIT'));

  const unpaidCount = salesQuery.data?.pagination.totalItems ?? 0;


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
              setPayForm({
                amountReceived: Number(sale.remainingAmount).toFixed(3),
                method: 'CASH',
                note: '',
                idempotencyKey: crypto.randomUUID(),
              });
              setConfirmOverpayment(false);
              setSurplusDisposition(sale.customer?.id ? 'CUSTOMER_CREDIT' : 'CASH_SURPLUS');
            })}
            data={salesData}
            total={salesQuery.data?.pagination.totalItems ?? 0}
            page={invPage}
            limit={invLimit}
            totalPages={salesQuery.data?.pagination.totalPages ?? 1}
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
        <>
          {canClearHistory && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 hover:border-red-300"
              >
                <Trash2 size={13} />
                Vider l&apos;historique
              </button>
            </div>
          )}
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
        </>
      )}

      <ClearHistoryModal
        open={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={() => clearHistoryMutation.mutate()}
        isPending={clearHistoryMutation.isPending}
        moduleName="Historique des paiements clients"
      />

      {selectedSaleId && (
        <SaleDetailsModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
      )}

      {/* ── Modal paiement ── */}
      <SlideOver
        title="Payer"
        subtitle={payTarget?.invoiceNumber}
        open={!!payTarget}
        onClose={() => { setPayTarget(null); setConfirmOverpayment(false); }}
        width={480}
        footer={
          confirmOverpayment ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOverpayment(false)}>
                Retour
              </Button>
              {payForm.method === 'CASH' && (
                <Button
                  type="button"
                  size="sm"
                  disabled={payMutation.isPending}
                  onClick={() => payMutation.mutate('RETURNED')}
                >
                  Rendre {money(paymentPreview.changeDue.toFixed(3))} et confirmer
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={payMutation.isPending || surplusDisposition === 'NONE' || surplusDisposition === 'RETURNED'}
                onClick={() => payMutation.mutate(undefined)}
              >
                Ne pas rendre et confirmer
              </Button>
            </>
          ) : (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setPayTarget(null)}>
              Annuler
            </Button>
            <Button type="submit" form={payFormId} size="sm" disabled={payMutation.isPending || !amountValid}>
              <Check size={14} />
              {payMutation.isPending ? 'Enregistrement...' : 'Confirmer le paiement'}
            </Button>
          </>
          )
        }
      >
        {payTarget && (
          <div className="space-y-4">
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
            {confirmOverpayment && (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-sm">
                <p className="mb-3 font-semibold text-amber-900">Confirmer le trop-perçu</p>
                <div className="flex justify-between"><span>Montant reçu</span><strong>{money(paymentPreview.amountReceived.toFixed(3))}</strong></div>
                <div className="flex justify-between"><span>Montant appliqué</span><strong>{money(paymentPreview.amountApplied.toFixed(3))}</strong></div>
                <div className="flex justify-between text-amber-800"><span>Monnaie à rendre</span><strong>{money(paymentPreview.changeDue.toFixed(3))}</strong></div>
                <fieldset className="mt-4 space-y-2 border-t border-amber-200 pt-3">
                  <legend className="font-medium">Destination du surplus</legend>
                  {payTarget.customer?.id && (
                    <label className="flex items-center gap-2">
                      <input type="radio" name="surplus" checked={surplusDisposition === 'CUSTOMER_CREDIT'} onChange={() => setSurplusDisposition('CUSTOMER_CREDIT')} />
                      Crédit client
                    </label>
                  )}
                  {payForm.method === 'CASH' && (
                    <label className="flex items-center gap-2">
                      <input type="radio" name="surplus" checked={surplusDisposition === 'CASH_SURPLUS'} onChange={() => setSurplusDisposition('CASH_SURPLUS')} />
                      Pourboire / écart encaissé
                    </label>
                  )}
                </fieldset>
              </div>
            )}
            {!confirmOverpayment && <form
              id={payFormId}
              onSubmit={(e) => {
                e.preventDefault();
                if (!amountValid) return;
                if (isOverpayment) setConfirmOverpayment(true);
                else payMutation.mutate(undefined);
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Montant reçu du client *</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={payForm.amountReceived}
                  onChange={(e) => setPayForm((f) => ({ ...f, amountReceived: e.target.value }))}
                  required
                  className={payForm.amountReceived && !amountValid ? 'border-red-400' : ''}
                />
                {payForm.amountReceived && !amountValid && (
                  <p className="text-xs text-red-600">
                    {amountNum <= 0
                      ? 'Le montant doit être supérieur à 0'
                      : 'Pour un paiement non espèces, le surplus doit devenir un crédit client.'}
                  </p>
                )}
              </div>
              {amountNum > 0 && (
                <div className="space-y-1 rounded-lg border border-border bg-slate-50 p-3 text-sm">
                  <div className="flex justify-between"><span>Montant dû</span><span>{money(paymentPreview.remainingBefore.toFixed(3))}</span></div>
                  <div className="flex justify-between"><span>Montant reçu</span><span>{money(paymentPreview.amountReceived.toFixed(3))}</span></div>
                  <div className="flex justify-between"><span>Montant encaissé</span><span>{money(paymentPreview.amountApplied.toFixed(3))}</span></div>
                  <div className="flex justify-between font-semibold"><span>Nouveau reste à payer</span><span>{money(paymentPreview.remainingAfter.toFixed(3))}</span></div>
                  {isOverpayment && (
                    <div className="mt-2 flex justify-between rounded border border-amber-300 bg-amber-100 p-2 font-bold text-amber-900">
                      <span>Monnaie à rendre</span><span>{money(paymentPreview.changeDue.toFixed(3))}</span>
                    </div>
                  )}
                </div>
              )}
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
            </form>}
          </div>
        )}
      </SlideOver>
    </>
  );
}
