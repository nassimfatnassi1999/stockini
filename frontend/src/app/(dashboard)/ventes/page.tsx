'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
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
  isFilledLine,
  MIN_MARGIN_PERCENT,
  recalculateLine,
  type DocumentTotals,
  type RegisterLine,
} from '@/lib/stockini/register-utils';
import { generateSalesPDF, type SalesDocumentType } from '@/lib/stockini/salesPdf';
import { money } from '@/lib/stockini/format';
import { stockiniApi } from '@/lib/stockini/api';
import type { Customer, DropdownOption, Sale, SaleDetail } from '@/lib/stockini/types';

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

// Document type config for the form selector
const DOC_TYPES: Array<{
  id: SalesDocumentType;
  label: string;
  saveLabel: string;
}> = [
  { id: 'devis', label: 'Devis', saveLabel: 'Enregistrer le devis' },
  { id: 'bon_commande', label: 'Bon de commande', saveLabel: 'Enregistrer le bon de commande' },
  { id: 'bon_livraison', label: 'Bon de livraison', saveLabel: 'Enregistrer le bon de livraison' },
  { id: 'facture', label: 'Facture', saveLabel: 'Enregistrer la facture' },
];

// PDF action panel buttons
const PDF_ACTIONS: Array<{ type: SalesDocumentType; label: string }> = [
  { type: 'devis', label: 'Générer devis' },
  { type: 'bon_commande', label: 'Générer bon de commande' },
  { type: 'bon_livraison', label: 'Générer bon de livraison' },
  { type: 'facture', label: 'Générer facture' },
];

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

  // Document type state — default is "devis"
  const [documentType, setDocumentType] = useState<SalesDocumentType>('devis');

  // History row selection for PDF panel
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<SalesDocumentType | null>(null);

  useEffect(() => {
    setAllowLowMargin(hasPermission(PERMISSION_LOW_MARGIN));
    setCanViewDetails(hasPermission(PERMISSION_VIEW_DETAILS));
    setCanDeleteSale(hasPermission(PERMISSION_DELETE_SALE));
  }, []);

  const filledLines = lines.filter(isFilledLine);
  const totals = calculateDocumentTotals(lines);
  const paidAmountNum = Number(paidAmount) || 0;

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

  // Company settings for PDF header
  const settingsQuery = useQuery({
    queryKey: ['stockini-settings'],
    queryFn: stockiniApi.settings,
  });
  const settings = useMemo(() => {
    const map: Record<string, string> = {};
    (settingsQuery.data ?? []).forEach((s) => { map[s.key] = s.value; });
    return map;
  }, [settingsQuery.data]);

  const companyInfo = {
    name: settings['company_name'] ?? settings['nom_entreprise'] ?? undefined,
    address: settings['company_address'] ?? settings['adresse'] ?? undefined,
    phone: settings['company_phone'] ?? settings['telephone'] ?? undefined,
    email: settings['company_email'] ?? settings['email'] ?? undefined,
    taxNumber: settings['tax_number'] ?? settings['matricule_fiscal'] ?? undefined,
  };

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

  const handleGeneratePdf = async (docType: SalesDocumentType) => {
    if (!selectedHistoryId) return;
    setPdfLoading(docType);
    try {
      const detail = await api.get<SaleDetail>(`/sales/${selectedHistoryId}`).then((r) => r.data);
      generateSalesPDF(detail, docType, companyInfo);
      toast.success('PDF généré et téléchargé avec succès');
    } catch {
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setPdfLoading(null);
    }
  };

  const today = new Date(saleDate).toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const hasActions = canViewDetails || canDeleteSale;
  const currentDocConfig = DOC_TYPES.find((d) => d.id === documentType)!;
  const colSpan = 1 + 7 + (hasActions ? 1 : 0); // checkbox + cols + actions

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

      {/* Page header */}
      <div>
        <h1 className="app-page-title">Ventes</h1>
        <p className="app-page-subtitle">
          Enregistrement des ventes et documents commerciaux
        </p>
      </div>

      {/* Document type selector tabs */}
      <div className="rounded-lg border border-border/70 bg-white p-1 flex flex-wrap gap-1">
        {DOC_TYPES.map((dt) => (
          <button
            key={dt.id}
            type="button"
            onClick={() => setDocumentType(dt.id)}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              documentType === dt.id
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:bg-muted hover:text-text-primary'
            }`}
          >
            <FileText size={13} />
            {dt.label}
          </button>
        ))}
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
              {createMutation.isPending ? 'Enregistrement…' : currentDocConfig.saveLabel}
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
                  {/* Checkbox column */}
                  <th className="px-3 py-3 w-10 text-center">
                    <span className="sr-only">Sélection</span>
                  </th>
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
                    <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-text-muted">
                      Chargement…
                    </td>
                  </tr>
                ) : (salesQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-text-muted">
                      Aucune vente enregistrée
                    </td>
                  </tr>
                ) : (
                  (salesQuery.data ?? []).map((sale) => {
                    const isSelected = selectedHistoryId === sale.id;
                    return (
                      <tr
                        key={sale.id}
                        className={`hover:bg-muted/40 transition-colors ${isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() =>
                              setSelectedHistoryId(isSelected ? null : sale.id)
                            }
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                            aria-label={`Sélectionner la vente ${sale.invoiceNumber}`}
                          />
                        </td>
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating PDF action panel */}
      {selectedHistoryId && (
        <div className="fixed bottom-6 right-6 z-40 w-64 rounded-xl border border-border/70 bg-white shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          {/* Panel header */}
          <div className="flex items-center justify-between bg-primary/5 border-b border-border/60 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                Générer un document
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {(salesQuery.data ?? []).find((s) => s.id === selectedHistoryId)?.invoiceNumber ?? ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedHistoryId(null)}
              className="rounded-md p-1 text-text-muted hover:bg-muted hover:text-text-primary transition-colors"
              aria-label="Annuler la sélection"
            >
              <X size={15} />
            </button>
          </div>

          {/* PDF buttons */}
          <div className="p-3 space-y-1.5">
            {PDF_ACTIONS.map((action) => (
              <button
                key={action.type}
                type="button"
                disabled={pdfLoading !== null}
                onClick={() => handleGeneratePdf(action.type)}
                className="w-full flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5 text-left text-sm font-medium text-text-primary hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pdfLoading === action.type ? (
                  <Loader2 size={14} className="shrink-0 animate-spin text-primary" />
                ) : (
                  <FileText size={14} className="shrink-0 text-primary/70" />
                )}
                {action.label}
              </button>
            ))}
          </div>

          {/* Cancel button */}
          <div className="border-t border-border/60 px-3 py-2.5">
            <button
              type="button"
              onClick={() => setSelectedHistoryId(null)}
              className="w-full rounded-md py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Annuler la sélection
            </button>
          </div>
        </div>
      )}

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
