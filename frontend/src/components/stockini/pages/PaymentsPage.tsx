'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { SaleDetailsModal } from '@/components/stockini/SaleDetailsModal';
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
import type { Sale } from '@/lib/stockini/types';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PageHeader } from '../shared/PageHeader';
import { StateRows } from '../shared/StateRows';
import { useDropdownOptions } from '../shared/form-utils';

function PaymentStatusBadge({ status }: { status: string | null }) {
  if (status === 'PAID') return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Payé</Badge>;
  if (status === 'PARTIAL') return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Partiel</Badge>;
  if (!status) return <Badge className="border-gray-200 bg-gray-100 text-gray-500">—</Badge>;
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

export function PaymentsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState<'invoices' | 'history'>('invoices');
  const [payTarget, setPayTarget] = useState<Sale | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'CASH', note: '' });
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const paymentMethodOptions = useDropdownOptions('payment_methods');

  const canViewSales = can('sales.view');
  const canViewPayments = can('payments.view');
  const canReceivePayment = can('payments.receive_client_payment');

  // On demande directement au backend les documents réellement payables :
  // FACTURE ou BON_LIVRAISON non transformé, paiement incomplet, non annulé.
  const salesQuery = useQuery({
    queryKey: ['stockini-sales', 'payable'],
    queryFn: () => stockiniApi.sales({ payableOnly: true, limit: 100 }),
    enabled: canViewSales,
  });
  const paymentsQuery = useQuery({
    queryKey: ['stockini-payments'],
    queryFn: stockiniApi.payments,
    enabled: canViewPayments,
  });

  const salesData = Array.isArray(salesQuery.data?.data) ? salesQuery.data.data : [];
  // Le backend a déjà filtré ; on garde le filtre côté client comme filet de sécurité.
  const unpaidSales = salesData.filter(
    (s) => (s.paymentStatus === 'UNPAID' || s.paymentStatus === 'PARTIAL') && !s.deletedAt,
  );
  const paymentsData = Array.isArray(paymentsQuery.data) ? paymentsQuery.data : [];
  const customerPayments = paymentsData.filter(
    (p) => p.type === 'CUSTOMER_PAYMENT' && !p.deletedAt,
  );

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
      queryClient.invalidateQueries({ queryKey: ['stockini-caisse'] });
      setPayTarget(null);
      setPayForm({ amount: '', method: 'CASH', note: '' });
      toast.success('Paiement enregistré avec succès');
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors du paiement');
    },
  });

  const remaining = payTarget ? Number(payTarget.remainingAmount) : 0;
  const amountNum = Number(payForm.amount);
  const amountValid = amountNum > 0 && amountNum <= remaining + 0.001;

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
          {unpaidSales.length > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
              {unpaidSales.length}
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

      {activeTab === 'invoices' && (
        canViewSales ? (
          <Card className="shadow-card">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Document</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total TTC</TableHead>
                    <TableHead className="text-right">Déjà payé</TableHead>
                    <TableHead className="text-right">Reste à payer</TableHead>
                    <TableHead>Statut</TableHead>
                    {canReceivePayment && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <StateRows
                    loading={salesQuery.isLoading}
                    error={salesQuery.error}
                    empty={unpaidSales.length === 0}
                    colSpan={canReceivePayment ? 8 : 7}
                  />
                  {unpaidSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="font-mono font-semibold text-primary underline-offset-2 hover:underline"
                          onClick={() => setSelectedSaleId(sale.id)}
                        >
                          {sale.invoiceNumber}
                        </button>
                      </TableCell>
                      <TableCell>{sale.customer?.name ?? '-'}</TableCell>
                      <TableCell className="text-text-secondary">{dateTime(sale.createdAt)}</TableCell>
                      <TableCell className="text-right font-mono">{money(sale.total)}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-600">{money(sale.paidAmount)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-red-600">{money(sale.remainingAmount)}</TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={sale.paymentStatus} />
                      </TableCell>
                      {canReceivePayment && (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setPayTarget(sale);
                              setPayForm({
                                amount: Number(sale.remainingAmount).toFixed(3),
                                method: 'CASH',
                                note: '',
                              });
                            }}
                          >
                            Payer
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-card">
            <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Vous n&apos;avez pas accès à la liste des ventes. Contactez un administrateur.
            </CardContent>
          </Card>
        )
      )}

      {activeTab === 'history' && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows
                  loading={paymentsQuery.isLoading}
                  error={paymentsQuery.error}
                  empty={customerPayments.length === 0}
                  colSpan={7}
                />
                {customerPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-text-secondary">{dateTime(payment.createdAt)}</TableCell>
                    <TableCell className="font-mono font-semibold">{payment.reference}</TableCell>
                    <TableCell>
                      {payment.sale?.id ? (
                        <button
                          type="button"
                          className="font-mono text-primary underline-offset-2 hover:underline"
                          onClick={() => setSelectedSaleId(payment.sale!.id)}
                        >
                          {payment.sale.invoiceNumber}
                        </button>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{payment.customer?.name ?? payment.sale?.customer?.name ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-emerald-600">{money(payment.amount)}</TableCell>
                    <TableCell><PaymentMethodLabel method={payment.method} /></TableCell>
                    <TableCell className="text-text-secondary">{payment.note ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selectedSaleId && (
        <SaleDetailsModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
      )}

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
