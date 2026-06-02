'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Trash2 } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, money } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { CaisseMovement, CaisseMovementType, Purchase } from '@/lib/stockini/types';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { ClearHistoryModal } from './shared/ClearHistoryModal';

function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="app-page-title">{title}</h1>
        <p className="app-page-subtitle">{subtitle}</p>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

function StateRows({ loading, error, empty, colSpan }: { loading: boolean; error: unknown; empty: boolean; colSpan: number }) {
  if (loading) return <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">Chargement...</TableCell></TableRow>;
  if (error) return <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-red-600">Impossible de charger les données.</TableCell></TableRow>;
  if (empty) return <TableRow><TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">Aucune donnée trouvée.</TableCell></TableRow>;
  return null;
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Payé</Badge>;
  if (status === 'PARTIAL') return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Partiellement payé</Badge>;
  return <Badge className="border-red-200 bg-red-50 text-red-700">Non payé</Badge>;
}

function PaymentMethodLabel({ method }: { method: string }) {
  const labels: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', BANK_TRANSFER: 'Virement', CHECK: 'Chèque', CREDIT: 'Crédit' };
  return <>{labels[method] ?? method}</>;
}

const CAISSE_MOVEMENT_LABELS: Record<CaisseMovementType, string> = {
  ENCAISSEMENT_VENTE: 'Encaissement vente',
  DECAISSEMENT_ACHAT: 'Paiement fournisseur',
  DEPOT_MANUEL: 'Dépôt manuel',
  RETRAIT_MANUEL: 'Retrait manuel',
  ANNULATION_VENTE: 'Annulation vente',
  ANNULATION_ACHAT: 'Annulation achat',
};

const CAISSE_MOVEMENT_COLORS: Record<CaisseMovementType, string> = {
  ENCAISSEMENT_VENTE: 'text-emerald-600',
  DECAISSEMENT_ACHAT: 'text-red-600',
  DEPOT_MANUEL: 'text-emerald-600',
  RETRAIT_MANUEL: 'text-red-600',
  ANNULATION_VENTE: 'text-amber-600',
  ANNULATION_ACHAT: 'text-amber-600',
};

const FALLBACK_PAYMENT_METHODS = [
  { value: 'CASH', label: 'Espèces' },
  { value: 'CARD', label: 'Carte bancaire' },
  { value: 'BANK_TRANSFER', label: 'Virement' },
  { value: 'CHECK', label: 'Chèque' },
  { value: 'CREDIT', label: 'Crédit' },
];

function usePaymentMethodOptions() {
  const query = useQuery({
    queryKey: ['stockini-dropdown-options', 'payment_methods'],
    queryFn: () => stockiniApi.dropdownOptionsByCategory('payment_methods'),
  });
  const opts = (query.data ?? []).filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder).map((o) => ({ value: o.value, label: o.label }));
  return opts.length > 0 ? opts : FALLBACK_PAYMENT_METHODS;
}

export function DepensesPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canClearHistory = can('finance.history.clear');
  const [activeTab, setActiveTab] = useState<'invoices' | 'history' | 'caisse'>('invoices');
  const [payTarget, setPayTarget] = useState<Purchase | null>(null);
  const [showClearSupplierModal, setShowClearSupplierModal] = useState(false);
  const [showClearCaisseModal, setShowClearCaisseModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'CASH', note: '' });
  const [caisseTypeFilter, setCaisseTypeFilter] = useState<CaisseMovementType | ''>('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceSupplierFilter, setInvoiceSupplierFilter] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'' | 'UNPAID' | 'PARTIAL'>('');
  const paymentMethodOptions = usePaymentMethodOptions();

  const suppliersQuery = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });

  const purchasesQuery = useQuery({
    queryKey: ['stockini-payable-purchases', invoiceSearch, invoiceSupplierFilter, invoiceStatusFilter],
    queryFn: () =>
      stockiniApi.payablePurchases({
        search: invoiceSearch || undefined,
        supplierId: invoiceSupplierFilter || undefined,
        paymentStatus: invoiceStatusFilter || undefined,
      }),
  });
  const paymentsQuery = useQuery({
    queryKey: ['stockini-payments', 'supplier-expenses'],
    queryFn: () => stockiniApi.payments({ page: 1, limit: 100, type: 'SUPPLIER_PAYMENT' }),
  });
  const balanceQuery = useQuery({ queryKey: ['caisse-balance'], queryFn: stockiniApi.caisseBalance });
  const caisseHistoriqueQuery = useQuery({
    queryKey: ['caisse-historique', caisseTypeFilter],
    queryFn: () => stockiniApi.caisseHistorique(caisseTypeFilter || undefined),
  });

  // Le backend ne renvoie déjà que les factures avec reste à payer > 0 (hors annulées).
  const unpaidPurchases = Array.isArray(purchasesQuery.data?.data) ? purchasesQuery.data.data : [];
  const totalRemaining = Number(purchasesQuery.data?.totalRemaining ?? 0);
  const suppliers = suppliersQuery.data ?? [];
  const paymentsData = paymentsQuery.data?.data ?? [];
  const supplierPayments = paymentsData.filter((p) => !p.deletedAt);

  const payMutation = useMutation({
    mutationFn: () => stockiniApi.payPurchase(payTarget!.id, { amount: Number(payForm.amount), method: payForm.method, note: payForm.note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-payable-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-balance'] });
      queryClient.invalidateQueries({ queryKey: ['caisse-historique'] });
      setPayTarget(null);
      setPayForm({ amount: '', method: 'CASH', note: '' });
      toast.success('Dépense enregistrée avec succès');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de l\'enregistrement du paiement');
    },
  });

  const clearSupplierMutation = useMutation({
    mutationFn: () => stockiniApi.clearSupplierPaymentsHistory(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      setShowClearSupplierModal(false);
      toast.success(`Historique vidé (${res.count} entrées masquées)`);
    },
    onError: () => toast.error('Erreur lors du vidage de l\'historique'),
  });

  const clearCaisseMutation = useMutation({
    mutationFn: () => stockiniApi.clearCaisseHistory(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['caisse-historique'] });
      setShowClearCaisseModal(false);
      toast.success(`Historique caisse vidé (${res.count} entrées masquées)`);
    },
    onError: () => toast.error('Erreur lors du vidage de l\'historique caisse'),
  });

  const remaining = payTarget ? Number(payTarget.remainingAmount) : 0;
  const amountNum = Number(payForm.amount);
  const amountValid = amountNum > 0 && amountNum <= remaining + 0.001;
  const solde = balanceQuery.data?.solde ?? 0;

  const caisseMovementData = (caisseHistoriqueQuery.data ?? []) as CaisseMovement[];

  const caisseIsPositive = (type: CaisseMovementType) =>
    type === 'ENCAISSEMENT_VENTE' || type === 'DEPOT_MANUEL' || type === 'ANNULATION_ACHAT';

  return (
    <>
      <PageHeader
        title="Dépenses fournisseurs"
        subtitle="Gestion des paiements fournisseurs, suivi des dettes et caisse."
        actions={
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-border bg-white px-4 py-2 text-sm">
              <span className="text-text-muted">Solde caisse : </span>
              <span className={`font-mono font-bold ${solde >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {money(solde)}
              </span>
            </div>
          </div>
        }
      />

      <div className="mb-4 flex gap-0 border-b border-border">
        {(['invoices', 'history', 'caisse'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'invoices' && <>Factures à payer{unpaidPurchases.length > 0 && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">{unpaidPurchases.length}</span>}</>}
            {tab === 'history' && 'Paiements fournisseurs'}
            {tab === 'caisse' && 'Historique caisse'}
          </button>
        ))}
      </div>

      {activeTab === 'invoices' && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="search"
                  placeholder="Rechercher un document achat..."
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  className="h-9 sm:max-w-xs"
                />
                <select
                  value={invoiceSupplierFilter}
                  onChange={(e) => setInvoiceSupplierFilter(e.target.value)}
                  className="app-select h-9 text-sm"
                >
                  <option value="">Tous les fournisseurs</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select
                  value={invoiceStatusFilter}
                  onChange={(e) => setInvoiceStatusFilter(e.target.value as '' | 'UNPAID' | 'PARTIAL')}
                  className="app-select h-9 text-sm"
                >
                  <option value="">Tous les statuts</option>
                  <option value="UNPAID">Non payé</option>
                  <option value="PARTIAL">Partiellement payé</option>
                </select>
              </div>
              <div className="text-sm whitespace-nowrap">
                <span className="text-text-muted">Total à payer : </span>
                <span className="font-mono font-bold text-red-600">{money(totalRemaining)}</span>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Document achat</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead className="text-right">Déjà payé</TableHead>
                  <TableHead className="text-right">Reste à payer</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows loading={purchasesQuery.isLoading} error={purchasesQuery.error} empty={unpaidPurchases.length === 0} colSpan={8} />
                {unpaidPurchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-mono font-semibold text-primary">{purchase.orderNumber}</TableCell>
                    <TableCell>{purchase.supplier?.name ?? '-'}</TableCell>
                    <TableCell className="text-text-secondary">{dateTime(purchase.createdAt)}</TableCell>
                    <TableCell className="text-right font-mono">{money(purchase.total)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">{money(purchase.paidAmount)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-red-600">{money(purchase.remainingAmount)}</TableCell>
                    <TableCell><PaymentStatusBadge status={purchase.paymentStatus} /></TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="sm" onClick={() => { setPayTarget(purchase); setPayForm({ amount: Number(purchase.remainingAmount).toFixed(3), method: 'CASH', note: '' }); }}>
                        Payer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'history' && (
        <>
          {canClearHistory && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowClearSupplierModal(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 hover:border-red-300"
              >
                <Trash2 size={13} />
                Vider l&apos;historique
              </button>
            </div>
          )}
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Document achat</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows loading={paymentsQuery.isLoading} error={paymentsQuery.error} empty={supplierPayments.length === 0} colSpan={7} />
                {supplierPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-text-secondary">{dateTime(payment.createdAt)}</TableCell>
                    <TableCell className="font-mono font-semibold">{payment.reference}</TableCell>
                    <TableCell className="font-mono text-text-secondary">{payment.purchase?.orderNumber ?? '-'}</TableCell>
                    <TableCell>{payment.supplier?.name ?? payment.purchase?.supplier?.name ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-red-600">{money(payment.amount)}</TableCell>
                    <TableCell><PaymentMethodLabel method={payment.method} /></TableCell>
                    <TableCell className="text-text-secondary">{payment.note ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>
      )}

      {activeTab === 'caisse' && (
        <>
          {canClearHistory && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowClearCaisseModal(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 hover:border-red-300"
              >
                <Trash2 size={13} />
                Vider l&apos;historique
              </button>
            </div>
          )}
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <span className="text-sm font-medium text-text-primary">Historique des mouvements caisse</span>
              <select
                value={caisseTypeFilter}
                onChange={(e) => setCaisseTypeFilter(e.target.value as CaisseMovementType | '')}
                className="app-select h-8 text-sm"
              >
                <option value="">Tous les types</option>
                {(Object.entries(CAISSE_MOVEMENT_LABELS) as [CaisseMovementType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="text-right">Solde avant</TableHead>
                  <TableHead className="text-right">Solde après</TableHead>
                  <TableHead>Utilisateur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows loading={caisseHistoriqueQuery.isLoading} error={caisseHistoriqueQuery.error} empty={caisseMovementData.length === 0} colSpan={8} />
                {caisseMovementData.map((mov) => {
                  const isPos = caisseIsPositive(mov.type);
                  return (
                    <TableRow key={mov.id}>
                      <TableCell className="text-text-secondary">{dateTime(mov.createdAt)}</TableCell>
                      <TableCell>
                        <Badge className={isPos ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}>
                          {CAISSE_MOVEMENT_LABELS[mov.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-text-secondary">{mov.motif ?? '-'}</TableCell>
                      <TableCell className="font-mono text-text-secondary">{mov.referenceDoc ?? '-'}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${CAISSE_MOVEMENT_COLORS[mov.type]}`}>
                        {isPos ? '+' : '-'}{money(mov.montant)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-text-secondary">{money(mov.ancienSolde)}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${Number(mov.nouveauSolde) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {money(mov.nouveauSolde)}
                      </TableCell>
                      <TableCell className="text-text-secondary">{mov.user?.fullName ?? '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>
      )}

      <ClearHistoryModal
        open={showClearSupplierModal}
        onClose={() => setShowClearSupplierModal(false)}
        onConfirm={() => clearSupplierMutation.mutate()}
        isPending={clearSupplierMutation.isPending}
        moduleName="Paiements fournisseurs"
      />

      <ClearHistoryModal
        open={showClearCaisseModal}
        onClose={() => setShowClearCaisseModal(false)}
        onConfirm={() => clearCaisseMutation.mutate()}
        isPending={clearCaisseMutation.isPending}
        moduleName="Historique caisse"
      />

      {/* Modal paiement fournisseur */}
      <SlideOver
        title="Payer"
        subtitle={payTarget?.orderNumber}
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        width={480}
        footer={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setPayTarget(null)}>Annuler</Button>
            <Button type="submit" form="depenses-pay-form" size="sm" disabled={payMutation.isPending || !amountValid}>
              <Check size={14} />{payMutation.isPending ? 'Enregistrement...' : 'Confirmer le paiement'}
            </Button>
          </>
        }
      >
        {payTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">Fournisseur</span><span className="font-medium">{payTarget.supplier?.name ?? '-'}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Document achat</span><span className="font-mono font-medium">{payTarget.orderNumber}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Total TTC</span><span className="font-mono font-medium">{money(payTarget.total)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Déjà payé</span><span className="font-mono font-medium text-emerald-600">{money(payTarget.paidAmount)}</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="font-semibold">Reste à payer</span><span className="font-mono font-bold text-red-600">{money(payTarget.remainingAmount)}</span></div>
            </div>
            <form id="depenses-pay-form" onSubmit={(e) => { e.preventDefault(); if (!amountValid) return; payMutation.mutate(); }} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Montant à payer *</Label>
                <Input id="pay-amount" type="number" min="0.001" max={remaining} step="0.001" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} required className={payForm.amount && !amountValid ? 'border-red-400' : ''} />
                {payForm.amount && !amountValid && <p className="text-xs text-red-600">{amountNum <= 0 ? 'Le montant doit être supérieur à 0' : `Le montant ne peut pas dépasser ${money(remaining)}`}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-method">Mode de paiement *</Label>
                <select id="pay-method" value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))} className="app-select" required>
                  {paymentMethodOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-note">Note (optionnel)</Label>
                <Input id="pay-note" type="text" value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} placeholder="Référence chèque, virement..." />
              </div>
            </form>
          </div>
        )}
      </SlideOver>
    </>
  );
}
