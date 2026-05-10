'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
import { Button } from '@/components/ui/button';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, money, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { Purchase } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { RowActions } from '../shared/RowActions';
import { SimpleTable } from '../shared/SimpleTable';
import { Status } from '../shared/Status';
import { cleanPayload, emptyForm } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

export function PurchasesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const suppliers = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });
  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'N° Commande', readOnly: true },
    { name: 'supplierId', label: 'Fournisseur', type: 'select', required: true, options: (suppliers.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'productId', label: 'Produit', type: 'select', required: true, options: (products.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'quantity', label: 'Quantité', type: 'number', required: true },
    { name: 'unitCost', label: 'Coût unitaire', type: 'number', required: true },
    { name: 'paidAmount', label: 'Montant payé', type: 'number' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-purchases'], queryFn: stockiniApi.purchases });
  const data = query.data ?? [];
  const createMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      return stockiniApi.createPurchase({
        supplierId: payload.supplierId,
        paidAmount: payload.paidAmount || 0,
        items: [{ productId: payload.productId, quantity: payload.quantity, unitCost: payload.unitCost }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      setModalOpen(false);
      setForm(emptyForm(fields));
      toast.success('Achat créé');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deletePurchase,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Purchase[]>(['stockini-purchases'], (prev) =>
        prev ? prev.filter((p) => p.id !== id) : prev,
      );
      toast.success('Achat supprimé avec succès');
      setTrashTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la suppression');
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
        headers={['Commande', 'Fournisseur', 'Date', 'Articles', 'Total', 'Paiement', 'Statut', 'Actions']}
        rows={data.map((purchase: Purchase) => [
          <span key="order" className="font-mono font-semibold">{purchase.orderNumber}</span>,
          purchase.supplier?.name ?? '-',
          dateTime(purchase.createdAt),
          purchase.items?.length ?? 0,
          money(purchase.total),
          statusLabel(purchase.paymentStatus),
          <Status key="status" value={purchase.status} />,
          <RowActions key="actions" onDelete={() => setTrashTarget({ id: purchase.id, name: purchase.orderNumber })} deleting={deleteMutation.isPending} />,
        ])}
      />
      {modalOpen && (
        <CrudModal
          title="Nouvel achat"
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
