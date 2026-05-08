'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, FileText, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProductRegisterGrid } from '@/components/stockini/register/ProductRegisterGrid';
import {
  calculateDocumentTotals,
  createEmptyLine,
  generatePlaceholderPdf,
  isFilledLine,
  type DocumentType,
  type RegisterLine,
} from '@/lib/stockini/register-utils';
import { money } from '@/lib/stockini/format';
import type { Customer, DropdownOption, Sale } from '@/lib/stockini/types';

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}

const PAYMENT_LABELS: Record<string, string> = {
  PAID: 'Payé',
  PARTIAL: 'Partiel',
  UNPAID: 'Non payé',
};

const SALE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  RETURNED: 'Retournée',
};

export default function VentesPage() {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<RegisterLine[]>([createEmptyLine()]);
  const [customerId, setCustomerId] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [showHistory, setShowHistory] = useState(true);

  const customersQuery = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers').then((r) => r.data),
  });

  const salesQuery = useQuery<Sale[]>({
    queryKey: ['sales'],
    queryFn: () => api.get<Sale[]>('/sales').then((r) => r.data),
  });

  const paymentMethodsQuery = useQuery<DropdownOption[]>({
    queryKey: ['stockini-dropdown-options', 'payment_methods'],
    queryFn: () =>
      api
        .get<DropdownOption[]>('/settings/dropdown-options/payment_methods')
        .then((r) => r.data),
  });

  const filledLines = lines.filter(isFilledLine);
  const totals = calculateDocumentTotals(lines);
  const paidAmountNum = Number(paidAmount) || 0;
  const canSave = filledLines.length > 0;

  const resetForm = () => {
    setLines([createEmptyLine()]);
    setCustomerId('');
    setPaidAmount('');
    setPaymentMethod('');
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (filledLines.length === 0) {
        throw new Error("Ajoutez au moins une ligne produit avant d'enregistrer");
      }
      const missingProduct = filledLines.find((l) => l.productId === null);
      if (missingProduct) {
        throw new Error(
          `La ligne "${missingProduct.designation || missingProduct.reference}" n'est pas liée à un produit du stock`,
        );
      }
      return api
        .post<Sale>('/sales', {
          customerId: customerId || undefined,
          discount: round3(totals.totalRemise),
          tax: round3(totals.totalTva),
          paidAmount: round3(paidAmountNum),
          paymentMethod:
            paidAmountNum > 0 && paymentMethod ? paymentMethod : undefined,
          items: filledLines.map((l) => ({
            productId: l.productId!,
            quantity: l.quantity,
            unitPrice: round3(l.puHt),
          })),
        })
        .then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Vente enregistrée avec succès');
      resetForm();
    },
    onError: (error: unknown) => {
      if (error instanceof Error) {
        toast.error(error.message);
        return;
      }
      const msg = (
        error as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      const text = Array.isArray(msg) ? msg[0] : (msg ?? "Erreur lors de l'enregistrement");
      toast.error(text);
    },
  });

  const handleGeneratePdf = (type: DocumentType) => {
    generatePlaceholderPdf(type);
  };

  const today = new Date().toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* Page header + PDF action buttons */}
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <h1 className="app-page-title">Ventes</h1>
          <p className="app-page-subtitle">
            Enregistrement des ventes et documents commerciaux
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleGeneratePdf('DEVIS')}>
            <FileText size={14} />
            Devis
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleGeneratePdf('BON_COMMANDE')}>
            <Printer size={14} />
            Bon de commande
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleGeneratePdf('BON_LIVRAISON')}>
            <Printer size={14} />
            Bon de livraison
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleGeneratePdf('FACTURE')}>
            <FileText size={14} />
            Facture
          </Button>
        </div>
      </div>

      {/* Document header: client + date */}
      <div className="rounded-lg border border-border/70 bg-white p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] max-w-sm space-y-1.5">
            <Label htmlFor="sale-customer">Client</Label>
            <select
              id="sale-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="app-select"
            >
              <option value="">Client comptoir</option>
              {(customersQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-text-secondary whitespace-nowrap">
              {today}
            </div>
          </div>
        </div>
      </div>

      {/* Register grid */}
      <ProductRegisterGrid lines={lines} onLinesChange={setLines} />

      {/* Payment section + save action */}
      <div className="rounded-lg border border-border/70 bg-white p-4">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="paid-amount">Montant payé (DT)</Label>
              <Input
                id="paid-amount"
                type="number"
                min={0}
                step={0.001}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0.000"
                className="w-36"
              />
            </div>
            {paidAmountNum > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="payment-method">Méthode de paiement</Label>
                <select
                  id="payment-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="app-select"
                >
                  <option value="">— Sélectionner —</option>
                  {(paymentMethodsQuery.data ?? []).map((opt) => (
                    <option key={opt.id} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Réinitialiser
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={!canSave || createMutation.isPending}
            >
              {createMutation.isPending ? 'Enregistrement…' : 'Enregistrer la vente'}
            </Button>
          </div>
        </div>
      </div>

      {/* Sales history */}
      <div className="rounded-lg border border-border/70 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-border/70 text-sm font-semibold text-text-primary hover:bg-surface transition-colors"
        >
          <span>Historique des ventes ({salesQuery.data?.length ?? 0})</span>
          {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showHistory && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="border-b border-border/60">
                  {[
                    'Facture',
                    'Client',
                    'Date',
                    'Articles',
                    'Total TTC',
                    'Paiement',
                    'Statut',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {salesQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                      Chargement…
                    </td>
                  </tr>
                ) : (salesQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                      Aucune vente enregistrée
                    </td>
                  </tr>
                ) : (
                  (salesQuery.data ?? []).map((sale) => (
                    <tr key={sale.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono font-semibold text-xs">
                        {sale.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {sale.customer?.name ?? 'Comptoir'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {new Date(sale.createdAt).toLocaleDateString('fr-TN')}
                      </td>
                      <td className="px-4 py-3 text-center text-text-secondary">
                        {sale.items?.length ?? 0}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium">
                        {money(sale.total)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="app-status-badge border-slate-200 bg-slate-50 text-slate-700">
                          {PAYMENT_LABELS[sale.paymentStatus] ?? sale.paymentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="app-status-badge border-slate-200 bg-slate-50 text-slate-700">
                          {SALE_STATUS_LABELS[sale.status] ?? sale.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
