'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { StockMovement } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { SimpleTable } from '../shared/SimpleTable';
import { cleanPayload, emptyForm, useDropdownOptions } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

export function StockMovementsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const operationOptions = useDropdownOptions('stock_operation_types');
  const reasonOptions = useDropdownOptions('stock_movement_reasons');
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'Référence', readOnly: true },
    { name: 'movementKind', label: 'Opération', type: 'select', required: true, options: operationOptions },
    { name: 'productId', label: 'Produit', type: 'select', required: true, options: (products.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'quantity', label: 'Quantité / nouveau stock', type: 'number', required: true },
    { name: 'reason', label: 'Motif', type: 'select', options: reasonOptions },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-movements'], queryFn: stockiniApi.movements });
  const data = query.data ?? [];
  const createMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      const common = {
        productId: String(payload.productId),
        reason: payload.reason ? String(payload.reason) : undefined,
      };
      if (payload.movementKind === 'ADJUSTMENT') {
        return stockiniApi.stockAdjustment({ ...common, newQuantity: Number(payload.quantity) });
      }
      if (payload.movementKind === 'EXIT') {
        return stockiniApi.stockExit({ ...common, quantity: Number(payload.quantity) });
      }
      return stockiniApi.stockEntry({ ...common, quantity: Number(payload.quantity) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      setForm(emptyForm(fields));
      toast.success('Mouvement stock enregistré');
    },
  });
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Stock" subtitle="Historique des entrées, sorties, corrections et réceptions." />
        <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} />
          Mouvement
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Date', 'Produit', 'Type', 'Quantité', 'Avant', 'Après', 'Référence']}
        rows={data.map((movement: StockMovement) => [
          dateTime(movement.createdAt),
          movement.product?.name ?? '-',
          statusLabel(movement.type),
          movement.quantity,
          movement.previousQuantity,
          movement.newQuantity,
          movement.reference ?? '-',
        ])}
      />
      {modalOpen && (
        <CrudModal
          title="Nouveau mouvement stock"
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
    </>
  );
}
