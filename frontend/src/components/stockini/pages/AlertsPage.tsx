'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { Alert } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { RowActions } from '../shared/RowActions';
import { SimpleTable } from '../shared/SimpleTable';
import { Status } from '../shared/Status';
import { cleanPayload, emptyForm, useDropdownOptions } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

export function AlertsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Alert | null>(null);
  const alertTypeOptions = useDropdownOptions('alert_types');
  const fields: FieldConfig[] = [
    { name: 'type', label: 'Type', type: 'select', required: true, options: alertTypeOptions },
    { name: 'title', label: 'Titre', required: true },
    { name: 'message', label: 'Message', required: true },
    { name: 'isRead', label: 'Lu', type: 'checkbox' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-alerts'], queryFn: stockiniApi.alerts });
  const data = query.data ?? [];
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields) as Partial<Alert>;
      return editing?.id ? stockiniApi.updateAlert(editing.id, payload) : stockiniApi.createAlert(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-alerts'] });
      setEditing(null);
      setForm(emptyForm(fields));
      toast.success('Alerte enregistrée');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-alerts'] });
      toast.success('Alerte supprimée');
    },
  });
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Alertes" subtitle="Alertes de stock, factures impayées, retards achats et système." />
        <Button type="button" size="sm" onClick={() => { setEditing({} as Alert); setForm(emptyForm(fields)); }}>
          <Plus size={14} />
          Nouveau
        </Button>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isLoading}
        error={query.error}
        headers={['Date', 'Type', 'Titre', 'Message', 'Statut', 'Actions']}
        rows={data.map((alert: Alert) => [
          dateTime(alert.createdAt),
          statusLabel(alert.type),
          alert.title,
          alert.message,
          <Status key="read" value={alert.isRead ? 'READ' : 'OPEN'} />,
          <RowActions
            key="actions"
            onEdit={() => {
              setEditing(alert);
              setForm({ type: alert.type, title: alert.title, message: alert.message, isRead: alert.isRead });
            }}
            onDelete={() => deleteMutation.mutate(alert.id)}
            deleting={deleteMutation.isPending}
          />,
        ])}
      />
      {editing && (
        <CrudModal
          title={editing.id ? 'Modifier alerte' : 'Nouvelle alerte'}
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
    </>
  );
}
