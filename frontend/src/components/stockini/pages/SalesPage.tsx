'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, Ban, Check, ChevronDown, Plus, Trash2, UserCircle, X } from 'lucide-react';
import { MoveToTrashDialog } from '@/components/stockini/MoveToTrashDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, getPaymentDisplay, money } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { Sale, SalesDocumentType } from '@/lib/stockini/types';
import { PageHeader } from '../shared/PageHeader';
import { SimpleTable } from '../shared/SimpleTable';
import { Status } from '../shared/Status';
import {
  cleanPayload,
  emptyForm,
  formatCalculatedAmount,
  numberValue,
  useDropdownOptions,
} from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

// ─── Document type config ────────────────────────────────────────────────────

const DOC_TYPE_OPTIONS: Array<{ value: SalesDocumentType; label: string }> = [
  { value: 'DEVIS', label: 'Devis' },
  { value: 'BON_COMMANDE', label: 'Bon de commande' },
  { value: 'BON_LIVRAISON', label: 'Bon de livraison' },
  { value: 'FACTURE', label: 'Facture' },
  { value: 'AVOIR', label: 'Avoir' },
];

const DOC_TYPE_LABEL: Record<string, string> = {
  DEVIS: 'Devis',
  BON_COMMANDE: 'Bon de commande',
  BON_LIVRAISON: 'Bon de livraison',
  FACTURE: 'Facture',
  AVOIR: 'Avoir',
};

const DOC_TYPE_COLOR: Record<string, string> = {
  DEVIS: 'bg-gray-100 text-gray-700 border-gray-200',
  BON_COMMANDE: 'bg-blue-50 text-blue-700 border-blue-200',
  BON_LIVRAISON: 'bg-purple-50 text-purple-700 border-purple-200',
  FACTURE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  AVOIR: 'bg-red-50 text-red-700 border-red-200',
};

/** Types qui diminuent le stock lors de la validation */
const VALIDATES_STOCK = new Set<string>(['BON_LIVRAISON', 'FACTURE']);

/** Types qui peuvent être validés */
const VALIDATABLE = new Set<string>(['BON_COMMANDE', 'BON_LIVRAISON', 'FACTURE']);

/** Transformations autorisées par type source */
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

// ─── Confirm dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmClassName,
  isPending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  confirmClassName?: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border/70 bg-white shadow-2xl">
        <div className="space-y-3 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle size={22} className="text-amber-600" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          <div className="text-sm text-text-secondary">{body}</div>
        </div>
        <div className="flex gap-2 border-t border-border/60 px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onCancel}
            disabled={isPending}
          >
            Fermer
          </Button>
          <Button
            size="sm"
            className={`flex-1 ${confirmClassName ?? ''}`}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'En cours…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Transform dialog ────────────────────────────────────────────────────────

function TransformDialog({
  sale,
  isPending,
  onConfirm,
  onCancel,
}: {
  sale: Sale;
  isPending: boolean;
  onConfirm: (targetType: SalesDocumentType) => void;
  onCancel: () => void;
}) {
  const options = ALLOWED_TRANSFORMS[sale.documentType] ?? [];
  const [selected, setSelected] = useState<SalesDocumentType | ''>(
    options[0]?.value ?? '',
  );

  const targetAppliesStock =
    selected === 'BON_LIVRAISON' || selected === 'FACTURE';
  const sourceAlreadyAppliedStock = sale.stockImpactDone;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border/70 bg-white shadow-2xl">
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
              <ArrowRightLeft size={18} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Transformer le document
              </h3>
              <p className="text-xs text-text-muted font-mono">{sale.invoiceNumber}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">
              Transformer en
            </label>
            <div className="flex flex-col gap-2">
              {options.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selected === opt.value
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-border hover:border-indigo-200 hover:bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="targetType"
                    value={opt.value}
                    checked={selected === opt.value}
                    onChange={() => setSelected(opt.value)}
                    className="accent-indigo-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-text-primary">
                      {opt.label}
                    </span>
                    {opt.value === 'BON_LIVRAISON' && (
                      <p className="text-xs text-text-muted">Diminue le stock immédiatement</p>
                    )}
                    {opt.value === 'FACTURE' && (
                      <p className="text-xs text-text-muted">
                        {sourceAlreadyAppliedStock
                          ? 'Stock déjà appliqué — pas de double décrément'
                          : 'Diminue le stock immédiatement'}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {targetAppliesStock && !sourceAlreadyAppliedStock && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Le stock sera décrémenté pour chaque article au moment de la transformation.
            </div>
          )}
          {sourceAlreadyAppliedStock && targetAppliesStock && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              Stock déjà appliqué sur le document source — aucun double décrément.
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border/60 px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onCancel}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => selected && onConfirm(selected as SalesDocumentType)}
            disabled={isPending || !selected}
          >
            {isPending ? 'En cours…' : 'Confirmer la transformation'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Enum mapping ────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = {
  DEVIS: 'DEVIS',
  BON_COMMANDE: 'BON_COMMANDE',
  BON_LIVRAISON: 'BON_LIVRAISON',
  FACTURE: 'FACTURE',
  AVOIR: 'AVOIR',
} as const;

const VALID_DOC_TYPES = new Set(Object.values(DOCUMENT_TYPES));

// ─── Filter tabs ─────────────────────────────────────────────────────────────

const FILTER_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tous' },
  ...DOC_TYPE_OPTIONS,
];

// ─── Page ────────────────────────────────────────────────────────────────────

type FormState = Record<string, string | boolean>;

export function SalesPage() {
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [activeDocType, setActiveDocType] = useState<SalesDocumentType>(DOCUMENT_TYPES.DEVIS);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; name: string } | null>(null);
  const [validateTarget, setValidateTarget] = useState<{ id: string; name: string } | null>(null);
  const [transformTarget, setTransformTarget] = useState<Sale | null>(null);
  const [showCounterPanel, setShowCounterPanel] = useState(false);
  const [counterClientErrors, setCounterClientErrors] = useState<Record<string, string>>({});

  // ── Data queries ────────────────────────────────────────────────────────────
  const customers = useQuery({ queryKey: ['stockini-customers'], queryFn: stockiniApi.customers });
  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const paymentMethodOptions = useDropdownOptions('payment_methods');

  const discountOptions = [0, 5, 10, 15, 20, 25, 30].map((v) => ({
    value: String(v),
    label: `${v}%`,
  }));
  const customerOptions = (customers.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const productOptions = (products.data ?? []).map((p) => ({ value: p.id, label: p.name }));

  // ── Form fields ─────────────────────────────────────────────────────────────
  const buildFields = (docType: string, withComptoir = false): FieldConfig[] => {
    const withPayment = docType === 'FACTURE';
    const withReserve = docType === 'BON_COMMANDE';

    const base: FieldConfig[] = [
      {
        name: 'documentType',
        label: 'Type de document',
        type: 'select',
        required: true,
        options: DOC_TYPE_OPTIONS,
      },
      { name: 'referencePreview', label: 'Référence', readOnly: true },
      {
        name: 'customerId',
        label: 'Client',
        type: 'select',
        required: true,
        options: customerOptions,
      },
    ];

    if (withComptoir) {
      base.push(
        { name: 'counterClientFirstName', label: 'Prénom du client comptoir *', type: 'text', required: true },
        { name: 'counterClientLastName', label: 'Nom du client comptoir *', type: 'text', required: true },
      );
    }

    base.push(
      {
        name: 'productId',
        label: 'Produit',
        type: 'select',
        required: true,
        options: productOptions,
      },
      { name: 'quantity', label: 'Quantité', type: 'number', required: true },
      {
        name: 'discountPercent',
        label: 'Remise',
        type: 'select',
        required: true,
        options: discountOptions,
      },
    );

    if (withPayment) {
      base.push(
        { name: 'paidAmount', label: 'Montant payé', type: 'number', readOnly: true },
        {
          name: 'paymentMethod',
          label: 'Méthode de paiement',
          type: 'select',
          required: true,
          options: paymentMethodOptions,
        },
      );
    }

    if (withReserve) {
      base.push({ name: 'reserveStock', label: 'Réserver le stock', type: 'checkbox' });
    }

    return base;
  };

  const makeInitialForm = (docType: SalesDocumentType): FormState => ({
    ...emptyForm(buildFields(docType)),
    documentType: docType,
    discountPercent: '0',
    paidAmount: '0.00',
    reserveStock: false,
    clientType: '',
    counterClientFirstName: '',
    counterClientLastName: '',
    counterClientPhone: '',
    counterClientAddress: '',
    counterClientTaxId: '',
    counterClientNote: '',
  });

  const [form, setForm] = useState<FormState>(() => makeInitialForm('DEVIS'));

  const currentDocType = String(form.documentType || 'DEVIS') as SalesDocumentType;
  const selectedClientId = String(form.clientId || form.customerId || '');
  const selectedClient = (customers.data ?? []).find((c) => c.id === selectedClientId);
  const selectedClientType = String(
    (selectedClient as { type?: string | null } | undefined)?.type ?? '',
  );
  const selectedClientName = selectedClient?.name?.toLowerCase() ?? '';
  const selectedClientValue = selectedClientId.toLowerCase();
  const isComptoir =
    form.clientType === 'COMPTOIR' ||
    selectedClientType === 'COMPTOIR' ||
    selectedClientName.includes('comptoir') ||
    selectedClientValue.includes('comptoir');

  const isCounterInfoComplete = isComptoir &&
    Boolean(String(form.counterClientFirstName ?? '').trim()) &&
    Boolean(String(form.counterClientLastName ?? '').trim()) &&
    Boolean(String(form.counterClientPhone ?? '').trim()) &&
    Boolean(String(form.counterClientAddress ?? '').trim());

  useEffect(() => {
    if (form.customerId || form.clientId) return;

    const defaultComptoirClient = (customers.data ?? []).find((client) => {
      const clientType = String((client as { type?: string | null }).type ?? '');
      return clientType === 'COMPTOIR' || client.name?.toLowerCase().includes('comptoir');
    });

    if (!defaultComptoirClient) return;

    setForm((prev) => ({
      ...prev,
      customerId: defaultComptoirClient.id,
      clientType: 'COMPTOIR',
      counterClientFirstName: prev.counterClientFirstName || '',
      counterClientLastName: prev.counterClientLastName || '',
    }));
  }, [customers.data, form.clientId, form.customerId]);

  useEffect(() => {
    if (!selectedClient) return;

    const selectedIsComptoir =
      selectedClientType === 'COMPTOIR' ||
      selectedClient?.name?.toLowerCase().includes('comptoir');

    if (selectedIsComptoir && form.clientType !== 'COMPTOIR') {
      setForm((prev) => ({
        ...prev,
        clientType: 'COMPTOIR',
        counterClientFirstName: prev.counterClientFirstName || '',
        counterClientLastName: prev.counterClientLastName || '',
      }));
    }
  }, [selectedClient?.id, selectedClientType, form.clientType]);

  useEffect(() => {
    if (isComptoir) {
      setShowCounterPanel(true);
    } else {
      setShowCounterPanel(false);
      setCounterClientErrors({});
    }
  }, [isComptoir]);

  // ── Reference preview ────────────────────────────────────────────────────────
  const nextRefQuery = useQuery({
    queryKey: ['stockini-sale-next-reference', currentDocType],
    queryFn: () => stockiniApi.saleNextReference(currentDocType),
    enabled: modalOpen,
    staleTime: 0,
  });

  const referencePreview = nextRefQuery.isLoading
    ? 'Chargement…'
    : (nextRefQuery.data?.reference ?? '');

  // ── Calculation ──────────────────────────────────────────────────────────────
  const getSaleCalculation = (f: FormState) => {
    const product = (products.data ?? []).find((p) => p.id === f.productId);
    const unitPrice = numberValue(product?.salePrice);
    const quantity = numberValue(f.quantity);
    const discountPercent = numberValue(f.discountPercent);
    const grossTotal = unitPrice * quantity;
    const discountAmount = grossTotal * (discountPercent / 100);
    const paidAmount = grossTotal - discountAmount;
    return { discountAmount, discountPercent, grossTotal, paidAmount, product, quantity };
  };

  // ── Form update handler ──────────────────────────────────────────────────────
  const updateForm = (name: string, value: string | boolean) => {
    if (name === 'documentType') {
      const newDocType = value as SalesDocumentType;
      setActiveDocType(newDocType);
      setForm(makeInitialForm(newDocType));
      return;
    }

    if (name === 'customerId') {
      const selectedCustomer = (customers.data ?? []).find((c) => c.id === String(value));
      const normalizedName = selectedCustomer?.name?.toLowerCase().trim() ?? '';
      const normalizedValue = String(value).toLowerCase();
      const selectedCustomerType = String(
        (selectedCustomer as { type?: string | null } | undefined)?.type ?? '',
      );
      const KNOWN_COMPTOIR_IDS = ['comptoir', 'counter', 'client-comptoir'];
      const newIsComptoir =
        selectedCustomerType === 'COMPTOIR' ||
        normalizedName.includes('comptoir') ||
        KNOWN_COMPTOIR_IDS.includes(normalizedValue) ||
        normalizedValue.includes('comptoir');

      setForm((current) => ({
        ...current,
        customerId: String(value),
        clientType: newIsComptoir ? 'COMPTOIR' : 'PERSISTENT',
        counterClientFirstName: newIsComptoir ? (current.counterClientFirstName ?? '') : '',
        counterClientLastName: newIsComptoir ? (current.counterClientLastName ?? '') : '',
        counterClientPhone: newIsComptoir ? (current.counterClientPhone ?? '') : '',
        counterClientAddress: newIsComptoir ? (current.counterClientAddress ?? '') : '',
        counterClientTaxId: newIsComptoir ? (current.counterClientTaxId ?? '') : '',
        counterClientNote: newIsComptoir ? (current.counterClientNote ?? '') : '',
      }));
      return;
    }

    setForm((current) => {
      const next = { ...current, [name]: value };
      if (['productId', 'quantity', 'discountPercent'].includes(name)) {
        const { paidAmount } = getSaleCalculation(next);
        next.paidAmount = formatCalculatedAmount(paidAmount);
      }
      return next;
    });
  };

  // ── Helper: open modal ───────────────────────────────────────────────────────
  const openModal = () => {
    const docType = (docTypeFilter as SalesDocumentType) || DOCUMENT_TYPES.DEVIS;
    setActiveDocType(docType);
    setForm(makeInitialForm(docType));
    queryClient.invalidateQueries({ queryKey: ['stockini-sale-next-reference'] });
    setModalOpen(true);
  };

  // ── Data query ───────────────────────────────────────────────────────────────
  const query = useQuery({
    queryKey: ['stockini-sales', page, limit, docTypeFilter],
    queryFn: () =>
      stockiniApi.sales({
        page,
        limit,
        ...(docTypeFilter && { documentType: docTypeFilter }),
      }),
    placeholderData: keepPreviousData,
  });
  const salesData: Sale[] = Array.isArray(query.data?.data) ? query.data.data : [];
  const data: Sale[] = salesData;
  const totalItems = query.data?.total ?? 0;
  const totalPages = query.data?.totalPages ?? 1;

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (submitForm: FormState) => {
      const docType = String(submitForm.documentType ?? '') as SalesDocumentType;
      const allowed: SalesDocumentType[] = ['DEVIS', 'BON_COMMANDE', 'BON_LIVRAISON', 'FACTURE', 'AVOIR'];
      if (!allowed.includes(docType)) {
        throw new Error(`Invalid documentType before API: ${JSON.stringify(docType)}`);
      }

      const acceptsPayment = docType === 'FACTURE';
      if (docType === 'AVOIR') {
        throw new Error("Les avoirs doivent être créés depuis le module Avoirs.");
      }
      const submitFields = buildFields(docType);
      const payload = cleanPayload(submitForm, submitFields);
      const calc = getSaleCalculation(submitForm);

      const paymentMethodValue = String(payload.paymentMethod ?? '').trim() || undefined;
      const productTva = numberValue(calc.product?.tva);
      const unitPriceHt =
        productTva > -100 ? numberValue(calc.product?.salePrice) / (1 + productTva / 100) : 0;

      const isComptoirAtSubmit = String(submitForm.clientType) === 'COMPTOIR';

      const finalPayload = {
        documentType: docType,
        reserveStock: Boolean(payload.reserveStock),
        customerId: String(payload.customerId ?? ''),
        clientType: isComptoirAtSubmit ? 'COMPTOIR' : 'PERSISTENT',
        ...(isComptoirAtSubmit && {
          counterClientFirstName: String(submitForm.counterClientFirstName ?? '').trim(),
          counterClientLastName: String(submitForm.counterClientLastName ?? '').trim(),
          counterClientPhone: String(submitForm.counterClientPhone ?? '').trim() || undefined,
          counterClientAddress: String(submitForm.counterClientAddress ?? '').trim() || undefined,
          counterClientTaxId: String(submitForm.counterClientTaxId ?? '').trim() || undefined,
          counterClientNote: String(submitForm.counterClientNote ?? '').trim() || undefined,
        }),
        paidAmount: acceptsPayment ? Number(calc.paidAmount.toFixed(3)) : 0,
        paymentMethod: acceptsPayment ? paymentMethodValue : undefined,
        items: [
          {
            productId: String(payload.productId),
            quantity: Number(payload.quantity),
            unitPrice: Number(unitPriceHt.toFixed(3)),
            discountPercent: Number(calc.discountPercent.toFixed(3)),
          },
        ],
      };

      return stockiniApi.createSale(finalPayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-sale-next-reference'] });
      setModalOpen(false);
      setActiveDocType(DOCUMENT_TYPES.DEVIS);
      setForm(makeInitialForm(DOCUMENT_TYPES.DEVIS));
      toast.success('Document enregistré');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la création');
    },
  });

  const validateMutation = useMutation({
    mutationFn: (id: string) => stockiniApi.validateSale(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      toast.success('Document validé — stock mis à jour');
      setValidateTarget(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la validation');
      setValidateTarget(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => stockiniApi.cancelSale(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      toast.success('Document annulé — stock rétabli');
      setCancelTarget(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Erreur lors de l'annulation");
      setCancelTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Document déplacé dans la corbeille');
      setTrashTarget(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors du déplacement dans la corbeille');
      setTrashTarget(null);
    },
  });

  const transformMutation = useMutation({
    mutationFn: ({ id, targetType }: { id: string; targetType: SalesDocumentType }) =>
      stockiniApi.transformSale(id, targetType),
    onSuccess: (newSale) => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast.success(`Document transformé → ${DOC_TYPE_LABEL[newSale.documentType] ?? newSale.documentType} ${newSale.invoiceNumber}`);
      setTransformTarget(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la transformation');
    },
  });

  // ── Form submit ──────────────────────────────────────────────────────────────
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const snapshot: FormState = { ...form, documentType: activeDocType as string };
    const docType = String(snapshot.documentType ?? '') as SalesDocumentType;
    const calc = getSaleCalculation(snapshot);

    if (!VALID_DOC_TYPES.has(docType)) {
      toast.error('Type de document invalide. Veuillez sélectionner un type valide.');
      return;
    }
    if (!snapshot.customerId) {
      toast.error('Veuillez sélectionner un client.');
      return;
    }

    if (isComptoir) {
      const errors: Record<string, string> = {};
      if (!String(snapshot.counterClientFirstName ?? '').trim()) {
        errors.counterClientFirstName = 'Prénom obligatoire';
      }
      if (!String(snapshot.counterClientLastName ?? '').trim()) {
        errors.counterClientLastName = 'Nom obligatoire';
      }
      if (!String(snapshot.counterClientPhone ?? '').trim()) {
        errors.counterClientPhone = 'Téléphone obligatoire';
      }
      if (!String(snapshot.counterClientAddress ?? '').trim()) {
        errors.counterClientAddress = 'Adresse obligatoire';
      }
      if (Object.keys(errors).length > 0) {
        setCounterClientErrors(errors);
        setShowCounterPanel(true);
        return;
      }
      setCounterClientErrors({});
    }
    if (!calc.product) {
      toast.error('Veuillez sélectionner un produit.');
      return;
    }
    if (calc.quantity <= 0) {
      toast.error('La quantité doit être supérieure à 0.');
      return;
    }
    if (calc.discountPercent > 30) {
      window.alert('La remise ne peut pas dépasser 30%.');
      return;
    }
    if (docType === 'AVOIR') {
      toast.error("Les avoirs doivent être créés depuis le module Avoirs.");
      return;
    }
    if (docType === 'FACTURE') {
      const expected = formatCalculatedAmount(calc.paidAmount);
      if (String(snapshot.paidAmount) !== expected) {
        toast.error('Le montant payé calculé est incorrect.');
        return;
      }
    }

    createMutation.mutate(snapshot);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Ventes" subtitle="Devis, commandes, livraisons et factures." />
        <Button type="button" size="sm" onClick={openModal}>
          <Plus size={14} />
          Nouveau
        </Button>
      </div>

      {/* Filter tabs + limit selector */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setDocTypeFilter(tab.value);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              docTypeFilter === tab.value
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-white text-text-secondary hover:border-primary/50 hover:text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-text-muted">
          {totalItems} document(s)
        </span>
        <select
          value={limit}
          onChange={(e) => {
            setLimit(Number(e.target.value));
            setPage(1);
          }}
          className="rounded border border-border bg-white px-2 py-1 text-xs text-text-secondary focus:outline-none"
          aria-label="Éléments par page"
        >
          {[5, 10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Type', 'Référence', 'Client', 'Date', 'Articles', 'Total', 'Paiement', 'Statut', 'Actions']}
        rows={data.map((sale: Sale) => {
          const docType = sale.documentType;
          const canValidate = sale.status === 'DRAFT' && VALIDATABLE.has(docType);
          const canCancel = sale.status === 'COMPLETED';
          const canTransform =
            sale.status !== 'CANCELLED' &&
            !sale.transformedToId &&
            Object.prototype.hasOwnProperty.call(ALLOWED_TRANSFORMS, docType);

          return [
            /* Type */
            <div key="type" className="flex flex-col gap-1">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${DOC_TYPE_COLOR[docType] ?? 'bg-gray-100 text-gray-700'}`}
              >
                {DOC_TYPE_LABEL[docType] ?? docType}
              </span>
              {sale.sourceDocumentId && (
                <span className="text-xs text-text-muted">Issu d'une transformation</span>
              )}
              {sale.transformedToId && (
                <span className="text-xs text-emerald-600">Transformé</span>
              )}
            </div>,

            /* Référence */
            <span key="ref" className="font-mono font-semibold">
              {sale.invoiceNumber}
            </span>,

            /* Client */
            sale.counterClientFullName ? (
              <div key="client" className="flex flex-col gap-0.5">
                <span className="font-medium">{sale.counterClientFullName}</span>
                <span className="text-xs text-blue-600">Client comptoir</span>
              </div>
            ) : (
              sale.customer?.name ?? 'Client comptoir'
            ),

            /* Date */
            dateTime(sale.createdAt),

            /* Articles */
            sale.items?.length ?? 0,

            /* Total */
            money(sale.total),

            /* Paiement */
            (() => {
              const pd = getPaymentDisplay(sale.documentType, sale.paymentStatus);
              return (
                <span
                  key="payment"
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${pd.className}`}
                >
                  {pd.label}
                </span>
              );
            })(),

            /* Statut */
            <Status key="status" value={sale.status} />,

            /* Actions */
            <div key="actions" className="flex justify-end gap-1">
              {canTransform && (
                <button
                  type="button"
                  title="Transformer ce document"
                  onClick={() => setTransformTarget(sale)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-indigo-300 bg-indigo-50 text-indigo-700 transition-colors hover:bg-indigo-100"
                >
                  <ArrowRightLeft size={13} />
                </button>
              )}
              {canValidate && (
                <button
                  type="button"
                  title="Valider ce document"
                  onClick={() => setValidateTarget({ id: sale.id, name: sale.invoiceNumber })}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Check size={13} />
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  title="Annuler ce document"
                  onClick={() => setCancelTarget({ id: sale.id, name: sale.invoiceNumber })}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100"
                >
                  <Ban size={13} />
                </button>
              )}
              <button
                type="button"
                title="Mettre à la corbeille"
                onClick={() => setTrashTarget({ id: sale.id, name: sale.invoiceNumber })}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
              >
                <Trash2 size={13} />
              </button>
            </div>,
          ];
        })}
      />

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || query.isFetching}
            className="rounded border border-border bg-white px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Précédent
          </button>
          <span className="text-xs text-text-secondary">
            Page <span className="font-semibold text-text-primary">{page}</span> / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || query.isFetching}
            className="rounded border border-border bg-white px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Suivant →
          </button>
        </div>
      )}

      {/* Create modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-text-primary">
                Nouveau — {DOC_TYPE_LABEL[currentDocType] ?? currentDocType}
              </h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">

              {/* Document type + Reference */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="f-documentType">Type de document *</Label>
                  <select
                    id="f-documentType"
                    value={String(form.documentType ?? '')}
                    onChange={(e) => updateForm('documentType', e.target.value)}
                    required
                    className="app-select"
                  >
                    {DOC_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-ref">Référence</Label>
                  <Input id="f-ref" value={referencePreview} readOnly placeholder="Générée automatiquement" onChange={() => {}} />
                </div>
              </div>

              {/* Client + Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="f-customerId">Client *</Label>
                  <select
                    id="f-customerId"
                    value={String(form.customerId ?? '')}
                    onChange={(e) => updateForm('customerId', e.target.value)}
                    required
                    className="app-select"
                  >
                    <option value="">Sélectionner</option>
                    {customerOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input value={new Date().toLocaleDateString('fr-TN')} readOnly onChange={() => {}} />
                </div>
              </div>

              {/* Comptoir client toggle + collapsible panel */}
              {isComptoir && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowCounterPanel((v) => !v)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      isCounterInfoComplete
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <UserCircle size={15} />
                      {isCounterInfoComplete ? 'Infos client complètes' : 'Compléter infos client *'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${showCounterPanel ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showCounterPanel && (
                    <div className="rounded-lg border border-border bg-slate-50 p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="f-firstName" className="text-xs">Prénom *</Label>
                          <Input
                            id="f-firstName"
                            value={String(form.counterClientFirstName ?? '')}
                            onChange={(e) => {
                              setForm((prev) => ({ ...prev, counterClientFirstName: e.target.value }));
                              if (counterClientErrors.counterClientFirstName) {
                                setCounterClientErrors((prev) => ({ ...prev, counterClientFirstName: '' }));
                              }
                            }}
                            placeholder="Prénom"
                            className={`h-8 text-sm ${counterClientErrors.counterClientFirstName ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                          />
                          {counterClientErrors.counterClientFirstName && (
                            <p className="text-xs text-red-500">{counterClientErrors.counterClientFirstName}</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="f-lastName" className="text-xs">Nom *</Label>
                          <Input
                            id="f-lastName"
                            value={String(form.counterClientLastName ?? '')}
                            onChange={(e) => {
                              setForm((prev) => ({ ...prev, counterClientLastName: e.target.value }));
                              if (counterClientErrors.counterClientLastName) {
                                setCounterClientErrors((prev) => ({ ...prev, counterClientLastName: '' }));
                              }
                            }}
                            placeholder="Nom"
                            className={`h-8 text-sm ${counterClientErrors.counterClientLastName ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                          />
                          {counterClientErrors.counterClientLastName && (
                            <p className="text-xs text-red-500">{counterClientErrors.counterClientLastName}</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="f-phone" className="text-xs">Téléphone *</Label>
                          <Input
                            id="f-phone"
                            value={String(form.counterClientPhone ?? '')}
                            onChange={(e) => {
                              setForm((prev) => ({ ...prev, counterClientPhone: e.target.value }));
                              if (counterClientErrors.counterClientPhone) {
                                setCounterClientErrors((prev) => ({ ...prev, counterClientPhone: '' }));
                              }
                            }}
                            placeholder="+216 xx xxx xxx"
                            className={`h-8 text-sm ${counterClientErrors.counterClientPhone ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                          />
                          {counterClientErrors.counterClientPhone && (
                            <p className="text-xs text-red-500">{counterClientErrors.counterClientPhone}</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="f-taxId" className="text-xs">Matricule fiscal (MF)</Label>
                          <Input
                            id="f-taxId"
                            value={String(form.counterClientTaxId ?? '')}
                            onChange={(e) => setForm((prev) => ({ ...prev, counterClientTaxId: e.target.value }))}
                            placeholder="MF optionnel"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="f-address" className="text-xs">Adresse *</Label>
                        <Input
                          id="f-address"
                          value={String(form.counterClientAddress ?? '')}
                          onChange={(e) => {
                            setForm((prev) => ({ ...prev, counterClientAddress: e.target.value }));
                            if (counterClientErrors.counterClientAddress) {
                              setCounterClientErrors((prev) => ({ ...prev, counterClientAddress: '' }));
                            }
                          }}
                          placeholder="Adresse complète"
                          className={`h-8 text-sm ${counterClientErrors.counterClientAddress ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                        />
                        {counterClientErrors.counterClientAddress && (
                          <p className="text-xs text-red-500">{counterClientErrors.counterClientAddress}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="f-note" className="text-xs">Note (optionnel)</Label>
                        <Input
                          id="f-note"
                          value={String(form.counterClientNote ?? '')}
                          onChange={(e) => setForm((prev) => ({ ...prev, counterClientNote: e.target.value }))}
                          placeholder="Note libre"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCounterPanel(false)}
                        >
                          Masquer
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Product + Quantity + Discount */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="f-productId">Produit *</Label>
                  <select
                    id="f-productId"
                    value={String(form.productId ?? '')}
                    onChange={(e) => updateForm('productId', e.target.value)}
                    required
                    className="app-select"
                  >
                    <option value="">Sélectionner</option>
                    {productOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-quantity">Quantité *</Label>
                  <Input
                    id="f-quantity"
                    type="number"
                    min={0}
                    step="0.001"
                    value={String(form.quantity ?? '')}
                    onChange={(e) => updateForm('quantity', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-discount">Remise *</Label>
                  <select
                    id="f-discount"
                    value={String(form.discountPercent ?? '0')}
                    onChange={(e) => updateForm('discountPercent', e.target.value)}
                    required
                    className="app-select"
                  >
                    {discountOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* FACTURE: Paid Amount + Payment Method */}
              {currentDocType === 'FACTURE' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="f-paidAmount">Montant payé</Label>
                    <Input
                      id="f-paidAmount"
                      type="number"
                      min={0}
                      step="0.001"
                      value={String(form.paidAmount ?? '0.00')}
                      readOnly
                      onChange={() => {}}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="f-paymentMethod">Méthode de paiement *</Label>
                    <select
                      id="f-paymentMethod"
                      value={String(form.paymentMethod ?? '')}
                      onChange={(e) => updateForm('paymentMethod', e.target.value)}
                      required
                      className="app-select"
                    >
                      <option value="">Sélectionner</option>
                      {paymentMethodOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* BON_COMMANDE: Reserve Stock */}
              {currentDocType === 'BON_COMMANDE' && (
                <div className="flex items-center gap-2 py-2">
                  <input
                    id="f-reserveStock"
                    type="checkbox"
                    checked={Boolean(form.reserveStock)}
                    onChange={(e) => updateForm('reserveStock', e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="f-reserveStock">Réserver le stock</Label>
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  <Check size={14} />
                  {createMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transform dialog */}
      {transformTarget && (
        <TransformDialog
          sale={transformTarget}
          isPending={transformMutation.isPending}
          onConfirm={(targetType) =>
            transformMutation.mutate({ id: transformTarget.id, targetType })
          }
          onCancel={() => setTransformTarget(null)}
        />
      )}

      {/* Validate confirmation */}
      {validateTarget && (
        <ConfirmDialog
          title="Valider le document"
          body={
            <>
              <p>
                Confirmer la validation de{' '}
                <span className="font-semibold">{validateTarget.name}</span> ?
              </p>
              {VALIDATES_STOCK.has(
                salesData.find((s) => s.id === validateTarget.id)?.documentType ?? '',
              ) && (
                <p className="mt-1 text-xs text-amber-600">
                  Le stock sera diminué pour chaque article.
                </p>
              )}
            </>
          }
          confirmLabel="Valider"
          confirmClassName="bg-emerald-600 hover:bg-emerald-700 text-white"
          isPending={validateMutation.isPending}
          onConfirm={() => validateMutation.mutate(validateTarget.id)}
          onCancel={() => setValidateTarget(null)}
        />
      )}

      {/* Cancel confirmation */}
      {cancelTarget && (
        <ConfirmDialog
          title="Annuler le document"
          body={
            <>
              <p>
                Annuler <span className="font-semibold">{cancelTarget.name}</span> ?
              </p>
              <p className="mt-1 text-xs text-amber-600">
                Si le stock avait été décrémenté, il sera rétabli.
              </p>
            </>
          }
          confirmLabel="Confirmer l'annulation"
          confirmClassName="bg-amber-600 hover:bg-amber-700 text-white"
          isPending={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate(cancelTarget.id)}
          onCancel={() => setCancelTarget(null)}
        />
      )}

      {/* Move to trash confirmation */}
      {trashTarget && (
        <MoveToTrashDialog
          label={trashTarget.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(trashTarget.id)}
          onCancel={() => setTrashTarget(null)}
        />
      )}
    </>
  );
}
