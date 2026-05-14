'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Check, Plus, Trash2 } from 'lucide-react';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
import { Button } from '@/components/ui/button';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, money, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { Sale, SalesDocumentType } from '@/lib/stockini/types';
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
];

const DOC_TYPE_LABEL: Record<string, string> = {
  DEVIS: 'Devis',
  BON_COMMANDE: 'Bon de commande',
  BON_LIVRAISON: 'Bon de livraison',
  FACTURE: 'Facture',
};

const DOC_TYPE_COLOR: Record<string, string> = {
  DEVIS: 'bg-gray-100 text-gray-700 border-gray-200',
  BON_COMMANDE: 'bg-blue-50 text-blue-700 border-blue-200',
  BON_LIVRAISON: 'bg-purple-50 text-purple-700 border-purple-200',
  FACTURE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

/** Document types where validation triggers stock decrement */
const VALIDATES_STOCK = new Set<string>(['BON_LIVRAISON', 'FACTURE']);

/** Document types (other than DEVIS) that can be validated (including BC) */
const VALIDATABLE = new Set<string>(['BON_COMMANDE', 'BON_LIVRAISON', 'FACTURE']);

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

// ─── Filter tabs ─────────────────────────────────────────────────────────────

const FILTER_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tous' },
  ...DOC_TYPE_OPTIONS,
];

// ─── Page ────────────────────────────────────────────────────────────────────

export function SalesPage() {
  const queryClient = useQueryClient();

  // form / modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; name: string } | null>(null);
  const [validateTarget, setValidateTarget] = useState<{ id: string; name: string } | null>(null);

  // data queries
  const customers = useQuery({ queryKey: ['stockini-customers'], queryFn: stockiniApi.customers });
  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const paymentMethodOptions = useDropdownOptions('payment_methods');

  const discountOptions = [0, 5, 10, 15, 20, 25, 30].map((v) => ({
    value: String(v),
    label: `${v}%`,
  }));
  const customerOptions = (customers.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const productOptions = (products.data ?? []).map((p) => ({ value: p.id, label: p.name }));

  // ── Form fields (depend on selected documentType) ──────────────────────────
  const buildFields = (docType: string): FieldConfig[] => {
    const withPayment = docType !== 'DEVIS';
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

  const initialForm = (docType = 'DEVIS') => ({
    ...emptyForm(buildFields(docType)),
    documentType: docType,
    discountPercent: '0',
    paidAmount: '0.00',
    reserveStock: false,
  });

  const [form, setForm] = useState<Record<string, string | boolean>>(initialForm());

  const currentDocType = String(form.documentType || 'DEVIS');
  const fields = buildFields(currentDocType);

  // ── Calculation ────────────────────────────────────────────────────────────
  const getSaleCalculation = (f: Record<string, string | boolean>) => {
    const product = (products.data ?? []).find((p) => p.id === f.productId);
    const unitPrice = numberValue(product?.salePrice);
    const quantity = numberValue(f.quantity);
    const discountPercent = numberValue(f.discountPercent);
    const grossTotal = unitPrice * quantity;
    const discountAmount = grossTotal * (discountPercent / 100);
    const paidAmount = grossTotal - discountAmount;
    return { discountAmount, discountPercent, grossTotal, paidAmount, product, quantity };
  };

  const updateForm = (name: string, value: string | boolean) => {
    setForm((current) => {
      const next = { ...current, [name]: value };

      // When doc type changes, reset form preserving new docType
      if (name === 'documentType') {
        return initialForm(String(value));
      }

      // Recalculate paid amount when product/quantity/discount change
      if (['productId', 'quantity', 'discountPercent'].includes(name)) {
        const { paidAmount } = getSaleCalculation(next);
        next.paidAmount = formatCalculatedAmount(paidAmount);
      }

      return next;
    });
  };

  // ── Data query ─────────────────────────────────────────────────────────────
  const query = useQuery({ queryKey: ['stockini-sales'], queryFn: stockiniApi.sales });
  const data: Sale[] = (query.data ?? []).filter(
    (s) => !docTypeFilter || s.documentType === docTypeFilter,
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      const calc = getSaleCalculation(form);
      return stockiniApi.createSale({
        documentType: payload.documentType,
        reserveStock: payload.reserveStock ?? false,
        customerId: payload.customerId,
        discount: Number(calc.discountAmount.toFixed(3)),
        paidAmount: currentDocType !== 'DEVIS' ? Number(calc.paidAmount.toFixed(3)) : 0,
        paymentMethod: currentDocType !== 'DEVIS' ? payload.paymentMethod : undefined,
        items: [{ productId: payload.productId, quantity: payload.quantity }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      setForm(initialForm());
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
      queryClient.setQueryData<Sale[]>(['stockini-sales'], (prev) =>
        prev ? prev.filter((s) => s.id !== id) : prev,
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

  // ── Form submit ────────────────────────────────────────────────────────────
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const calc = getSaleCalculation(form);

    if (!form.customerId) {
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
    if (currentDocType !== 'DEVIS') {
      const expected = formatCalculatedAmount(calc.paidAmount);
      if (String(form.paidAmount) !== expected) {
        toast.error('Le montant payé calculé est incorrect.');
        return;
      }
    }
    createMutation.mutate();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Ventes" subtitle="Devis, commandes, livraisons et factures." />
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setForm(initialForm());
            setModalOpen(true);
          }}
        >
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
          const docType = sale.documentType ?? 'FACTURE';
          const canValidate =
            sale.status === 'DRAFT' && VALIDATABLE.has(docType);
          const canCancel = sale.status === 'COMPLETED';

          return [
            /* Type */
            <span
              key="type"
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${DOC_TYPE_COLOR[docType] ?? 'bg-gray-100 text-gray-700'}`}
            >
              {DOC_TYPE_LABEL[docType] ?? docType}
            </span>,

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
              {canValidate && (
                <button
                  type="button"
                  title="Valider ce document"
                  onClick={() =>
                    setValidateTarget({ id: sale.id, name: sale.invoiceNumber })
                  }
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Check size={13} />
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  title="Annuler ce document"
                  onClick={() =>
                    setCancelTarget({ id: sale.id, name: sale.invoiceNumber })
                  }
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100"
                >
                  <Ban size={13} />
                </button>
              )}
              <button
                type="button"
                title="Supprimer"
                onClick={() =>
                  setTrashTarget({ id: sale.id, name: sale.invoiceNumber })
                }
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
          form={form}
          onChange={updateForm}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
          saving={createMutation.isPending}
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
                (query.data ?? []).find((s) => s.id === validateTarget.id)?.documentType ?? '',
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
                Annuler{' '}
                <span className="font-semibold">{cancelTarget.name}</span> ?
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
