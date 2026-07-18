'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Combine, Eye, Pencil, RotateCcw, Search, X } from 'lucide-react';
import { SaleDetailsModal } from '@/components/stockini/SaleDetailsModal';
import { KebabMenu } from '@/components/stockini/shared/KebabMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { money } from '@/lib/stockini/format';
import { stockiniApi } from '@/lib/stockini/api';
import type { CustomerSaleHistoryItem, SalesQueryParams } from '@/lib/stockini/types';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { ConsolidateDocumentsDialog } from './ConsolidateDocumentsDialog';
import { ConsolidatedDocumentBadge } from './ConsolidatedDocumentBadge';
import { isSourceOfActiveConsolidation, SalePaymentCell } from './SaleConsolidationDisplay';
import { toast } from '@/lib/toast';
import type { Sale } from '@/lib/stockini/types';

const DOCUMENT_LABELS: Record<string, string> = {
  DEVIS: 'Devis', BON_COMMANDE: 'BC', BON_LIVRAISON: 'BL', FACTURE: 'Facture', AVOIR: 'Avoir',
};
const DOCUMENT_COLORS: Record<string, string> = {
  DEVIS: 'border-gray-200 bg-gray-100 text-gray-600',
  BON_COMMANDE: 'border-blue-200 bg-blue-50 text-blue-700',
  BON_LIVRAISON: 'border-purple-200 bg-purple-50 text-purple-700',
  FACTURE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  AVOIR: 'border-red-200 bg-red-50 text-red-700',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon', COMPLETED: 'Terminée', CANCELLED: 'Annulée', RETURNED: 'Retournée',
  PARTIALLY_REFUNDED: 'Partiellement remboursée', REFUNDED: 'Remboursée',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  CANCELLED: 'border-red-200 bg-red-50 text-red-700',
  RETURNED: 'border-orange-200 bg-orange-50 text-orange-700',
  PARTIALLY_REFUNDED: 'border-amber-200 bg-amber-50 text-amber-700',
  REFUNDED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

type Period = '' | 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

function localDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function periodDates(period: Period, customFrom: string, customTo: string) {
  if (period === 'custom') return { dateFrom: customFrom || undefined, dateTo: customTo ? `${customTo}T23:59:59.999` : undefined };
  if (!period) return {};
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (period === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === 'month') start.setDate(1);
  if (period === 'year') { start.setMonth(0); start.setDate(1); }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

export function CustomerSalesHistory({ customerId }: { customerId: string }) {
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [inputSearch, setInputSearch] = useState('');
  const [search, setSearch] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentStatus, setDocumentStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [period, setPeriod] = useState<Period>('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CustomerSaleHistoryItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(inputSearch.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [inputSearch]);

  const params = useMemo(() => ({
    page, limit, search: search || undefined, documentType: documentType || undefined,
    documentStatus: documentStatus || undefined, paymentStatus: paymentStatus || undefined,
    ...periodDates(period, customFrom, customTo), sortBy, sortOrder,
  }), [page, limit, search, documentType, documentStatus, paymentStatus, period, customFrom, customTo, sortBy, sortOrder]);

  const query = useQuery({
    queryKey: ['customer-sales', customerId, params],
    queryFn: () => stockiniApi.customerSales(customerId, params as SalesQueryParams & { documentStatus?: string }),
    placeholderData: (previous) => previous,
    enabled: can('sales.view'),
  });
  const consolidation = useMutation({
    mutationFn: (value: { targetType: 'BON_LIVRAISON' | 'FACTURE'; date: string; note: string }) => stockiniApi.createSalesConsolidation({ sourceIds: selected.map((sale) => String(sale.id)), ...value }),
    onSuccess: (sale) => { toast.success(`Regroupement ${sale.invoiceNumber} créé`); setSelected([]); setDialogOpen(false); void queryClient.invalidateQueries({ queryKey: ['customer-sales', customerId] }); },
    onError: (error: unknown) => toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Impossible de regrouper les documents'),
  });
  const toggle = (sale: CustomerSaleHistoryItem) => setSelected((current) => current.some((item) => item.id === sale.id) ? current.filter((item) => item.id !== sale.id) : [...current, sale]);
  const openConsolidation = () => {
    const type = selected[0]?.documentType;
    if (selected.length < 2) return;
    if (!['BON_LIVRAISON', 'FACTURE'].includes(type) || selected.some((sale) => sale.documentType !== type)) return toast.error('Sélectionnez uniquement des BL ou uniquement des factures');
    if (selected.some((sale) => sale.status === 'CANCELLED' || sale.activeConsolidation || sale.isConsolidated)) return toast.error('La sélection contient un document incompatible');
    setDialogOpen(true);
  };

  const reset = () => {
    setInputSearch(''); setSearch(''); setDocumentType(''); setDocumentStatus('');
    setPaymentStatus(''); setPeriod(''); setCustomFrom(''); setCustomTo(''); setPage(1);
    setSortBy('date'); setSortOrder('desc');
  };
  const sort = (field: string) => {
    if (sortBy === field) setSortOrder((current) => current === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('asc'); }
    setPage(1);
  };
  const edit = (sale: CustomerSaleHistoryItem) => {
    const returnTo = `/clients/${customerId}`;
    window.location.assign(`/ventes?mode=edit&saleId=${encodeURIComponent(sale.id)}&returnTo=${encodeURIComponent(returnTo)}`);
  };
  const pagination = query.data?.pagination;
  const summary = query.data?.summary;

  if (!can('sales.view')) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-text-primary">Historique des ventes</h2>
          <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">{pagination?.total ?? 0}</span>
        </div>
        {selected.length > 0 && <div className="flex items-center gap-2 rounded-xl border bg-white px-2 py-1.5 text-xs shadow-sm"><span>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>{selected.length >= 2 && can('sales.consolidate') && <Button size="sm" onClick={openConsolidation}><Combine size={14} /> Regrouper</Button>}<button onClick={() => setSelected([])} aria-label="Annuler la sélection"><X size={14} /></button></div>}
      </div>

      <div className="grid gap-3 border-b border-border/60 bg-slate-50/50 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Total des ventes TTC" value={money(summary?.totalTtc)} />
        <Summary label="Montant payé" value={money(summary?.totalPaid)} tone="green" />
        <Summary label="Reste à payer" value={money(summary?.totalRemaining)} tone="red" />
        <Summary label="Ventes impayées" value={String(summary?.unpaidCount ?? 0)} tone="orange" />
      </div>

      <div className="space-y-3 border-b border-border/60 p-4">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <Input value={inputSearch} onChange={(e) => setInputSearch(e.target.value)} className="pl-9" placeholder="Référence, produit ou réf. produit" />
          </div>
          <Filter value={documentType} onChange={(v) => { setDocumentType(v); setPage(1); }} label="Tous les types" options={Object.entries(DOCUMENT_LABELS)} />
          <Filter value={documentStatus} onChange={(v) => { setDocumentStatus(v); setPage(1); }} label="Tous les statuts" options={Object.entries(STATUS_LABELS)} />
          <Filter value={paymentStatus} onChange={(v) => { setPaymentStatus(v); setPage(1); }} label="Tous les paiements" options={[["PAID", "Payé"], ["PARTIAL", "Partiellement payé"], ["UNPAID", "Non payé"]]} />
          <Filter value={period} onChange={(v) => { setPeriod(v as Period); setPage(1); }} label="Toutes les périodes" options={[["today", "Aujourd’hui"], ["yesterday", "Hier"], ["week", "Cette semaine"], ["month", "Ce mois"], ["year", "Cette année"], ["custom", "Dates personnalisées"]]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {period === 'custom' && <><Input type="date" className="w-40" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }} /><Input type="date" className="w-40" value={customTo} min={customFrom} onChange={(e) => { setCustomTo(e.target.value); setPage(1); }} /></>}
          <Button variant="outline" size="sm" onClick={reset}><RotateCcw size={14} /> Réinitialiser</Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
            <th className="w-10 px-3 py-3"><span className="sr-only">Sélection</span></th>
            <Head label="Référence" onClick={() => sort('reference')} /><Head label="Type" onClick={() => sort('documentType')} />
            <Head label="Date" onClick={() => sort('date')} /><th className="px-3 py-3 text-center">Articles</th>
            <Head label="Total TTC" right onClick={() => sort('totalTtc')} /><Head label="Payé" right onClick={() => sort('paidAmount')} />
            <Head label="Reste" right onClick={() => sort('remainingAmount')} /><Head label="Paiement" onClick={() => sort('paymentStatus')} />
            <Head label="Document" onClick={() => sort('documentStatus')} /><th className="px-3 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-border/50 [&_td]:whitespace-nowrap [&_td]:align-middle">
            {query.isLoading ? Array.from({ length: limit }).map((_, index) => <tr key={index}>{Array.from({ length: 10 }).map((__, cell) => <td key={cell} className="px-3 py-3"><div className="h-4 animate-pulse rounded bg-slate-100" /></td>)}</tr>) :
            query.isError ? <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-red-600">Impossible de charger l’historique des ventes.</td></tr> :
            !query.data?.data.length ? <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-text-muted">Aucune vente enregistrée pour ce client</td></tr> :
            query.data.data.map((sale) => {
              const isConsolidationSource = isSourceOfActiveConsolidation(sale);
              return <tr key={sale.id} className={isConsolidationSource ? 'bg-slate-50/70 hover:bg-slate-100/70' : 'hover:bg-slate-50/70'}>
              <td className="px-3 py-3 text-center"><input type="checkbox" checked={selected.some((item) => item.id === sale.id)} disabled={Boolean(sale.activeConsolidation)} onChange={() => toggle(sale)} aria-label={`Sélectionner ${sale.invoiceNumber}`} /></td>
              <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-800">{sale.invoiceNumber}</td>
              <td className="px-3 py-3"><span className={`app-status-badge ${DOCUMENT_COLORS[sale.documentType] ?? DOCUMENT_COLORS.DEVIS}`}>{DOCUMENT_LABELS[sale.documentType] ?? sale.documentType}</span> {sale.isConsolidated && <ConsolidatedDocumentBadge />}</td>
              <td className="px-3 py-3 text-slate-600">{new Date(sale.createdAt).toLocaleDateString('fr-TN')}</td>
              <td className="px-3 py-3 text-center tabular-nums">{sale.itemCount}</td>
              <td className="px-3 py-3 text-right font-medium tabular-nums">{money(sale.totalTtc)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{money(sale.paidAmount)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-red-700">{money(sale.remainingAmount)}</td>
              <td className="px-3 py-3 text-center"><SalePaymentCell sale={sale}><PaymentStatusBadge status={sale.paymentStatus} /></SalePaymentCell></td>
              <td className="px-3 py-3"><span className={`app-status-badge ${STATUS_COLORS[sale.status] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}>{STATUS_LABELS[sale.status] ?? sale.status}</span></td>
              <td className="px-3 py-3 text-right"><KebabMenu items={[{ label: 'Voir les détails', icon: <Eye size={14} />, onClick: () => setDetailSaleId(sale.id), hidden: !can('sales.view_details') }, { label: 'Voir le regroupement', icon: <Combine size={14} />, onClick: () => setDetailSaleId(String(sale.activeConsolidation?.id)), hidden: !isConsolidationSource || !can('sales.view_details') }, { label: 'Modifier', icon: <Pencil size={14} />, onClick: () => edit(sale), hidden: isConsolidationSource || !can('sales.update') }]} /></td>
            </tr>})}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-slate-500">
        <label className="flex items-center gap-2">Lignes : <select className="app-select h-8 w-20" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>{[5, 10, 20, 50].map((n) => <option key={n}>{n}</option>)}</select></label>
        <div className="flex items-center gap-2"><span>Page {pagination?.page ?? 1} sur {Math.max(1, pagination?.totalPages ?? 1)}</span><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button><Button size="sm" variant="outline" disabled={page >= (pagination?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button></div>
      </div>
      {detailSaleId && <SaleDetailsModal saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />}
      {dialogOpen && <ConsolidateDocumentsDialog sales={selected.map((sale) => ({ ...sale, customer: { id: customerId, name: 'Client' } } as unknown as Sale))} onClose={() => setDialogOpen(false)} loading={consolidation.isPending} onConfirm={(value) => consolidation.mutate(value)} />}
    </section>
  );
}

function Summary({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'red' | 'orange' }) {
  const color = { default: 'text-slate-900', green: 'text-emerald-700', red: 'text-red-700', orange: 'text-orange-700' }[tone];
  return <div className="rounded-lg border border-border/60 bg-white px-4 py-3"><p className="text-xs text-text-muted">{label}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p></div>;
}
function Filter({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: string[][] }) {
  return <select className="app-select" value={value} onChange={(e) => onChange(e.target.value)}><option value="">{label}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>;
}
function Head({ label, onClick, right = false }: { label: string; onClick: () => void; right?: boolean }) {
  return <th className={`cursor-pointer select-none px-3 py-3 hover:text-slate-800 ${right ? 'text-right' : 'text-left'}`} onClick={onClick}>{label}</th>;
}
