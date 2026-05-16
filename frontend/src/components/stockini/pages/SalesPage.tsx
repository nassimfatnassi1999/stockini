'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, Ban, Check, Plus, Trash2 } from 'lucide-react';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
import { Button } from '@/components/ui/button';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, money, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { PaginatedResponse, Sale, SalesDocumentType } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
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
  const [activeDocType, setActiveDocType] = useState<SalesDocumentType>(DOCUMENT_TYPES.DEVIS);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; name: string } | null>(null);
  const [validateTarget, setValidateTarget] = useState<{ id: string; name: string } | null>(null);
  const [transformTarget, setTransformTarget] = useState<Sale | null>(null);

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
  const buildFields = (docType: string): FieldConfig[] => {
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
    ];

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
  });

  const [form, setForm] = useState<FormState>(() => makeInitialForm('DEVIS'));

  const currentDocType = String(form.documentType || 'DEVIS') as SalesDocumentType;
  const fields = buildFields(currentDocType);

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
  const query = useQuery({ queryKey: ['stockini-sales'], queryFn: () => stockiniApi.sales() });
  const salesData: Sale[] = Array.isArray(query.data?.data) ? query.data.data : [];
  const data: Sale[] = salesData.filter(
    (s) => !docTypeFilter || s.documentType === docTypeFilter,
  );

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

      const finalPayload = {
        documentType: docType,
        reserveStock: Boolean(payload.reserveStock),
        customerId: String(payload.customerId ?? ''),
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
    onSuccess: (_data, id) => {
      queryClient.setQueryData<PaginatedResponse<Sale>>(['stockini-sales'], (prev) =>
        prev ? { ...prev, data: prev.data.filter((s) => s.id !== id) } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      toast.success('Document supprimé');
      setTrashTarget(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la suppression');
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

      {/* Filter tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setDocTypeFilter(tab.value)}
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
          {data.length} document(s)
        </span>
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
            sale.customer?.name ?? 'Client comptoir',

            /* Date */
            dateTime(sale.createdAt),

            /* Articles */
            sale.items?.length ?? 0,

            /* Total */
            money(sale.total),

            /* Paiement */
            statusLabel(sale.paymentStatus),

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
                title="Supprimer"
                onClick={() => setTrashTarget({ id: sale.id, name: sale.invoiceNumber })}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
              >
                <Trash2 size={13} />
              </button>
            </div>,
          ];
        })}
      />

      {/* Create modal */}
      {modalOpen && (
        <CrudModal
          title={`Nouveau — ${DOC_TYPE_LABEL[currentDocType] ?? currentDocType}`}
          fields={fields}
          form={{ ...form, referencePreview }}
          onChange={updateForm}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
          saving={createMutation.isPending}
        />
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

      {/* Delete confirmation */}
      {trashTarget && (
        <PermanentDeleteDialog
          label={trashTarget.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(trashTarget.id)}
          onCancel={() => setTrashTarget(null)}
        />
      )}
    </>
  );
}
