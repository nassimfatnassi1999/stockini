'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightCircle, Plus, Trash2 } from 'lucide-react';
import { MoveToTrashDialog } from '@/components/stockini/MoveToTrashDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SlideOver } from '@/components/ui/SlideOver';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, getPaymentDisplay, money } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { PaginatedResponse, Purchase, PurchaseDocumentType } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { SimpleTable } from '../shared/SimpleTable';
import { Status } from '../shared/Status';
import { cleanPayload, emptyForm } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

const DOC_TYPE_LABELS: Record<PurchaseDocumentType, string> = {
  BON_COMMANDE: 'Bon de commande',
  BON_RECEPTION: 'Bon de réception',
  FACTURE_FOURNISSEUR: 'Facture fournisseur',
};

const DOC_TYPE_COLORS: Record<PurchaseDocumentType, string> = {
  BON_COMMANDE: 'border-amber-200 bg-amber-50 text-amber-700',
  BON_RECEPTION: 'border-blue-200 bg-blue-50 text-blue-700',
  FACTURE_FOURNISSEUR: 'border-purple-200 bg-purple-50 text-purple-700',
};

function DocTypeBadge({ type }: { type: PurchaseDocumentType | undefined }) {
  const t = type ?? 'BON_COMMANDE';
  return <Badge className={DOC_TYPE_COLORS[t]}>{DOC_TYPE_LABELS[t]}</Badge>;
}

function PaymentStatusCell({ documentType, paymentStatus }: { documentType: string | undefined; paymentStatus: string | null | undefined }) {
  if (!documentType || documentType === 'BON_COMMANDE') {
    return <span className="text-gray-400" aria-label="Non payable">—</span>;
  }
  const { label, className } = getPaymentDisplay(documentType, paymentStatus);
  return <Badge className={className}>{label}</Badge>;
}

export function PurchasesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const [transformTarget, setTransformTarget] = useState<Purchase | null>(null);
  const [transformType, setTransformType] = useState<'BON_RECEPTION' | 'FACTURE_FOURNISSEUR'>('BON_RECEPTION');

  const suppliers = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });
  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });

  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'N° Commande', readOnly: true },
    { name: 'supplierId', label: 'Fournisseur', type: 'select', required: true, options: (suppliers.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'productId', label: 'Produit', type: 'select', required: true, options: (products.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'quantity', label: 'Quantité', type: 'number', required: true },
    { name: 'unitCost', label: 'Coût unitaire', type: 'number', required: true },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-purchases'], queryFn: () => stockiniApi.purchases() });
  const data: Purchase[] = Array.isArray(query.data?.data) ? query.data.data : [];

  const createMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      return stockiniApi.createPurchase({
        supplierId: payload.supplierId,
        items: [{ productId: payload.productId, quantity: payload.quantity, unitCost: payload.unitCost }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      setModalOpen(false);
      setForm(emptyForm(fields));
      toast.success('Bon de commande créé');
    },
  });

  const transformMutation = useMutation({
    mutationFn: () => stockiniApi.transformPurchase(transformTarget!.id, transformType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payable-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-stock'] });
      setTransformTarget(null);
      toast.success(
        transformType === 'BON_RECEPTION'
          ? 'Transformé en Bon de réception — document maintenant payable'
          : 'Transformé en Facture fournisseur — document maintenant payable',
      );
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la transformation');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deletePurchase,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<PaginatedResponse<Purchase>>(['stockini-purchases'], (prev) =>
        prev ? { ...prev, data: prev.data.filter((p) => p.id !== id) } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Achat déplacé dans la corbeille');
      setTrashTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors du déplacement dans la corbeille');
      setTrashTarget(null);
    },
  });

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Achats" subtitle="Bons de commande et réceptions fournisseurs." />
        <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} />
          Nouveau
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Commande', 'Type document', 'Fournisseur', 'Date', 'Articles', 'Total', 'Paiement', 'Statut', 'Actions']}
        rows={data.map((purchase: Purchase) => [
          <span key="order" className="font-mono font-semibold">{purchase.orderNumber}</span>,
          <DocTypeBadge key="doctype" type={purchase.documentType} />,
          purchase.supplier?.name ?? '-',
          dateTime(purchase.createdAt),
          purchase.items?.length ?? 0,
          money(purchase.total),
          <PaymentStatusCell key="payment" documentType={purchase.documentType} paymentStatus={purchase.paymentStatus} />,
          <Status key="status" value={purchase.status} />,
          <div key="actions" className="flex items-center justify-end gap-1">
            {purchase.documentType === 'BON_COMMANDE' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => { setTransformTarget(purchase); setTransformType('BON_RECEPTION'); }}
              >
                <ArrowRightCircle size={13} />
                Transformer
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-text-muted hover:text-red-600"
              onClick={() => setTrashTarget({ id: purchase.id, name: purchase.orderNumber })}
            >
              <Trash2 size={14} />
            </Button>
          </div>,
        ])}
      />
      {modalOpen && (
        <CrudModal
          title="Nouveau bon de commande"
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setModalOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          saving={createMutation.isPending}
        />
      )}
      {trashTarget && (
        <MoveToTrashDialog
          label={trashTarget.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(trashTarget.id)}
          onCancel={() => setTrashTarget(null)}
        />
      )}

      {/* Modal transformation BC → BR / Facture */}
      <SlideOver
        title="Transformer le bon de commande"
        subtitle={transformTarget?.orderNumber}
        open={!!transformTarget}
        onClose={() => setTransformTarget(null)}
        width={480}
        footer={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setTransformTarget(null)}>
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={transformMutation.isPending}
              onClick={() => transformMutation.mutate()}
            >
              <ArrowRightCircle size={14} />
              {transformMutation.isPending ? 'Transformation...' : 'Confirmer'}
            </Button>
          </>
        }
      >
        {transformTarget && (
          <div className="space-y-5">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">Règle métier</p>
              <p>Un Bon de commande ne crée pas de dette. La dette fournisseur et le paiement ne sont activés qu&apos;après transformation.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Fournisseur</span>
                <span className="font-medium">{transformTarget.supplier?.name ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Montant total</span>
                <span className="font-mono font-semibold">{money(transformTarget.total)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Transformer en :</p>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30">
                <input
                  type="radio"
                  name="transformType"
                  value="BON_RECEPTION"
                  checked={transformType === 'BON_RECEPTION'}
                  onChange={() => setTransformType('BON_RECEPTION')}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-medium text-sm">Bon de réception</p>
                  <p className="text-xs text-text-muted">Met à jour le stock et crée la dette fournisseur.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30">
                <input
                  type="radio"
                  name="transformType"
                  value="FACTURE_FOURNISSEUR"
                  checked={transformType === 'FACTURE_FOURNISSEUR'}
                  onChange={() => setTransformType('FACTURE_FOURNISSEUR')}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-medium text-sm">Facture fournisseur</p>
                  <p className="text-xs text-text-muted">Crée la dette fournisseur sans modifier le stock.</p>
                </div>
              </label>
            </div>
          </div>
        )}
      </SlideOver>
    </>
  );
}
