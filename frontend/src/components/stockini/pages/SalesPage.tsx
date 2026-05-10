'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
import { Button } from '@/components/ui/button';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, money, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { Sale } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { RowActions } from '../shared/RowActions';
import { SimpleTable } from '../shared/SimpleTable';
import { Status } from '../shared/Status';
import { cleanPayload, emptyForm, formatCalculatedAmount, numberValue, useDropdownOptions } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

export function SalesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const customers = useQuery({ queryKey: ['stockini-customers'], queryFn: stockiniApi.customers });
  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const paymentMethodOptions = useDropdownOptions('payment_methods');
  const discountOptions = [0, 5, 10, 15, 20, 25, 30].map((value) => ({ value: String(value), label: `${value}%` }));
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'N° Facture', readOnly: true },
    { name: 'customerId', label: 'Client', type: 'select', required: true, options: (customers.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'productId', label: 'Produit', type: 'select', required: true, options: (products.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'quantity', label: 'Quantité', type: 'number', required: true },
    { name: 'discountPercent', label: 'Remise', type: 'select', required: true, options: discountOptions },
    { name: 'paidAmount', label: 'Montant payé', type: 'number', readOnly: true },
    { name: 'paymentMethod', label: 'Méthode', type: 'select', required: true, options: paymentMethodOptions },
  ];
  const initialSaleForm = () => ({ ...emptyForm(fields), discountPercent: '0', paidAmount: '0.00' });
  const [form, setForm] = useState<Record<string, string | boolean>>(initialSaleForm);
  const query = useQuery({ queryKey: ['stockini-sales'], queryFn: stockiniApi.sales });
  const data = query.data ?? [];

  const getSaleCalculation = (nextForm: Record<string, string | boolean>) => {
    const product = (products.data ?? []).find((item) => item.id === nextForm.productId);
    const unitPrice = numberValue(product?.salePrice);
    const quantity = numberValue(nextForm.quantity);
    const discountPercent = numberValue(nextForm.discountPercent);
    const grossTotal = unitPrice * quantity;
    const discountAmount = grossTotal * discountPercent / 100;
    const paidAmount = grossTotal - discountAmount;

    return { discountAmount, discountPercent, grossTotal, paidAmount, product, quantity };
  };

  const updateSaleForm = (name: string, value: string | boolean) => {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (['productId', 'quantity', 'discountPercent'].includes(name)) {
        const { paidAmount } = getSaleCalculation(next);
        next.paidAmount = formatCalculatedAmount(paidAmount);
      }
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      const calculation = getSaleCalculation(form);
      return stockiniApi.createSale({
        customerId: payload.customerId,
        discount: Number(calculation.discountAmount.toFixed(3)),
        paidAmount: Number(calculation.paidAmount.toFixed(3)),
        paymentMethod: payload.paymentMethod,
        items: [{ productId: payload.productId, quantity: payload.quantity }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      setForm(initialSaleForm());
      toast.success('Vente créée');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteSale,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Sale[]>(['stockini-sales'], (prev) =>
        prev ? prev.filter((s) => s.id !== id) : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      toast.success('Vente supprimée avec succès');
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
        <PageHeader title="Ventes" subtitle="Factures, paiements et statuts de vente." />
        <Button type="button" size="sm" onClick={() => { setForm(initialSaleForm()); setModalOpen(true); }}>
          <Plus size={14} />
          Nouvelle
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Facture', 'Client', 'Date', 'Articles', 'Total', 'Paiement', 'Statut', 'Actions']}
        rows={data.map((sale: Sale) => [
          <span key="invoice" className="font-mono font-semibold">{sale.invoiceNumber}</span>,
          sale.customer?.name ?? 'Client comptoir',
          dateTime(sale.createdAt),
          sale.items?.length ?? 0,
          money(sale.total),
          statusLabel(sale.paymentStatus),
          <Status key="status" value={sale.status} />,
          <RowActions key="actions" onDelete={() => setTrashTarget({ id: sale.id, name: sale.invoiceNumber })} deleting={deleteMutation.isPending} />,
        ])}
      />
      {modalOpen && (
        <CrudModal
          title="Nouvelle vente"
          fields={fields}
          form={form}
          onChange={updateSaleForm}
          onClose={() => setModalOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            const calculation = getSaleCalculation(form);
            const expectedPaidAmount = formatCalculatedAmount(calculation.paidAmount);
            if (!form.customerId) {
              toast.error('Veuillez sélectionner un client.');
              return;
            }
            if (!calculation.product) {
              toast.error('Veuillez sélectionner un produit.');
              return;
            }
            if (calculation.quantity <= 0) {
              toast.error('La quantité doit être supérieure à 0.');
              return;
            }
            if (calculation.discountPercent > 30) {
              window.alert('La remise ne peut pas dépasser 30%.');
              return;
            }
            if (String(form.paidAmount) !== expectedPaidAmount) {
              toast.error('Le montant payé calculé est incorrect.');
              return;
            }
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
