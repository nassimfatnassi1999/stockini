'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { MoveToTrashDialog } from '@/components/stockini/MoveToTrashDialog';
import { Can } from '@/components/shared/Can';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import type { Supplier } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
import { Identity } from '../shared/Identity';
import { PageHeader } from '../shared/PageHeader';
import { RowActions } from '../shared/RowActions';
import { SimpleTable } from '../shared/SimpleTable';
import { cleanPayload, emptyForm } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

export function SuppliersPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'Référence', readOnly: true },
    { name: 'name', label: 'Fournisseur', required: true, span: 'full' },
    { name: 'phone', label: 'Téléphone' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'contactPerson', label: 'Contact' },
    { name: 'paymentTerms', label: 'Conditions' },
    { name: 'address', label: 'Adresse', span: 'full' },
    { name: 'taxNumber', label: 'Matricule fiscal', span: 'full' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });
  const data = query.data ?? [];
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields) as Partial<Supplier>;
      return editing && editing.id
        ? stockiniApi.updateSupplier(editing.id, payload)
        : stockiniApi.createSupplier(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-suppliers'] });
      setEditing(null);
      setForm(emptyForm(fields));
      toast.success('Fournisseur enregistré');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteSupplier,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Supplier[]>(['stockini-suppliers'], (prev) =>
        prev ? prev.filter((s) => s.id !== id) : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Fournisseur déplacé dans la corbeille');
      setTrashTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors du déplacement dans la corbeille');
      setTrashTarget(null);
    },
  });
  const isEditing = editing && editing.id;
  const modalPermission = isEditing ? 'suppliers.update' : 'suppliers.create';

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Fournisseurs" subtitle="Contacts, conditions de paiement et coordonnées fournisseurs." />
        <Can permission="suppliers.create">
          <Button type="button" size="sm" onClick={() => { setEditing({} as Supplier); setForm(emptyForm(fields)); }}>
            <Plus size={14} />
            Nouveau
          </Button>
        </Can>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Référence', 'Fournisseur', 'Contact', 'Téléphone', 'Email', 'Conditions', 'Actions']}
        rows={data.map((supplier: Supplier) => [
          <span key="reference" className="font-mono font-semibold">{supplier.reference}</span>,
          <Identity key="name" name={supplier.name} />,
          supplier.contactPerson ?? '-',
          supplier.phone ?? '-',
          supplier.email ?? '-',
          supplier.paymentTerms ?? '-',
          <RowActions
            key="actions"
            onEdit={() => {
              setEditing(supplier);
              setForm({
                referencePreview: supplier.reference ?? '',
                name: supplier.name,
                contactPerson: supplier.contactPerson ?? '',
                phone: supplier.phone ?? '',
                email: supplier.email ?? '',
                address: supplier.address ?? '',
                taxNumber: supplier.taxNumber ?? '',
                paymentTerms: supplier.paymentTerms ?? '',
              });
            }}
            onDelete={() => setTrashTarget({ id: supplier.id, name: supplier.name })}
            deleting={deleteMutation.isPending}
            canEdit={can('suppliers.update')}
            canDelete={can('suppliers.delete')}
          />,
        ])}
      />
      {editing && can(modalPermission) && (
        <CrudModal
          title={isEditing ? 'Modifier fournisseur' : 'Nouveau fournisseur'}
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          saving={saveMutation.isPending}
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
    </>
  );
}
