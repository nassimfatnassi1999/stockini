'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  Loader2,
  Mail,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useDraftSave } from '@/lib/hooks/useDraftSave';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProductRegisterGrid } from '@/components/stockini/register/ProductRegisterGrid';
import { SaleDetailsModal } from '@/components/stockini/SaleDetailsModal';
import { MoveToTrashDialog } from '@/components/stockini/MoveToTrashDialog';
import { EmailToast } from '@/components/stockini/EmailToast';
import { GeneratedDocumentsHistory } from '@/components/stockini/GeneratedDocumentsHistory';
import { AvoirPage } from '@/components/stockini/pages/AvoirPage';
import {
  calculateDocumentTotals,
  createEmptyLine,
  isFilledLine,
  MIN_MARGIN_PERCENT,
  recalculateSaleLine,
  type DocumentTotals,
  type RegisterLine,
} from '@/lib/stockini/register-utils';
import { getPaymentDisplay, money } from '@/lib/stockini/format';
import { stockiniApi } from '@/lib/stockini/api';
import { cn } from '@/lib/utils';
import type {
  Customer,
  DropdownOption,
  EmailPreview,
  PaginatedResponse,
  Sale,
  SaleDetail,
  SalesDocumentType,
} from '@/lib/stockini/types';

const PERMISSION_LOW_MARGIN = 'sales.allow_low_margin';
const PERMISSION_VIEW_DETAILS = 'sales.view_details';
const PERMISSION_DELETE_SALE = 'sales.delete';

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}


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

type TabType = SalesDocumentType | 'AVOIR_TAB';

const DOC_TYPES: Array<{ id: SalesDocumentType; label: string; saveLabel: string }> = [
  { id: 'DEVIS', label: 'Devis', saveLabel: 'Enregistrer le devis' },
  { id: 'BON_COMMANDE', label: 'Bon de commande', saveLabel: 'Enregistrer le bon de commande' },
  { id: 'BON_LIVRAISON', label: 'Bon de livraison', saveLabel: 'Enregistrer le bon de livraison' },
  { id: 'FACTURE', label: 'Facture', saveLabel: 'Enregistrer la facture' },
];

const SALES_DOCUMENT_TYPES = new Set<SalesDocumentType>([
  'DEVIS',
  'BON_COMMANDE',
  'BON_LIVRAISON',
  'FACTURE',
  'AVOIR',
]);

const SALES_API_DOCUMENT_TYPES = new Set<SalesDocumentType>([
  'DEVIS',
  'BON_COMMANDE',
  'BON_LIVRAISON',
  'FACTURE',
]);

const PDF_ACTIONS: Array<{ type: SalesDocumentType; label: string }> = [
  { type: 'DEVIS', label: 'Générer devis' },
  { type: 'BON_COMMANDE', label: 'Générer bon de commande' },
  { type: 'BON_LIVRAISON', label: 'Générer bon de livraison' },
  { type: 'FACTURE', label: 'Générer facture' },
];

// Types de documents transformables (source)
const TRANSFORMABLE_TYPES: SalesDocumentType[] = ['DEVIS', 'BON_COMMANDE', 'BON_LIVRAISON'];

// Transformations autorisées par type source
const ALLOWED_TRANSFORMS: Record<string, Array<{ value: SalesDocumentType; label: string }>> = {
  DEVIS: [
    { value: 'BON_LIVRAISON', label: 'Bon de livraison' },
    { value: 'FACTURE', label: 'Facture' },
  ],
  BON_COMMANDE: [
    { value: 'BON_LIVRAISON', label: 'Bon de livraison' },
    { value: 'FACTURE', label: 'Facture' },
  ],
  BON_LIVRAISON: [{ value: 'FACTURE', label: 'Facture' }],
};

const DOC_TYPE_BADGE: Record<string, string> = {
  DEVIS: 'bg-gray-100 text-gray-600 border-gray-200',
  BON_COMMANDE: 'bg-blue-50 text-blue-600 border-blue-200',
  BON_LIVRAISON: 'bg-purple-50 text-purple-600 border-purple-200',
  FACTURE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  AVOIR: 'bg-red-50 text-red-600 border-red-200',
};

const DOC_TYPE_SHORT: Record<string, string> = {
  DEVIS: 'Devis',
  BON_COMMANDE: 'Cmd',
  BON_LIVRAISON: 'BL',
  FACTURE: 'Fac',
  AVOIR: 'Avoir',
};

// ─── Transform dialog ────────────────────────────────────────────────────────

interface TransformDialogProps {
  sourceSale: Sale;
  isPending: boolean;
  onConfirm: (targetType: SalesDocumentType) => void;
  onCancel: () => void;
}

function TransformDialog({ sourceSale, isPending, onConfirm, onCancel }: TransformDialogProps) {
  const options = ALLOWED_TRANSFORMS[sourceSale.documentType] ?? [];
  const [selected, setSelected] = useState<SalesDocumentType | ''>(options[0]?.value ?? '');

  const sourceAppliedStock = sourceSale.stockImpactDone;
  const targetAppliesStock = selected === 'BON_LIVRAISON' || selected === 'FACTURE';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-border/70 bg-white shadow-2xl">
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
              <ArrowRightLeft size={18} className="text-violet-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">Transformer le document</h3>
              <p className="text-xs text-text-muted">
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium mr-1 ${DOC_TYPE_BADGE[sourceSale.documentType] ?? ''}`}>
                  {DOC_TYPE_SHORT[sourceSale.documentType] ?? sourceSale.documentType}
                </span>
                <span className="font-mono">{sourceSale.invoiceNumber}</span>
              </p>
            </div>
          </div>

          {options.length === 0 ? (
            <p className="text-sm text-red-600">Aucune transformation disponible pour ce type de document.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Transformer en</p>
              <div className="flex flex-col gap-2">
                {options.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                      selected === opt.value
                        ? 'border-violet-400 bg-violet-50'
                        : 'border-border hover:border-violet-200 hover:bg-surface'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetType"
                      value={opt.value}
                      checked={selected === opt.value}
                      onChange={() => setSelected(opt.value)}
                      className="accent-violet-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-text-primary">{opt.label}</span>
                      {opt.value === 'BON_LIVRAISON' && (
                        <p className="text-xs text-text-muted">
                          {sourceAppliedStock ? 'Stock déjà appliqué — pas de double décrément' : 'Diminue le stock immédiatement'}
                        </p>
                      )}
                      {opt.value === 'FACTURE' && (
                        <p className="text-xs text-text-muted">
                          {sourceAppliedStock ? 'Stock déjà appliqué — pas de double décrément' : 'Diminue le stock immédiatement'}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {targetAppliesStock && !sourceAppliedStock && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Le stock sera décrémenté pour chaque article au moment de la transformation.
            </div>
          )}
          {targetAppliesStock && sourceAppliedStock && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Stock déjà appliqué sur la source — aucun double décrément.
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border/60 px-6 py-4">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-violet-600 text-white hover:bg-violet-700"
            onClick={() => selected && onConfirm(selected as SalesDocumentType)}
            disabled={isPending || !selected || options.length === 0}
          >
            {isPending ? 'En cours…' : 'Confirmer la transformation'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface VenteDraft {
  lines: RegisterLine[];
  customerId: string;
  counterClientFirstName: string;
  counterClientLastName: string;
  saleDate: string;
  paidAmount: string;
  paymentMethod: string;
  totals: DocumentTotals;
}

export default function VentesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [lines, setLines] = useState<RegisterLine[]>([createEmptyLine()]);
  const [customerId, setCustomerId] = useState('');
  const [counterClientFirstName, setCounterClientFirstName] = useState('');
  const [counterClientLastName, setCounterClientLastName] = useState('');
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString());
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);

  const [documentType, setDocumentType] = useState<SalesDocumentType>('DEVIS');
  const [activeTab, setActiveTab] = useState<TabType>('DEVIS');

  // Multi-selection for invoice history
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);

  // Document generation panel (opened by Download button only)
  const [isDocMenuOpen, setIsDocMenuOpen] = useState(false);
  const [docMenuGenerating, setDocMenuGenerating] = useState<SalesDocumentType | null>(null);

  // Email toast state
  const [isEmailToastOpen, setIsEmailToastOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);

  // Document history selection (for email from history)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

  // Transform dialog
  const [transformDialogOpen, setTransformDialogOpen] = useState(false);

  const allowLowMargin = can(PERMISSION_LOW_MARGIN);
  const canViewDetails = can(PERMISSION_VIEW_DETAILS);
  const canDeleteSale = can(PERMISSION_DELETE_SALE);

  const customersQuery = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers').then((r) => r.data),
  });

  const filledLines = lines.filter(isFilledLine);
  const totals = calculateDocumentTotals(lines);
  const paidAmountNum = Number(paidAmount) || 0;
  const selectedClient = (customersQuery.data ?? []).find((c) => c.id === customerId);
  const selectedClientType = String(
    (selectedClient as { type?: string | null } | undefined)?.type ?? '',
  );
  const form = {
    clientId: customerId,
    customerId,
    clientType: customerId ? selectedClientType : 'COMPTOIR',
    counterClientFirstName,
    counterClientLastName,
  };
  const isComptoir =
    form.clientType === 'COMPTOIR' ||
    selectedClientType === 'COMPTOIR' ||
    selectedClient?.name?.toLowerCase().includes('comptoir') ||
    String(form.clientId || form.customerId || '')
      .toLowerCase()
      .includes('comptoir') ||
    !customerId;

  useEffect(() => {
    if (isComptoir || (!counterClientFirstName && !counterClientLastName)) return;
    setCounterClientFirstName('');
    setCounterClientLastName('');
  }, [isComptoir, counterClientFirstName, counterClientLastName]);

  const draftData = useMemo<VenteDraft>(
    () => ({
      lines,
      customerId,
      counterClientFirstName,
      counterClientLastName,
      saleDate,
      paidAmount,
      paymentMethod,
      totals,
    }),
    [
      lines,
      customerId,
      counterClientFirstName,
      counterClientLastName,
      saleDate,
      paidAmount,
      paymentMethod,
      totals,
    ],
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
            recalculateSaleLine({
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
    setCounterClientFirstName(draft.counterClientFirstName ?? '');
    setCounterClientLastName(draft.counterClientLastName ?? '');
    setSaleDate(draft.saleDate ?? new Date().toISOString());
    setPaidAmount(draft.paidAmount ?? '');
    setPaymentMethod(draft.paymentMethod ?? '');
    setShowRestorePrompt(false);
  };

  const handleIgnoreDraft = () => {
    clearDraft();
    setShowRestorePrompt(false);
  };

  const salesQuery = useQuery<PaginatedResponse<Sale>>({
    queryKey: ['sales'],
    queryFn: () => api.get<PaginatedResponse<Sale>>('/sales').then((r) => r.data),
  });
  const salesList: Sale[] = Array.isArray(salesQuery.data?.data) ? salesQuery.data.data : [];

  // Ventes sélectionnées (objets complets, pas juste les IDs)
  const selectedSales = salesList.filter((s) => selectedInvoiceIds.includes(s.id));

  // Parmi les sélectionnées, celles qui peuvent être transformées :
  // - type dans TRANSFORMABLE_TYPES (DEVIS, BON_COMMANDE, BON_LIVRAISON)
  // - non encore transformées (transformedToId absent ou null)
  // - non annulées
  const selectedTransformableSales = selectedSales.filter(
    (sale) =>
      (TRANSFORMABLE_TYPES as string[]).includes(sale.documentType) &&
      !sale.transformedToId &&
      sale.status !== 'CANCELLED',
  );

  // DEBUG temporaire — vérifier que documentType et transformedToId arrivent bien de l'API
  if (selectedSales.length > 0) {
    console.log('SELECTED SALES FOR TRANSFORM', selectedSales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      documentType: s.documentType,        // doit être "DEVIS" | "BON_COMMANDE" | ...
      transformedToId: s.transformedToId,  // doit être null ou string
      status: s.status,
    })));
  }

  const canTransform = selectedTransformableSales.length > 0;

  const paymentMethodsQuery = useQuery<DropdownOption[]>({
    queryKey: ['stockini-dropdown-options', 'payment_methods'],
    queryFn: () =>
      api
        .get<DropdownOption[]>('/settings/dropdown-options/payment_methods')
        .then((r) => r.data),
  });

  const settingsQuery = useQuery({
    queryKey: ['stockini-settings'],
    queryFn: stockiniApi.settings,
  });
  const settings = useMemo(() => {
    const map: Record<string, string> = {};
    (settingsQuery.data ?? []).forEach((s) => { map[s.key] = s.value; });
    return map;
  }, [settingsQuery.data]);

  const invalidMarginLines = filledLines.filter(
    (l) => l.productId !== null && (l.purchasePriceHt <= 0 || (l.margePercent !== null && l.margePercent < MIN_MARGIN_PERCENT)),
  );
  const hasMissingPurchasePrice = filledLines.some(
    (l) => l.productId !== null && l.purchasePriceHt <= 0,
  );
  const hasInvalidQuantity = filledLines.some((l) => l.quantity <= 0);
  const marginBlocked = !allowLowMargin && invalidMarginLines.length > 0;
  const canSave = filledLines.length > 0 && !marginBlocked && !hasMissingPurchasePrice && !hasInvalidQuantity;

  const resetForm = () => {
    setLines([createEmptyLine()]);
    setCustomerId('');
    setCounterClientFirstName('');
    setCounterClientLastName('');
    setSaleDate(new Date().toISOString());
    setPaidAmount('');
    setPaymentMethod('');
    clearDraft();
  };

  const handleCustomerChange = (nextCustomerId: string) => {
    setCustomerId(nextCustomerId);

    const nextClient = (customersQuery.data ?? []).find((c) => c.id === nextCustomerId);
    const nextClientType = String((nextClient as { type?: string | null } | undefined)?.type ?? '');
    const nextIsComptoir =
      !nextCustomerId ||
      nextClientType === 'COMPTOIR' ||
      nextClient?.name?.toLowerCase().includes('comptoir') ||
      nextCustomerId.toLowerCase().includes('comptoir');

    if (!nextIsComptoir) {
      setCounterClientFirstName('');
      setCounterClientLastName('');
    }
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
      if (hasInvalidQuantity) {
        throw new Error('La quantité doit être supérieure à 0 pour chaque ligne.');
      }
      if (!allowLowMargin && invalidMarginLines.length > 0) {
        throw new Error(
          "Vous n'avez pas le droit de valider cette vente. La marge minimale autorisée est de 20%.",
        );
      }
      if (!SALES_DOCUMENT_TYPES.has(documentType)) {
        throw new Error(`Type de document invalide: ${documentType}`);
      }
      if (!SALES_API_DOCUMENT_TYPES.has(documentType)) {
        throw new Error("Les avoirs doivent être créés depuis l'onglet Avoir.");
      }
      const paymentAllowed = documentType === 'FACTURE';
      const submittedPaidAmount = paymentAllowed ? round3(paidAmountNum) : 0;
      if (!paymentAllowed && paidAmountNum > 0) {
        throw new Error(`Le type ${documentType} n'accepte pas de paiement à la création.`);
      }
      if (submittedPaidAmount > round3(totals.totalTtc) + 0.001) {
        throw new Error('Le montant payé ne peut pas dépasser le total TTC.');
      }
      if (submittedPaidAmount > 0 && !paymentMethod) {
        throw new Error('Veuillez sélectionner une méthode de paiement.');
      }
      const trimmedCounterFirstName = counterClientFirstName.trim();
      const trimmedCounterLastName = counterClientLastName.trim();
      if (isComptoir && (!trimmedCounterFirstName || !trimmedCounterLastName)) {
        throw new Error('Veuillez saisir le prénom et le nom du client comptoir.');
      }

      return api
        .post<Sale>('/sales', {
          documentType,
          customerId: customerId || undefined,
          clientType: isComptoir ? 'COMPTOIR' : 'PERSISTENT',
          counterClientFirstName: isComptoir ? trimmedCounterFirstName : null,
          counterClientLastName: isComptoir ? trimmedCounterLastName : null,
          counterClientFullName: isComptoir
            ? `${trimmedCounterFirstName} ${trimmedCounterLastName}`.trim()
            : null,
          paidAmount: submittedPaidAmount,
          paymentMethod:
            submittedPaidAmount > 0 && paymentMethod ? paymentMethod : undefined,
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
      queryClient.setQueryData<PaginatedResponse<Sale>>(['sales'], (prev) =>
        prev ? { ...prev, data: prev.data.filter((s) => s.id !== id) } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Vente déplacée dans la corbeille');
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

  const transformMutation = useMutation({
    mutationFn: ({ id, targetType }: { id: string; targetType: SalesDocumentType }) =>
      stockiniApi.transformSale(id, targetType),
    onSuccess: (newSale) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      const label = DOC_TYPE_SHORT[newSale.documentType] ?? newSale.documentType;
      toast.success(`Document transformé → ${label} ${newSale.invoiceNumber}`);
      setTransformDialogOpen(false);
      setSelectedInvoiceIds([]);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la transformation');
    },
  });

  // ── Checkbox toggle: only updates selection, never opens panels ──────────
  const toggleInvoiceSelection = (saleId: string) => {
    setSelectedInvoiceIds((prev) => {
      const next = prev.includes(saleId)
        ? prev.filter((id) => id !== saleId)
        : [...prev, saleId];

      if (next.length === 0) {
        setIsEmailToastOpen(false);
        setEmailPreview(null);
        setIsDocMenuOpen(false);
      }

      return next;
    });
  };

  // Builds email preview state without opening the toast
  const loadEmailPreview = async (invoiceIds: string[]) => {
    setEmailPreviewLoading(true);
    try {
      const docs = await stockiniApi.generatedDocuments();
      const relevantDocs = docs.filter((d) => invoiceIds.includes(d.invoiceId));

      if (relevantDocs.length > 0) {
        const preview = await stockiniApi.emailPreview(relevantDocs.map((d) => d.id));
        setEmailPreview(preview);
      } else {
        const sales = salesList;
        const selectedSales = sales.filter((s) => invoiceIds.includes(s.id));
        const clientNames = new Set(selectedSales.map((s) => s.customer?.name ?? 'Client comptoir').filter(Boolean));
        const clientEmails = new Set(selectedSales.map((s) => s.customer?.email ?? '').filter(Boolean));

        if (clientNames.size > 1 || clientEmails.size > 1) {
          setEmailPreview({
            to: '',
            subject: '__multi_client__',
            body: '',
            attachments: [],
          });
        } else {
          const clientName = [...clientNames][0] ?? 'Client';
          const clientEmail = [...clientEmails][0] ?? '';
          setEmailPreview({
            to: clientEmail,
            subject: `Documents commerciaux - ${clientName}`,
            body: `Bonjour ${clientName},\n\nVeuillez trouver en pièces jointes les documents demandés.\n\nCordialement.`,
            attachments: [],
          });
        }
      }
    } catch {
      // silent fail on preview load
    } finally {
      setEmailPreviewLoading(false);
    }
  };

  // ── Download button: opens document generation panel ─────────────────────
  const handleDownloadClick = () => {
    if (selectedInvoiceIds.length === 0) {
      toast.info('Veuillez sélectionner au moins une facture.');
      return;
    }
    setIsEmailToastOpen(false);
    setEmailPreview(null);
    setIsDocMenuOpen(true);
  };

  // ── Email button: opens email panel only on explicit click ────────────────
  const handleEmailClick = async () => {
    if (selectedInvoiceIds.length === 0) return;
    setIsDocMenuOpen(false);
    await loadEmailPreview(selectedInvoiceIds);
    setIsEmailToastOpen(true);
  };

  const handleGenerateDocument = async (type: SalesDocumentType) => {
    setDocMenuGenerating(type);
    try {
      const result = await stockiniApi.generateDocuments(selectedInvoiceIds, type);
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setIsDocMenuOpen(false);
      toast.success(
        `${result.documents.length} document(s) généré(s) avec succès`,
        { label: 'Voir dans Documents', onClick: () => router.push('/documents') },
      );
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la génération du document');
    } finally {
      setDocMenuGenerating(null);
    }
  };

  // ── Document selection from history — only tracks state, never auto-opens ──
  const handleDocumentSelectionChange = (ids: string[]) => {
    setSelectedDocumentIds(ids);
    if (ids.length === 0 && selectedInvoiceIds.length === 0) {
      setIsEmailToastOpen(false);
      setEmailPreview(null);
    }
  };

  // ── Email button for document history: opens email panel explicitly ────────
  const handleDocumentEmailClick = async () => {
    if (selectedDocumentIds.length === 0) return;
    setIsDocMenuOpen(false);
    setEmailPreviewLoading(true);
    try {
      const preview = await stockiniApi.emailPreview(selectedDocumentIds);
      setEmailPreview(preview);
      setIsEmailToastOpen(true);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (msg?.includes('même client')) {
        setEmailPreview({ to: '', subject: '__multi_client__', body: '', attachments: [] });
        setIsEmailToastOpen(true);
      } else {
        toast.error(msg ?? "Erreur lors de la préparation de l'email");
      }
    } finally {
      setEmailPreviewLoading(false);
    }
  };

  // ── Send email ─────────────────────────────────────────────────────────────
  const handleSendEmail = async (payload: { to: string; cc?: string; bcc?: string; subject: string; body: string }) => {
    const docIds = selectedDocumentIds.length > 0
      ? selectedDocumentIds
      : await (async () => {
          const docs = await stockiniApi.generatedDocuments();
          return docs.filter((d) => selectedInvoiceIds.includes(d.invoiceId)).map((d) => d.id);
        })();

    if (!docIds.length) {
      toast.info("Aucun document généré à envoyer. Générez d'abord les documents.");
      return;
    }

    setIsSendingEmail(true);
    try {
      await stockiniApi.sendDocumentEmail({ documentIds: docIds, ...payload });
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast.success('Email envoyé avec succès.');
      setIsEmailToastOpen(false);
      setSelectedInvoiceIds([]);
      setSelectedDocumentIds([]);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Échec de l'envoi email");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const today = new Date(saleDate).toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const hasActions = canViewDetails || canDeleteSale;
  const currentDocConfig = DOC_TYPES.find((d) => d.id === documentType) ?? DOC_TYPES[0];
  const colSpan = 1 + 7 + (hasActions ? 1 : 0) + 1; // extra col for Download

  return (
    <PermissionGuard permission="sales.view">
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
	            onClick={() => {
	              setDocumentType(dt.id);
	              setActiveTab(dt.id);
	              if (dt.id !== 'FACTURE') {
	                setPaidAmount('');
	                setPaymentMethod('');
	              }
	            }}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === dt.id
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:bg-muted hover:text-text-primary'
            }`}
          >
            <FileText size={13} />
            {dt.label}
          </button>
        ))}
        {/* Avoir tab */}
        <button
          type="button"
	          onClick={() => {
	            setDocumentType('AVOIR');
	            setActiveTab('AVOIR_TAB');
	            setPaidAmount('');
	            setPaymentMethod('');
	          }}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'AVOIR_TAB'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-text-secondary hover:bg-red-50 hover:text-red-700'
          }`}
        >
          <FileText size={13} />
          Avoir
        </button>
      </div>

      {/* Avoir page — rendered when Avoir tab is active */}
      {activeTab === 'AVOIR_TAB' && (
        <AvoirPage />
      )}

      {/* All content below only shown when a document tab is active */}
      {activeTab !== 'AVOIR_TAB' && (
      <>

      {/* Document header: client + date */}
      <div className="rounded-lg border border-border/70 bg-white p-4">
        <div
          className={cn(
            'grid gap-4',
            isComptoir
              ? 'grid-cols-1 md:grid-cols-[2fr_120px_1fr_1fr]'
              : 'grid-cols-1 md:grid-cols-[2fr_120px]',
          )}
        >
          <div className="space-y-1.5">
            <Label htmlFor="sale-customer">Client</Label>
            <select
              id="sale-customer"
              value={customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
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
          {isComptoir && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="counter-client-first-name">Prénom</Label>
                <Input
                  id="counter-client-first-name"
                  placeholder="Prénom client"
                  value={form.counterClientFirstName || ''}
                  onChange={(e) => setCounterClientFirstName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="counter-client-last-name">Nom</Label>
                <Input
                  id="counter-client-last-name"
                  placeholder="Nom client"
                  value={form.counterClientLastName || ''}
                  onChange={(e) => setCounterClientLastName(e.target.value)}
                  required
                />
              </div>
            </>
          )}
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
	            {documentType === 'FACTURE' && (
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
            {can('sales.create') && (
              <Button
                type="button"
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={!canSave || createMutation.isPending}
              >
                {createMutation.isPending ? 'Enregistrement…' : currentDocConfig.saveLabel}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Sales history */}
      <div className="rounded-lg border border-border/70 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/70">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-primary transition-colors"
          >
            <span>Historique des ventes ({salesQuery.data?.total ?? salesList.length})</span>
            {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {/* Action buttons — visible only when at least one invoice is selected */}
          {selectedInvoiceIds.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadClick}
                className="flex items-center gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
              >
                <Download size={14} />
                Générer document ({selectedInvoiceIds.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleEmailClick}
                disabled={emailPreviewLoading}
                className="flex items-center gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50"
              >
                <Mail size={14} />
                Envoyer par email ({selectedInvoiceIds.length})
              </Button>
              {canTransform && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTransformDialogOpen(true)}
                  className="flex items-center gap-1.5 text-violet-600 border-violet-300 hover:bg-violet-50"
                >
                  <ArrowRightLeft size={14} />
                  Transformer document ({selectedTransformableSales.length})
                </Button>
              )}
            </div>
          )}
        </div>

        {showHistory && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="border-b border-border/60">
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
                ) : salesList.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-text-muted">
                      Aucune vente enregistrée
                    </td>
                  </tr>
                ) : (
                  salesList.map((sale) => {
                    const isSelected = selectedInvoiceIds.includes(sale.id);
                    return (
                      <tr
                        key={sale.id}
                        className={`hover:bg-muted/40 transition-colors ${isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''}`}
                      >
                        {/* Checkbox — selection only, never opens menu */}
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleInvoiceSelection(sale.id)}
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                            aria-label={`Sélectionner la vente ${sale.invoiceNumber}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-mono font-semibold text-xs">{sale.invoiceNumber}</span>
                            <div className="flex items-center gap-1">
                              <span
                                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${DOC_TYPE_BADGE[sale.documentType] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                              >
                                {DOC_TYPE_SHORT[sale.documentType] ?? sale.documentType}
                              </span>
                              {sale.transformedToId && (
                                <span className="text-[10px] text-emerald-600 font-medium">Transformé</span>
                              )}
                              {sale.sourceDocumentId && !sale.transformedToId && (
                                <span className="text-[10px] text-violet-600 font-medium">Issu d'une transf.</span>
                              )}
                            </div>
                          </div>
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
                          {(() => {
                            const pd = getPaymentDisplay(sale.documentType, sale.paymentStatus);
                            return (
                              <span className={`app-status-badge ${pd.className}`}>
                                {pd.label}
                              </span>
                            );
                          })()}
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
                                  title="Mettre à la corbeille"
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

      {/* Generated Documents History */}
      <GeneratedDocumentsHistory
        selectedDocumentIds={selectedDocumentIds}
        onDocumentSelectionChange={handleDocumentSelectionChange}
        onEmailClick={handleDocumentEmailClick}
        emailLoading={emailPreviewLoading}
      />

      {/* Floating document generation panel (opened by Download button) */}
      {isDocMenuOpen && (
        <div className="fixed bottom-6 right-6 z-40 w-64 rounded-xl border border-border/70 bg-white shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between bg-primary/5 border-b border-border/60 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                Générer un document
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {selectedInvoiceIds.length} facture{selectedInvoiceIds.length > 1 ? 's' : ''} sélectionnée{selectedInvoiceIds.length > 1 ? 's' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsDocMenuOpen(false)}
              className="rounded-md p-1 text-text-muted hover:bg-muted hover:text-text-primary transition-colors"
              aria-label="Fermer"
            >
              <X size={15} />
            </button>
          </div>

          <div className="p-3 space-y-1.5">
            {PDF_ACTIONS.map((action) => (
              <button
                key={action.type}
                type="button"
                disabled={docMenuGenerating !== null}
                onClick={() => handleGenerateDocument(action.type)}
                className="w-full flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5 text-left text-sm font-medium text-text-primary hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {docMenuGenerating === action.type ? (
                  <Loader2 size={14} className="shrink-0 animate-spin text-primary" />
                ) : (
                  <FileText size={14} className="shrink-0 text-primary/70" />
                )}
                {action.label}
              </button>
            ))}
          </div>

          <div className="border-t border-border/60 px-3 py-2.5">
            <button
              type="button"
              onClick={() => setIsDocMenuOpen(false)}
              className="w-full rounded-md py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Email toast — visible when invoices or documents are selected */}
      {isEmailToastOpen && emailPreview && !emailPreviewLoading && (
        <EmailToast
          preview={emailPreview}
          isSending={isSendingEmail}
          onSend={handleSendEmail}
          onCancel={() => {
            setIsEmailToastOpen(false);
            setSelectedInvoiceIds([]);
            setSelectedDocumentIds([]);
          }}
        />
      )}

      {/* Sale details modal */}
      {selectedSaleId && (
        <SaleDetailsModal
          saleId={selectedSaleId}
          onClose={() => setSelectedSaleId(null)}
        />
      )}

      {/* Transform dialog — s'ouvre uniquement si des documents transformables sont sélectionnés */}
      {transformDialogOpen && selectedTransformableSales.length > 0 && (
        <>
          {selectedTransformableSales.length > 1 && (
            <div className="fixed bottom-24 right-6 z-50 max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 shadow-lg">
              <strong>{selectedTransformableSales.length} documents transformables</strong> sélectionnés.<br />
              Seul le premier sera transformé : <span className="font-mono">{selectedTransformableSales[0].invoiceNumber}</span>.
            </div>
          )}
          <TransformDialog
            sourceSale={selectedTransformableSales[0]}
            isPending={transformMutation.isPending}
            onConfirm={(targetType) =>
              transformMutation.mutate({ id: selectedTransformableSales[0].id, targetType })
            }
            onCancel={() => setTransformDialogOpen(false)}
          />
        </>
      )}

      {deleteTarget && (
        <MoveToTrashDialog
          label={deleteTarget.invoiceNumber}
          isPending={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      </>
      )}
    </div>
    </PermissionGuard>
  );
}
