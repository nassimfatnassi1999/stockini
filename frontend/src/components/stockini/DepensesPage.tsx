'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
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
import type { Purchase } from '@/lib/stockini/types';

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="app-page-title">{title}</h1>
        <p className="app-page-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

function StateRows({
  loading,
  error,
  empty,
  colSpan,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  colSpan: number;
}) {
  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">
          Chargement...
        </TableCell>
      </TableRow>
    );
  }
  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-red-600">
          Impossible de charger les données.
        </TableCell>
      </TableRow>
    );
  }
  if (empty) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-text-secondary">
          Aucune donnée trouvée.
        </TableCell>
      </TableRow>
    );
  }
  return null;
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'PAID') return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Payé</Badge>;
  if (status === 'PARTIAL') return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Partiellement payé</Badge>;
  return <Badge className="border-red-200 bg-red-50 text-red-700">Non payé</Badge>;
}

function PaymentMethodLabel({ method }: { method: string }) {
  const labels: Record<string, string> = {
    CASH: 'Espèces',
    CARD: 'Carte',
    BANK_TRANSFER: 'Virement',
    CHECK: 'Chèque',
    CREDIT: 'Crédit',
  };
  return <>{labels[method] ?? method}</>;
}

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
  const opts = (query.data ?? [])
    .filter((o) => o.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((o) => ({ value: o.value, label: o.label }));
  return opts.length > 0 ? opts : FALLBACK_PAYMENT_METHODS;
}

export function DepensesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'invoices' | 'history'>('invoices');
  const [payTarget, setPayTarget] = useState<Purchase | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'CASH', note: '' });
  const paymentMethodOptions = usePaymentMethodOptions();

  const purchasesQuery = useQuery({
    queryKey: ['stockini-purchases'],
    queryFn: stockiniApi.purchases,
  });
  const paymentsQuery = useQuery({
    queryKey: ['stockini-payments'],
    queryFn: stockiniApi.payments,
  });

  const unpaidPurchases = (purchasesQuery.data ?? []).filter(
    (p) => (p.paymentStatus === 'UNPAID' || p.paymentStatus === 'PARTIAL') && !p.deletedAt,
  );

  const supplierPayments = (paymentsQuery.data ?? []).filter(
    (p) => p.type === 'SUPPLIER_PAYMENT' && !p.deletedAt,
  );

  const payMutation = useMutation({
    mutationFn: () =>
      stockiniApi.payPurchase(payTarget!.id, {
        amount: Number(payForm.amount),
        method: payForm.method,
        note: payForm.note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      setPayTarget(null);
      setPayForm({ amount: '', method: 'CASH', note: '' });
      toast.success('Dépense enregistrée avec succès');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de l\'enregistrement du paiement');
    },
  });

  const remaining = payTarget ? Number(payTarget.remainingAmount) : 0;
  const amountNum = Number(payForm.amount);
  const amountValid = amountNum > 0 && amountNum <= remaining + 0.001;

  return (
    <>
      <PageHeader
        title="Dépenses fournisseurs"
        subtitle="Gestion des paiements fournisseurs et suivi des dettes."
      />

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
          Factures fournisseurs à payer
          {unpaidPurchases.length > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
              {unpaidPurchases.length}
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
          Historique des dépenses
        </button>
      </div>

      {activeTab === 'invoices' && (
        <Card className="shadow-card">
          <CardContent className="p-0">
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
                <StateRows
                  loading={purchasesQuery.isLoading}
                  error={purchasesQuery.error}
                  empty={unpaidPurchases.length === 0}
                  colSpan={8}
                />
                {unpaidPurchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-mono font-semibold text-primary">
                      {purchase.orderNumber}
                    </TableCell>
                    <TableCell>{purchase.supplier?.name ?? '-'}</TableCell>
                    <TableCell className="text-text-secondary">{dateTime(purchase.createdAt)}</TableCell>
                    <TableCell className="text-right font-mono">{money(purchase.total)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">
                      {money(purchase.paidAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-red-600">
                      {money(purchase.remainingAmount)}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={purchase.paymentStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setPayTarget(purchase);
                          setPayForm({
                            amount: Number(purchase.remainingAmount).toFixed(3),
                            method: 'CASH',
                            note: '',
                          });
                        }}
                      >
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
                <StateRows
                  loading={paymentsQuery.isLoading}
                  error={paymentsQuery.error}
                  empty={supplierPayments.length === 0}
                  colSpan={7}
                />
                {supplierPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-text-secondary">{dateTime(payment.createdAt)}</TableCell>
                    <TableCell className="font-mono font-semibold">{payment.reference}</TableCell>
                    <TableCell className="font-mono text-text-secondary">
                      {payment.purchase?.orderNumber ?? '-'}
                    </TableCell>
                    <TableCell>
                      {payment.supplier?.name ?? payment.purchase?.supplier?.name ?? '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-red-600">
                      {money(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <PaymentMethodLabel method={payment.method} />
                    </TableCell>
                    <TableCell className="text-text-secondary">{payment.note ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-text-primary">
                Payer — {payTarget.orderNumber}
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
                  <span className="text-text-muted">Fournisseur</span>
                  <span className="font-medium">{payTarget.supplier?.name ?? '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Document achat</span>
                  <span className="font-mono font-medium">{payTarget.orderNumber}</span>
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
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!amountValid) return;
                  payMutation.mutate();
                }}
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
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pay-note">Date du paiement</Label>
                  <Input
                    id="pay-date"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="text-sm"
                    readOnly
                  />
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
                  <Button type="button" variant="outline" onClick={() => setPayTarget(null)}>
                    Annuler
                  </Button>
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
