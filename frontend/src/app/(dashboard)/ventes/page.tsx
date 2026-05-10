'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Eye, FileText, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { hasPermission } from '@/lib/auth';
import { useDraftSave } from '@/lib/hooks/useDraftSave';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProductRegisterGrid } from '@/components/stockini/register/ProductRegisterGrid';
import { SaleDetailsModal } from '@/components/stockini/SaleDetailsModal';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
import {
  calculateDocumentTotals,
  createEmptyLine,
  generatePlaceholderPdf,
  isFilledLine,
  MIN_MARGIN_PERCENT,
  recalculateLine,
  type DocumentType,
  type DocumentTotals,
  type RegisterLine,
} from '@/lib/stockini/register-utils';
import { money } from '@/lib/stockini/format';
import type { Customer, DropdownOption, Sale } from '@/lib/stockini/types';

const PERMISSION_LOW_MARGIN = 'sales.allow_low_margin';
const PERMISSION_VIEW_DETAILS = 'sales.view_details';
const PERMISSION_DELETE_SALE = 'sales.delete';

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}

const PAYMENT_LABELS: Record<string, string> = {
  PAID: 'Payé',
  PARTIAL: 'Partiel',
  UNPAID: 'Non payé',
};

const PAYMENT_COLORS: Record<string, string> = {
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PARTIAL: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  UNPAID: 'border-red-200 bg-red-50 text-red-700',
};

const SALE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  RETURNED: 'Retournée',
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DRAFT: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  CANCELLED: 'border-red-200 bg-red-50 text-red-700',
  RETURNED: 'border-orange-200 bg-orange-50 text-orange-700',
};

interface VenteDraft {
  lines: RegisterLine[];
  customerId: string;
  saleDate: string;
  paidAmount: string;
  paymentMethod: string;
  totals: DocumentTotals;
}

export default function VentesPage() {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<RegisterLine[]>([createEmptyLine()]);
  const [customerId, setCustomerId] = useState('');
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString());
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [allowLowMargin, setAllowLowMargin] = useState(false);
  const [canViewDetails, setCanViewDetails] = useState(false);
  const [canDeleteSale, setCanDeleteSale] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);

  useEffect(() => {
    setAllowLowMargin(hasPermission(PERMISSION_LOW_MARGIN));
    setCanViewDetails(hasPermission(PERMISSION_VIEW_DETAILS));
    setCanDeleteSale(hasPermission(PERMISSION_DELETE_SALE));
  }, []);

  const filledLines = lines.filter(isFilledLine);
  const totals = calculateDocumentTotals(lines);
  const paidAmountNum = Number(paidAmount) || 0;

  // Auto-save hook — tracks form state changes
  const draftData = useMemo<VenteDraft>(
    () => ({ lines, customerId, saleDate, paidAmount, paymentMethod, totals }),
    [lines, customerId, saleDate, paidAmount, paymentMethod, totals],
  );
  const draftEnabled = draftChecked && !showRestorePrompt;
  const { getDraft, hasDraft, clearDraft } = useDraftSave<VenteDraft>({
    key: 'sales:vente',
    data: draftData,
    enabled: draftEnabled,
  });

  // On mount: check for existing draft and prompt user
  useEffect(() => {
    if (draftChecked) return;
    setDraftChecked(true);
    if (hasDraft()) setShowRestorePrompt(true);
  }, [draftChecked, hasDraft]);

  const handleRestoreDraft = () => {
    const draft = getDraft();
    if (!draft) {
      setShowRestorePrompt(false);
      toast.info('Aucun brouillon à restaurer');
      return;
    }
    console.log('Draft trouvé :', draft);
    setLines(
      draft.lines?.length
        ? draft.lines.map((line) =>
            recalculateLine({
              ...createEmptyLine(),
              ...line,
              id: line.id || crypto.randomUUID(),
              productId: line.productId ?? null,
              quantity: Number(line.quantity) || 0,
              puHt: Number(line.puHt) || 0,
              purchasePriceHt: Number(line.purchasePriceHt) || 0,
              remisePercent: Number(line.remisePercent) || 0,
              tvaPercent: Number(line.tvaPercent) || 0,
            }),
          )
        : [createEmptyLine()],
    );
    setCustomerId(draft.customerId ?? '');
    setSaleDate(draft.saleDate ?? new Date().toISOString());
    setPaidAmount(draft.paidAmount ?? '');
    setPaymentMethod(draft.paymentMethod ?? '');
    setShowRestorePrompt(false);
  };

  const handleIgnoreDraft = () => {
    clearDraft();
    setShowRestorePrompt(false);
  };

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

  const invalidMarginLines = filledLines.filter(
    (l) => l.productId !== null && (l.purchasePriceHt <= 0 || (l.margePercent !== null && l.margePercent < MIN_MARGIN_PERCENT)),
  );
  const hasMissingPurchasePrice = filledLines.some(
    (l) => l.productId !== null && l.purchasePriceHt <= 0,
  );
  const marginBlocked = !allowLowMargin && invalidMarginLines.length > 0;
  const canSave = filledLines.length > 0 && !marginBlocked && !hasMissingPurchasePrice;

  const resetForm = () => {
    setLines([createEmptyLine()]);
    setCustomerId('');
    setSaleDate(new Date().toISOString());
    setPaidAmount('');
    setPaymentMethod('');
    clearDraft();
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
      if (hasMissingPurchasePrice) {
        throw new Error(
          "Vente bloquée : un ou plusieurs produits n'ont pas de prix d'achat défini.",
        );
      }
      if (!allowLowMargin && invalidMarginLines.length > 0) {
        throw new Error(
          "Vous n'avez pas le droit de valider cette vente. La marge minimale autorisée est de 20%.",
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
            discountPercent: l.remisePercent,
          })),
        })
        .then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Vente enregistrée avec succès');
      clearDraft();
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

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/sales/${id}`).then((r) => r.data),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Sale[]>(['sales'], (prev) =>
        prev ? prev.filter((s) => s.id !== id) : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      toast.success('Vente supprimée avec succès');
      setDeleteTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (
        error as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      const text = Array.isArray(msg) ? msg[0] : (msg ?? 'Erreur lors de la suppression');
      toast.error(text);
      setDeleteTarget(null);
    },
  });

  const handleGeneratePdf = (type: DocumentType) => {
    generatePlaceholderPdf(type);
  };

  const today = new Date(saleDate).toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const hasActions = canViewDetails || canDeleteSale;

  return (
    <div className="space-y-4">
      {/* Draft restore banner */}
      {showRestorePrompt && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <RotateCcw size={15} className="shrink-0" />
            <span>Un brouillon non enregistré a été trouvé. Voulez-vous le restaurer&nbsp;?</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleIgnoreDraft}>
              Ignorer
            </Button>
            <Button size="sm" onClick={handleRestoreDraft}>
              Restaurer
            </Button>
          </div>
        </div>
      )}

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
      <ProductRegisterGrid
        lines={lines}
        hasLowMarginPermission={allowLowMargin}
        onLinesChange={setLines}
      />

      {/* Margin warning banner */}
      {(marginBlocked || hasMissingPurchasePrice) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-bold">⚠</span>
          <span>
            {hasMissingPurchasePrice
              ? "Vente bloquée : un ou plusieurs produits n'ont pas de prix d'achat défini."
              : "Vous n'avez pas le droit de valider cette vente. La marge minimale autorisée est de 20%."}
          </span>
        </div>
      )}

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
                    ...(hasActions ? ['Actions'] : []),
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
                    <td
                      colSpan={hasActions ? 8 : 7}
                      className="px-4 py-8 text-center text-sm text-text-muted"
                    >
                      Chargement…
                    </td>
                  </tr>
                ) : (salesQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={hasActions ? 8 : 7}
                      className="px-4 py-8 text-center text-sm text-text-muted"
                    >
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
                        <span
                          className={`app-status-badge ${PAYMENT_COLORS[sale.paymentStatus] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                        >
                          {PAYMENT_LABELS[sale.paymentStatus] ?? sale.paymentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`app-status-badge ${STATUS_COLORS[sale.status] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                        >
                          {SALE_STATUS_LABELS[sale.status] ?? sale.status}
                        </span>
                      </td>
                      {hasActions && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {canViewDetails && (
                              <Button
                                variant="actionView"
                                size="action"
                                title="Voir les détails"
                                onClick={() => setSelectedSaleId(sale.id)}
                              >
                                <Eye size={14} />
                              </Button>
                            )}
                            {canDeleteSale && (
                              <Button
                                variant="actionDelete"
                                size="action"
                                title="Supprimer définitivement"
                                onClick={() => setDeleteTarget(sale)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sale details modal */}
      {selectedSaleId && (
        <SaleDetailsModal
          saleId={selectedSaleId}
          onClose={() => setSelectedSaleId(null)}
        />
      )}

      {deleteTarget && (
        <PermanentDeleteDialog
          label={deleteTarget.invoiceNumber}
          isPending={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
