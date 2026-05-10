'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ClipboardList, Eye, Package, ReceiptText, Trash2 } from 'lucide-react';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PurchaseRegisterGrid } from '@/components/stockini/register/PurchaseRegisterGrid';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
import {
  calculateDocumentTotals,
  createEmptyLine,
  isFilledLine,
  recalculateLine,
  type RegisterLine,
} from '@/lib/stockini/register-utils';
import { money } from '@/lib/stockini/format';
import type { DropdownOption, Purchase, Supplier } from '@/lib/stockini/types';

type PurchaseDocType = 'BON_COMMANDE' | 'BON_RECEPTION' | 'FACTURE';
type ReceptionMode = 'LIBRE' | 'FROM_COMMANDE';

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}

const DOC_TYPE_CONFIG: Record<
  PurchaseDocType,
  { label: string; saveLabel: string; icon: React.ElementType; color: string }
> = {
  BON_COMMANDE: {
    label: 'Bon de commande',
    saveLabel: 'Enregistrer le bon de commande',
    icon: ClipboardList,
    color: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  BON_RECEPTION: {
    label: 'Bon de réception',
    saveLabel: 'Valider la réception',
    icon: Package,
    color: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  FACTURE: {
    label: 'Facture fournisseur',
    saveLabel: 'Enregistrer la facture',
    icon: ReceiptText,
    color: 'border-violet-200 bg-violet-50 text-violet-700',
  },
};

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

const PURCHASE_STATUS_LABELS: Record<string, string> = {
  ORDERED: 'Commandé',
  RECEIVED: 'Reçu',
  PARTIALLY_RECEIVED: 'Partiellement reçu',
  CANCELLED: 'Annulé',
};

const PURCHASE_STATUS_COLORS: Record<string, string> = {
  ORDERED: 'border-blue-200 bg-blue-50 text-blue-700',
  RECEIVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PARTIALLY_RECEIVED: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  CANCELLED: 'border-red-200 bg-red-50 text-red-700',
};

function fmtCommandeOption(p: Purchase): string {
  const supplier = p.supplier?.name ?? 'Fournisseur inconnu';
  const count = p.items?.length ?? 0;
  const totalStr = money(p.total);
  const partial = p.status === 'PARTIALLY_RECEIVED' ? ' · partiel' : '';
  return `${p.orderNumber} — ${supplier} — ${count} article${count !== 1 ? 's' : ''} — ${totalStr}${partial}`;
}

export default function AchatsPage() {
  const queryClient = useQueryClient();

  const [docType, setDocType] = useState<PurchaseDocType>('BON_COMMANDE');
  const [receptionMode, setReceptionMode] = useState<ReceptionMode>('LIBRE');
  const [selectedCommandeId, setSelectedCommandeId] = useState('');
  const [commandeLineMap, setCommandeLineMap] = useState<
    Record<string, { purchaseItemId: string; maxQty: number }>
  >({});
  const [lines, setLines] = useState<RegisterLine[]>([createEmptyLine()]);
  const [supplierId, setSupplierId] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  const suppliersQuery = useQuery<Supplier[]>({
    queryKey: ['stockini-suppliers'],
    queryFn: stockiniApi.suppliers,
  });

  const purchasesQuery = useQuery<Purchase[]>({
    queryKey: ['stockini-purchases'],
    queryFn: stockiniApi.purchases,
  });

  const paymentMethodsQuery = useQuery<DropdownOption[]>({
    queryKey: ['stockini-dropdown-options', 'payment_methods'],
    queryFn: () => stockiniApi.dropdownOptionsByCategory('payment_methods'),
  });

  const commandeDetailQuery = useQuery({
    queryKey: ['stockini-purchase', selectedCommandeId],
    queryFn: () => stockiniApi.purchase(selectedCommandeId),
    enabled: !!selectedCommandeId && docType === 'BON_RECEPTION' && receptionMode === 'FROM_COMMANDE',
  });

  const commandesToReceptionner = (purchasesQuery.data ?? []).filter(
    (p) => p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED',
  );

  // Populate form lines when a commande detail loads
  useEffect(() => {
    const detail = commandeDetailQuery.data;
    if (!detail || !selectedCommandeId) return;

    setSupplierId(detail.supplier?.id ?? '');

    const remainingItems = detail.items.filter(
      (item) => item.receivedQuantity < item.quantity,
    );

    if (remainingItems.length === 0) {
      setLines([createEmptyLine()]);
      setCommandeLineMap({});
      return;
    }

    const newLineMap: Record<string, { purchaseItemId: string; maxQty: number }> = {};

    const newLines: RegisterLine[] = remainingItems.map((item) => {
      const lineId = crypto.randomUUID();
      const maxQty = item.quantity - item.receivedQuantity;
      newLineMap[lineId] = { purchaseItemId: item.id, maxQty };

      const puHt = round3(Number(item.unitCost));
      return recalculateLine({
        id: lineId,
        productId: item.productId,
        reference: item.product?.reference ?? '',
        designation: item.product?.name ?? '',
        location: '',
        brand: '',
        quantity: maxQty,
        puHt,
        purchasePriceHt: puHt,
        remisePercent: 0,
        tvaPercent: 19,
        netHt: 0,
        netTtc: 0,
        margePercent: null,
        margeAmount: null,
      });
    });

    setLines(newLines);
    setCommandeLineMap(newLineMap);
  }, [commandeDetailQuery.data, selectedCommandeId]);

  // Clear lines when commande is deselected
  useEffect(() => {
    if (!selectedCommandeId && receptionMode === 'FROM_COMMANDE') {
      setLines([createEmptyLine()]);
      setCommandeLineMap({});
      setSupplierId('');
    }
  }, [selectedCommandeId, receptionMode]);

  const isFromCommande = docType === 'BON_RECEPTION' && receptionMode === 'FROM_COMMANDE';

  const filledLines = lines.filter(isFilledLine);
  const totals = calculateDocumentTotals(lines);
  const paidAmountNum = Number(paidAmount) || 0;

  const hasQtyOverrun =
    isFromCommande &&
    filledLines.some((l) => {
      const map = commandeLineMap[l.id];
      return map && l.quantity > map.maxQty;
    });

  const canSave = isFromCommande
    ? !!selectedCommandeId &&
      filledLines.length > 0 &&
      !hasQtyOverrun &&
      filledLines.every((l) => commandeLineMap[l.id]?.purchaseItemId && l.quantity > 0)
    : filledLines.length > 0 &&
      filledLines.every((l) => l.productId !== null) &&
      !!supplierId;

  const resetForm = () => {
    setLines([createEmptyLine()]);
    setSupplierId('');
    setPaidAmount('');
    setPaymentMethod('');
    setSelectedCommandeId('');
    setCommandeLineMap({});
  };

  const handleDocTypeChange = (type: PurchaseDocType) => {
    if (type === docType) return;
    setDocType(type);
    resetForm();
  };

  const handleReceptionModeChange = (mode: ReceptionMode) => {
    if (mode === receptionMode) return;
    setReceptionMode(mode);
    resetForm();
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (filledLines.length === 0) {
        throw new Error("Ajoutez au moins une ligne produit avant d'enregistrer");
      }

      if (isFromCommande) {
        if (!selectedCommandeId) throw new Error('Veuillez sélectionner un bon de commande');

        const overQty = filledLines.find((l) => {
          const map = commandeLineMap[l.id];
          return map && l.quantity > map.maxQty;
        });
        if (overQty) {
          throw new Error(
            `La quantité reçue dépasse le reliquat pour "${overQty.designation || overQty.reference}"`,
          );
        }

        const receiveItems = filledLines
          .filter((l) => commandeLineMap[l.id] && l.quantity > 0)
          .map((l) => ({
            purchaseItemId: commandeLineMap[l.id].purchaseItemId,
            quantity: l.quantity,
          }));

        if (receiveItems.length === 0) throw new Error('Aucune ligne à réceptionner');

        return stockiniApi.receivePurchase(selectedCommandeId, receiveItems);
      }

      // Standard flow: LIBRE / BON_COMMANDE / FACTURE
      const missingProduct = filledLines.find((l) => l.productId === null);
      if (missingProduct) {
        throw new Error(
          `La ligne "${missingProduct.designation || missingProduct.reference}" n'est pas liée à un produit du stock`,
        );
      }
      if (!supplierId) throw new Error('Veuillez sélectionner un fournisseur');

      const payload = {
        supplierId,
        discount: round3(totals.totalRemise),
        tax: round3(totals.totalTva),
        paidAmount: docType === 'FACTURE' ? round3(paidAmountNum) : 0,
        items: filledLines.map((l) => ({
          productId: l.productId!,
          quantity: l.quantity,
          unitCost: round3(l.puHt),
        })),
      };

      const purchase = await stockiniApi.createPurchase(payload);

      if (docType === 'BON_RECEPTION') {
        const receiveItems =
          (
            purchase as Purchase & { items: Array<{ id: string; quantity: number }> }
          ).items?.map((item) => ({
            purchaseItemId: item.id,
            quantity: item.quantity,
          })) ?? [];

        if (receiveItems.length > 0) {
          await stockiniApi.receivePurchase(purchase.id, receiveItems);
        }
      }

      return purchase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-movements'] });
      if (selectedCommandeId) {
        queryClient.invalidateQueries({ queryKey: ['stockini-purchase', selectedCommandeId] });
      }

      const label = isFromCommande
        ? 'Réception validée — stock mis à jour'
        : docType === 'BON_COMMANDE'
          ? 'Bon de commande créé'
          : docType === 'BON_RECEPTION'
            ? 'Bon de réception validé — stock mis à jour'
            : 'Facture enregistrée';
      toast.success(label);
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => stockiniApi.deletePurchase(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Purchase[]>(['stockini-purchases'], (prev) =>
        prev ? prev.filter((p) => p.id !== id) : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      toast.success('Achat supprimé');
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

  const today = new Date().toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const activeConfig = DOC_TYPE_CONFIG[docType];
  const selectedCommandeSupplier = commandeDetailQuery.data?.supplier?.name;

  const saveButtonLabel = createMutation.isPending
    ? 'Enregistrement…'
    : isFromCommande
      ? 'Valider la réception et mettre à jour le stock'
      : activeConfig.saveLabel;

  return (
    <div className="space-y-4">
      {/* Page header + document type buttons */}
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <h1 className="app-page-title">Achats</h1>
          <p className="app-page-subtitle">
            Gestion des commandes, réceptions et factures fournisseurs
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DOC_TYPE_CONFIG) as PurchaseDocType[]).map((type) => {
            const cfg = DOC_TYPE_CONFIG[type];
            const Icon = cfg.icon;
            const isActive = docType === type;
            return (
              <Button
                key={type}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleDocTypeChange(type)}
              >
                <Icon size={14} />
                {cfg.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Active document type indicator */}
      <div className={`rounded-lg border px-4 py-2 text-sm font-medium ${activeConfig.color}`}>
        {docType === 'BON_COMMANDE' &&
          'Bon de commande — crée une commande fournisseur sans modifier le stock'}
        {docType === 'BON_RECEPTION' &&
          'Bon de réception — ajoute les quantités au stock lors de la validation'}
        {docType === 'FACTURE' &&
          'Facture fournisseur — enregistre le document de facturation avec paiement'}
      </div>

      {/* Reception mode selector (BON_RECEPTION only) */}
      {docType === 'BON_RECEPTION' && (
        <div className="rounded-lg border border-border/70 bg-white p-4 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleReceptionModeChange('LIBRE')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                receptionMode === 'LIBRE'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-border/60 bg-surface text-text-secondary hover:border-emerald-200 hover:text-emerald-700'
              }`}
            >
              Réception libre
            </button>
            <button
              type="button"
              onClick={() => handleReceptionModeChange('FROM_COMMANDE')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                receptionMode === 'FROM_COMMANDE'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-border/60 bg-surface text-text-secondary hover:border-emerald-200 hover:text-emerald-700'
              }`}
            >
              Depuis bon de commande
            </button>
          </div>

          {receptionMode === 'FROM_COMMANDE' && (
            <div className="space-y-1.5">
              <Label htmlFor="commande-picker">Bon de commande à réceptionner</Label>
              {commandesToReceptionner.length === 0 ? (
                <p className="text-sm text-text-muted py-1">
                  Aucun bon de commande en attente de réception.
                </p>
              ) : (
                <select
                  id="commande-picker"
                  value={selectedCommandeId}
                  onChange={(e) => setSelectedCommandeId(e.target.value)}
                  className="app-select"
                >
                  <option value="">— Sélectionner un bon de commande —</option>
                  {commandesToReceptionner.map((p) => (
                    <option key={p.id} value={p.id}>
                      {fmtCommandeOption(p)}
                    </option>
                  ))}
                </select>
              )}
              {commandeDetailQuery.isLoading && (
                <p className="text-xs text-text-muted">Chargement des lignes…</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Document header: supplier + date */}
      <div className="rounded-lg border border-border/70 bg-white p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] max-w-sm space-y-1.5">
            <Label htmlFor="purchase-supplier">Fournisseur</Label>
            {isFromCommande && selectedCommandeId ? (
              <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-text-secondary whitespace-nowrap">
                {selectedCommandeSupplier ?? '—'}
              </div>
            ) : (
              <select
                id="purchase-supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="app-select"
                disabled={isFromCommande}
              >
                <option value="">— Sélectionner un fournisseur —</option>
                {(suppliersQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-text-secondary whitespace-nowrap">
              {today}
            </div>
          </div>
        </div>
      </div>

      {/* Purchase lines grid */}
      <PurchaseRegisterGrid lines={lines} onLinesChange={setLines} />

      {/* Warnings */}
      {!isFromCommande && filledLines.some((l) => l.productId === null) && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700 flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-bold">⚠</span>
          <span>
            Une ou plusieurs lignes ne sont pas liées à un produit du stock. Sélectionnez un
            produit via la liste déroulante.
          </span>
        </div>
      )}

      {hasQtyOverrun && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700 flex items-start gap-2">
          <span className="mt-0.5 shrink-0 font-bold">⚠</span>
          <span>
            Une ou plusieurs quantités dépassent les quantités restantes à réceptionner. Corrigez
            avant de valider.
          </span>
        </div>
      )}

      {/* Payment section + save */}
      <div className="rounded-lg border border-border/70 bg-white p-4">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            {docType === 'FACTURE' && (
              <>
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
              </>
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
              {saveButtonLabel}
            </Button>
          </div>
        </div>
      </div>

      {/* Purchase history */}
      <div className="rounded-lg border border-border/70 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-border/70 text-sm font-semibold text-text-primary hover:bg-surface transition-colors"
        >
          <span>Historique des achats ({purchasesQuery.data?.length ?? 0})</span>
          {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showHistory && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="border-b border-border/60">
                  {[
                    'N° Document',
                    'Fournisseur',
                    'Date',
                    'Articles',
                    'Total TTC',
                    'Paiement',
                    'Statut',
                    'Actions',
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
                {purchasesQuery.isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-text-muted">
                      Chargement…
                    </td>
                  </tr>
                ) : (purchasesQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-text-muted">
                      Aucun achat enregistré
                    </td>
                  </tr>
                ) : (
                  (purchasesQuery.data ?? []).map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono font-semibold text-xs">
                        {purchase.orderNumber}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {purchase.supplier?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {new Date(purchase.createdAt).toLocaleDateString('fr-TN')}
                      </td>
                      <td className="px-4 py-3 text-center text-text-secondary">
                        {purchase.items?.length ?? 0}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium">
                        {money(purchase.total)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`app-status-badge ${PAYMENT_COLORS[purchase.paymentStatus] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                        >
                          {PAYMENT_LABELS[purchase.paymentStatus] ?? purchase.paymentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`app-status-badge ${PURCHASE_STATUS_COLORS[purchase.status] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                        >
                          {PURCHASE_STATUS_LABELS[purchase.status] ?? purchase.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="actionView"
                            size="action"
                            title="Voir les détails"
                            onClick={() => setSelectedPurchaseId(purchase.id)}
                          >
                            <Eye size={14} />
                          </Button>
                          <Button
                            variant="actionDelete"
                            size="action"
                            title="Supprimer"
                            onClick={() => setDeleteTarget(purchase)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedPurchaseId && (
        <PurchaseDetailsModal
          purchaseId={selectedPurchaseId}
          onClose={() => setSelectedPurchaseId(null)}
        />
      )}

      {deleteTarget && (
        <PermanentDeleteDialog
          label={deleteTarget.orderNumber}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function PurchaseDetailsModal({
  purchaseId,
  onClose,
}: {
  purchaseId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['stockini-purchase', purchaseId],
    queryFn: () => stockiniApi.purchase(purchaseId),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary">
            Détails achat {data?.orderNumber ?? '…'}
          </h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-muted"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">
          {isLoading ? (
            <p className="text-sm text-text-muted">Chargement…</p>
          ) : data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-text-muted">Fournisseur</span>
                  <p className="font-medium">{data.supplier?.name ?? '—'}</p>
                </div>
                <div>
                  <span className="text-text-muted">Statut</span>
                  <p className="font-medium">
                    {PURCHASE_STATUS_LABELS[data.status] ?? data.status}
                  </p>
                </div>
                <div>
                  <span className="text-text-muted">Total TTC</span>
                  <p className="font-mono font-semibold">{money(data.total)}</p>
                </div>
                <div>
                  <span className="text-text-muted">Montant payé</span>
                  <p className="font-mono font-semibold text-emerald-600">
                    {money(data.paidAmount)}
                  </p>
                </div>
              </div>
              <table className="w-full text-xs border border-border/60 rounded">
                <thead className="bg-surface">
                  <tr>
                    {['Produit', 'Qté commandée', 'Qté reçue', 'PU Achat HT', 'Total'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.product?.name ?? item.productId}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span
                          className={
                            item.receivedQuantity >= item.quantity
                              ? 'text-emerald-600 font-semibold'
                              : item.receivedQuantity > 0
                                ? 'text-yellow-600'
                                : 'text-text-muted'
                          }
                        >
                          {item.receivedQuantity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(item.unitCost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {money(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-red-600">Impossible de charger les détails.</p>
          )}
        </div>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}
