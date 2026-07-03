'use client';

import { useCallback, useEffect, useId, useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, CreditCard, Eye, Package, ReceiptText, RotateCcw, Trash2 } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { KebabMenu } from '@/components/stockini/shared/KebabMenu';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import { generateClientId } from '@/lib/id';
import { useFormDraft } from '@/hooks/useFormDraft';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PurchaseRegisterGrid } from '@/components/stockini/register/PurchaseRegisterGrid';
import { MoveToTrashDialog } from '@/components/stockini/MoveToTrashDialog';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { usePermissions } from '@/lib/hooks/usePermissions';
import {
  calculateDocumentTotals,
  createEmptyLine,
  isFilledLine,
  recalculateLine,
  type RegisterLine,
} from '@/lib/stockini/register-utils';
import { isPurchaseOrder, money } from '@/lib/stockini/format';
import type { DropdownOption, PaginatedResponse, Purchase, PurchasesQueryParams, Supplier } from '@/lib/stockini/types';
import { HistoryToolbar } from '@/components/stockini/shared/HistoryToolbar';

type PurchaseDocType = 'BON_COMMANDE' | 'BON_RECEPTION' | 'FACTURE';
type ReceptionMode = 'LIBRE' | 'FROM_COMMANDE';

interface AchatDraft {
  docType: PurchaseDocType;
  receptionMode: ReceptionMode;
  lines: import('@/lib/stockini/register-utils').RegisterLine[];
  supplierId: string;
  paidAmount: string;
  paymentMethod: string;
  selectedCommandeId: string;
  commandeLineMap: Record<string, { purchaseItemId: string; maxQty: number }>;
  purchaseDate: string;
}

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
  const { can } = usePermissions();
  const initialLineId = useId();

  const [docType, setDocType] = useState<PurchaseDocType>('BON_COMMANDE');
  const [receptionMode, setReceptionMode] = useState<ReceptionMode>('LIBRE');
  const [selectedCommandeId, setSelectedCommandeId] = useState('');
  const [commandeLineMap, setCommandeLineMap] = useState<
    Record<string, { purchaseItemId: string; maxQty: number }>
  >({});
  const [lines, setLines] = useState<RegisterLine[]>(() => [createEmptyLine(initialLineId)]);
  const [supplierId, setSupplierId] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString());
  const [showHistory, setShowHistory] = useState(true);
  const restoredCommandeRef = useRef('');

  // ── Purchases history pagination + filters ────────────────────────────────
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [purchasesLimit, setPurchasesLimit] = useState(5);
  const [purchasesSearch, setPurchasesSearch] = useState('');
  const [purchasesLocalSearch, setPurchasesLocalSearch] = useState('');
  const [purchasesStatus, setPurchasesStatus] = useState('');
  const purchasesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePurchasesSearchChange = (value: string) => {
    setPurchasesLocalSearch(value);
    if (purchasesDebounceRef.current) clearTimeout(purchasesDebounceRef.current);
    purchasesDebounceRef.current = setTimeout(() => {
      setPurchasesSearch(value);
      setPurchasesPage(1);
    }, 300);
  };

  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  const suppliersQuery = useQuery<Supplier[]>({
    queryKey: ['stockini-suppliers'],
    queryFn: stockiniApi.suppliers,
  });

  const purchasesQueryParams: PurchasesQueryParams = {
    page: purchasesPage,
    limit: purchasesLimit,
    search: purchasesSearch || undefined,
    status: purchasesStatus || undefined,
  };

  const purchasesQuery = useQuery<PaginatedResponse<Purchase>>({
    queryKey: ['stockini-purchases', purchasesPage, purchasesLimit, purchasesSearch, purchasesStatus],
    queryFn: () => stockiniApi.purchases(purchasesQueryParams),
    placeholderData: (prev) => prev,
  });
  const purchasesList: Purchase[] = Array.isArray(purchasesQuery.data?.data) ? purchasesQuery.data.data : [];

  const paymentMethodsQuery = useQuery<DropdownOption[]>({
    queryKey: ['stockini-dropdown-options', 'payment_methods'],
    queryFn: () => stockiniApi.dropdownOptionsByCategory('payment_methods'),
  });

  const commandeDetailQuery = useQuery({
    queryKey: ['stockini-purchase', selectedCommandeId],
    queryFn: () => stockiniApi.purchase(selectedCommandeId),
    enabled: !!selectedCommandeId && docType === 'BON_RECEPTION' && receptionMode === 'FROM_COMMANDE',
  });

  const draftData = useMemo<AchatDraft>(
    () => ({ docType, receptionMode, lines, supplierId, paidAmount, paymentMethod, selectedCommandeId, commandeLineMap, purchaseDate }),
    [docType, receptionMode, lines, supplierId, paidAmount, paymentMethod, selectedCommandeId, commandeLineMap, purchaseDate],
  );
  const restoreDraft = useCallback((draft: AchatDraft) => {
    setDocType(draft.docType ?? 'BON_COMMANDE');
    setReceptionMode(draft.receptionMode ?? 'LIBRE');
    setLines(
      draft.lines?.length
        ? draft.lines.map((line) => recalculateLine({
            ...createEmptyLine(),
            ...line,
            id: line.id || generateClientId(),
            productId: line.productId ?? null,
            quantity: Number(line.quantity) || 0,
            puHt: Number(line.puHt) || 0,
            remisePercent: Number(line.remisePercent) || 0,
            tvaPercent: Number(line.tvaPercent) || 0,
          }))
        : [createEmptyLine()],
    );
    setSupplierId(draft.supplierId ?? '');
    setPaidAmount(draft.paidAmount ?? '');
    setPaymentMethod(draft.paymentMethod ?? '');
    setSelectedCommandeId(draft.selectedCommandeId ?? '');
    setCommandeLineMap(draft.commandeLineMap ?? {});
    setPurchaseDate(draft.purchaseDate ?? new Date().toISOString());
    restoredCommandeRef.current = draft.selectedCommandeId ?? '';
  }, []);
  const isDraftEmpty = useCallback(
    (draft: AchatDraft) =>
      !draft.lines.some(isFilledLine) &&
      !draft.supplierId &&
      !draft.paidAmount &&
      !draft.paymentMethod &&
      !draft.selectedCommandeId,
    [],
  );
  const { clearDraft, status: draftStatus } = useFormDraft<AchatDraft>({
    key: 'stockini:purchases:create:draft',
    data: draftData,
    isEmpty: isDraftEmpty,
    onRestore: restoreDraft,
    debounceMs: 400,
  });

  const commandesToReceptionner = purchasesList.filter(
    (p) => p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED',
  );

  // Populate form lines when a commande detail loads
  useEffect(() => {
    const detail = commandeDetailQuery.data;
    if (!detail || !selectedCommandeId) return;
    if (restoredCommandeRef.current === selectedCommandeId) {
      restoredCommandeRef.current = '';
      return;
    }

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
      const lineId = generateClientId();
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
        defaultMarginPercent: 0,
        remisePercent: 0,
        tvaPercent: 19,
        netHt: 0,
        netTtc: 0,
        margePercent: null,
        margeAmount: null,
        manualUnitPriceHt: false,
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

  const resetForm = (notify = false) => {
    setLines([createEmptyLine()]);
    setSupplierId('');
    setPaidAmount('');
    setPaymentMethod('');
    setSelectedCommandeId('');
    setCommandeLineMap({});
    setPurchaseDate(new Date().toISOString());
    clearDraft();
    if (notify) toast.success('Brouillon supprimé.');
  };

  const handleDocTypeChange = (type: PurchaseDocType) => {
    if (type === docType) return;
    resetForm();
    setDocType(type);
  };

  const handleReceptionModeChange = (mode: ReceptionMode) => {
    if (mode === receptionMode) return;
    resetForm();
    setReceptionMode(mode);
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
        items: filledLines.map((l) => ({
          productId: l.productId!,
          quantity: l.quantity,
          unitCost: round3(l.puHt),
        })),
      };

      const purchase = await stockiniApi.createPurchase(payload);

      // Transformer immédiatement en BR ou FACTURE_FOURNISSEUR selon le type choisi.
      // createPurchase crée toujours un BON_COMMANDE ; transform() règle documentType,
      // paymentStatus=UNPAID et met à jour le stock pour les BR.
      if (docType === 'BON_RECEPTION') {
        await stockiniApi.transformPurchase(purchase.id, 'BON_RECEPTION');
      } else if (docType === 'FACTURE') {
        await stockiniApi.transformPurchase(purchase.id, 'FACTURE_FOURNISSEUR');
      }

      return purchase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-caisse'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payable-purchases'] });
      if (selectedCommandeId) {
        queryClient.invalidateQueries({ queryKey: ['stockini-purchase', selectedCommandeId] });
      }

      const label = isFromCommande
        ? 'Réception validée — stock mis à jour, paiement à effectuer'
        : docType === 'BON_COMMANDE'
          ? 'Bon de commande créé'
          : docType === 'BON_RECEPTION'
            ? 'Bon de réception validé — stock mis à jour, paiement à effectuer'
            : 'Facture enregistrée';
      toast.success(label);
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => stockiniApi.deletePurchase(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Achat déplacé dans la corbeille');
      setDeleteTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (
        error as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      const text = Array.isArray(msg) ? msg[0] : (msg ?? 'Erreur lors du déplacement dans la corbeille');
      toast.error(text);
      setDeleteTarget(null);
    },
  });

  const [payTarget, setPayTarget] = useState<Purchase | null>(null);

  const today = useMemo(
    () => new Date(purchaseDate).toLocaleDateString('fr-TN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    [purchaseDate],
  );

  const activeConfig = DOC_TYPE_CONFIG[docType];
  const selectedCommandeSupplier = commandeDetailQuery.data?.supplier?.name;

  const saveButtonLabel = createMutation.isPending
    ? 'Enregistrement…'
    : isFromCommande
      ? 'Valider la réception et mettre à jour le stock'
      : activeConfig.saveLabel;

  return (
    <PermissionGuard permission="purchases.view">
    <div className="space-y-4">
      {/* Page header + document type buttons */}
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div>
          <h1 className="app-page-title">Achats</h1>
          <p className="app-page-subtitle">
            Gestion des commandes, réceptions et factures fournisseurs
          </p>
          {draftStatus !== 'idle' && (
            <span className="text-xs text-text-muted" role="status">
              {draftStatus === 'restored' ? 'Brouillon restauré' : 'Brouillon sauvegardé'}
            </span>
          )}
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
                {supplierId && suppliersQuery.isSuccess && !(suppliersQuery.data ?? []).some((s) => s.id === supplierId) && (
                  <option value={supplierId}>Fournisseur indisponible (brouillon)</option>
                )}
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
            <Button type="button" variant="outline" size="sm" onClick={() => resetForm(true)}>
              Réinitialiser
            </Button>
            {can('purchases.create') && (
              <Button
                type="button"
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={!canSave || createMutation.isPending}
              >
                {saveButtonLabel}
              </Button>
            )}
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
          <span>Historique des achats ({purchasesQuery.data?.total ?? purchasesList.length})</span>
          {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showHistory && (
          <>
          <HistoryToolbar
            search={purchasesLocalSearch}
            onSearch={handlePurchasesSearchChange}
            searchPlaceholder="Rechercher document, fournisseur…"
            filters={[
              {
                key: 'status',
                type: 'select',
                options: [
                  { value: '', label: 'Tous les statuts' },
                  { value: 'ORDERED', label: 'Commandé' },
                  { value: 'RECEIVED', label: 'Reçu' },
                  { value: 'PARTIALLY_RECEIVED', label: 'Partiellement reçu' },
                  { value: 'CANCELLED', label: 'Annulé' },
                ],
              },
            ]}
            filterValues={{ status: purchasesStatus }}
            onFilterChange={(key, value) => {
              if (key === 'status') { setPurchasesStatus(value); setPurchasesPage(1); }
            }}
            resultsCount={purchasesQuery.data?.total ?? 0}
            onReset={() => {
              handlePurchasesSearchChange('');
              setPurchasesStatus('');
              setPurchasesPage(1);
            }}
            isFetching={purchasesQuery.isFetching}
          />
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
                ) : purchasesList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-text-muted">
                      Aucun achat enregistré
                    </td>
                  </tr>
                ) : (
                  purchasesList.map((purchase) => (
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
                        {isPurchaseOrder(purchase.documentType) ? (
                          <span className="text-gray-400" aria-label="Non payable">—</span>
                        ) : (
                          <span
                            className={`app-status-badge ${PAYMENT_COLORS[purchase.paymentStatus] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                          >
                            {PAYMENT_LABELS[purchase.paymentStatus] ?? purchase.paymentStatus}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`app-status-badge ${PURCHASE_STATUS_COLORS[purchase.status] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                        >
                          {PURCHASE_STATUS_LABELS[purchase.status] ?? purchase.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <KebabMenu
                          items={[
                            {
                              label: 'Voir les détails',
                              icon: <Eye size={14} />,
                              onClick: () => setSelectedPurchaseId(purchase.id),
                            },
                            {
                              label: 'Payer',
                              icon: <CreditCard size={14} />,
                              onClick: () => setPayTarget(purchase),
                              hidden: isPurchaseOrder(purchase.documentType) || purchase.paymentStatus === 'PAID' || (purchase.status !== 'RECEIVED' && purchase.status !== 'PARTIALLY_RECEIVED'),
                            },
                            {
                              label: 'Supprimer',
                              icon: <Trash2 size={14} />,
                              onClick: () => setDeleteTarget(purchase),
                              variant: 'destructive',
                              hidden: !can('purchases.delete'),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-text-muted">
              <span className="text-xs">Lignes par page&nbsp;:</span>
              <select
                value={purchasesLimit}
                onChange={(e) => { setPurchasesLimit(Number(e.target.value)); setPurchasesPage(1); }}
                className="h-7 rounded-md border border-border bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {[5, 10, 20, 30, 100].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 text-text-muted">
              {(purchasesQuery.data?.total ?? 0) > 0 && (
                <span className="text-xs">
                  {(purchasesPage - 1) * purchasesLimit + 1}–{Math.min(purchasesPage * purchasesLimit, purchasesQuery.data?.total ?? 0)} sur {purchasesQuery.data?.total ?? 0}
                </span>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPurchasesPage((p) => p - 1)}
                  disabled={purchasesPage <= 1 || purchasesQuery.isFetching}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white text-text-muted transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Page précédente"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="min-w-[80px] text-center text-xs font-medium text-text-primary">
                  Page {purchasesPage} / {Math.max(purchasesQuery.data?.totalPages ?? 1, 1)}
                </span>
                <button
                  type="button"
                  onClick={() => setPurchasesPage((p) => p + 1)}
                  disabled={purchasesPage >= (purchasesQuery.data?.totalPages ?? 1) || purchasesQuery.isFetching}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white text-text-muted transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Page suivante"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
          </>
        )}
      </div>

      {selectedPurchaseId && (
        <PurchaseDetailsModal
          purchaseId={selectedPurchaseId}
          onClose={() => setSelectedPurchaseId(null)}
        />
      )}

      {deleteTarget && (
        <MoveToTrashDialog
          label={deleteTarget.orderNumber}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {payTarget && (
        <PayPurchaseModal
          purchase={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
            queryClient.invalidateQueries({ queryKey: ['stockini-caisse'] });
            queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
            setPayTarget(null);
          }}
        />
      )}
    </div>
    </PermissionGuard>
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
    <SlideOver
      title="Détails achat"
      subtitle={data?.orderNumber}
      open={true}
      onClose={onClose}
      width={640}
      footer={<Button type="button" variant="outline" size="sm" onClick={onClose}>Fermer</Button>}
    >
      {isLoading ? (
        <p className="text-sm text-text-muted">Chargement…</p>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-text-muted">Fournisseur</span>
              <p className="font-medium">{data.supplier?.name ?? '—'}</p>
            </div>
            <div>
              <span className="text-text-muted">Statut</span>
              <p className="font-medium">{PURCHASE_STATUS_LABELS[data.status] ?? data.status}</p>
            </div>
            <div>
              <span className="text-text-muted">Total TTC</span>
              <p className="font-mono font-semibold">{money(data.total)}</p>
            </div>
            <div>
              <span className="text-text-muted">Montant payé</span>
              <p className="font-mono font-semibold text-emerald-600">{money(data.paidAmount)}</p>
            </div>
          </div>
          <table className="w-full text-xs border border-border/60 rounded">
            <thead className="bg-surface">
              <tr>
                {['Produit', 'Qté commandée', 'Qté reçue', 'PU Achat HT', 'Total'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">{item.product?.name ?? item.productId}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={item.receivedQuantity >= item.quantity ? 'text-emerald-600 font-semibold' : item.receivedQuantity > 0 ? 'text-yellow-600' : 'text-text-muted'}>
                      {item.receivedQuantity}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(item.unitCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{money(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-red-600">Impossible de charger les détails.</p>
      )}
    </SlideOver>
  );
}

function PayPurchaseModal({
  purchase,
  onClose,
  onSuccess,
}: {
  purchase: Purchase;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const remaining = Number(purchase.remainingAmount ?? purchase.total) - Number(purchase.paidAmount ?? 0);
  const resteAPayer = Math.max(remaining, 0);

  const [montant, setMontant] = useState(String(resteAPayer.toFixed(3)));
  const [method, setMethod] = useState('CASH');

  const paymentMethodsQuery = useQuery<DropdownOption[]>({
    queryKey: ['stockini-dropdown-options', 'payment_methods'],
    queryFn: () => stockiniApi.dropdownOptionsByCategory('payment_methods'),
  });

  const payMutation = useMutation({
    mutationFn: () => stockiniApi.payPurchase(purchase.id, { amount: Number(montant), method }),
    onSuccess: () => {
      toast.success('Paiement enregistré — caisse débitée');
      onSuccess();
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const text = Array.isArray(msg) ? msg[0] : (msg ?? (error as Error).message ?? 'Erreur lors du paiement');
      toast.error(text);
    },
  });

  const montantNum = Number(montant) || 0;
  const canPay = montantNum > 0 && montantNum <= resteAPayer + 0.001 && !!method && !payMutation.isPending;

  return (
    <SlideOver
      title="Payer"
      subtitle={purchase.orderNumber}
      open={true}
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button type="button" size="sm" onClick={() => payMutation.mutate()} disabled={!canPay}>
            {payMutation.isPending ? 'Enregistrement…' : 'Confirmer le paiement'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm rounded-lg border border-border/60 bg-surface p-3">
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wide">Fournisseur</p>
            <p className="font-medium">{purchase.supplier?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wide">Total TTC</p>
            <p className="font-mono font-semibold">{money(purchase.total)}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wide">Déjà payé</p>
            <p className="font-mono text-emerald-600">{money(purchase.paidAmount)}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wide">Reste à payer</p>
            <p className="font-mono font-semibold text-red-600">{money(resteAPayer)}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pay-montant">Montant à payer (DT)</Label>
          <Input
            id="pay-montant"
            type="number"
            min={0.001}
            max={resteAPayer}
            step={0.001}
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="0.000"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pay-method">Méthode de paiement</Label>
          <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)} className="app-select">
            <option value="CASH">Espèces</option>
            {(paymentMethodsQuery.data ?? []).map((opt) => (
              <option key={opt.id} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    </SlideOver>
  );
}
