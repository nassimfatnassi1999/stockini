'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { Alert } from '@/lib/stockini/types';
import { Can } from '@/components/shared/Can';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { RowActions } from '../shared/RowActions';
import { SimpleTable } from '../shared/SimpleTable';
import { cleanPayload, emptyForm, useDropdownOptions } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';
import { SearchBox } from '../shared/SearchBox';
import { useUrlPagination } from '@/hooks/useUrlPagination';
import { getValidPage } from '@/lib/data-table-pagination';
import { BulkDeleteDialog } from '../shared/BulkDeleteDialog';
import { isAdministratorRole } from '@/lib/bulk-delete';

function stockValueClass(currentStock: number | null, minimumStock: number | null) {
  if (currentStock === null || minimumStock === null) return 'text-slate-700';
  if (currentStock <= 0) return 'font-semibold text-red-700';
  if (currentStock <= minimumStock) return 'font-semibold text-orange-700';
  return 'text-slate-700';
}

function AlertStatusBadge({ isRead }: { isRead: boolean }) {
  return (
    <Badge
      className={
        isRead
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-red-200 bg-red-50 text-red-700'
      }
    >
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${isRead ? 'bg-emerald-500' : 'bg-red-500'}`} />
      {isRead ? 'Lue' : 'Non lue'}
    </Badge>
  );
}

export function AlertsPage() {
  const queryClient = useQueryClient();
  const { can, role } = usePermissions();
  const { page, limit, search, setSearch, urlSearch, updateParams } = useUrlPagination();
  const [editing, setEditing] = useState<Alert | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const isAdmin = isAdministratorRole(role);
  const alertTypeOptions = useDropdownOptions('alert_types');
  const fields: FieldConfig[] = [
    { name: 'type', label: 'Type', type: 'select', required: true, options: alertTypeOptions },
    { name: 'title', label: 'Titre', required: true },
    { name: 'message', label: 'Message', required: true },
    { name: 'isRead', label: 'Lu', type: 'checkbox' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({
    queryKey: ['stockini-alerts-page', page, limit, urlSearch],
    queryFn: ({ signal }) =>
      stockiniApi.alertPage({ page, limit, search: urlSearch || undefined }, signal),
    placeholderData: (previous) => previous,
  });
  const data = query.data?.data ?? [];
  const pagination = query.data?.pagination;
  useEffect(() => {
    if (pagination && page > Math.max(pagination.totalPages, 1)) {
      updateParams({ page: getValidPage(page, pagination.totalPages) }, 'replace');
    }
  }, [page, pagination, updateParams]);
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields) as Partial<Alert>;
      return editing?.id ? stockiniApi.updateAlert(editing.id, payload) : stockiniApi.createAlert(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-alerts-page'] });
      setEditing(null);
      setForm(emptyForm(fields));
      toast.success('Alerte enregistrée');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-alerts-page'] });
      toast.success('Alerte supprimée');
    },
  });
  const deleteAllMutation = useMutation({
    mutationFn: stockiniApi.deleteAllAlerts,
    onSuccess: async ({ deletedCount }) => {
      setShowDeleteAll(false);
      updateParams({ page: 1 }, 'replace');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stockini-alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['stockini-alerts-page'] }),
      ]);
      toast.success(`${deletedCount} alerte${deletedCount > 1 ? 's ont' : ' a'} été supprimée${deletedCount > 1 ? 's' : ''}.`);
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message ?? 'Impossible de supprimer toutes les alertes. Réessayez.');
    },
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Alertes" subtitle="Alertes de stock, factures impayées, retards achats et système." />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SearchBox value={search} onChange={setSearch} placeholder="Rechercher une alerte…" />
          {isAdmin && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteAll(true)}
              disabled={(pagination?.totalItems ?? 0) === 0 || deleteAllMutation.isPending}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Supprimer toutes les alertes</span>
              <span className="sm:hidden">Tout supprimer</span>
            </Button>
          )}
          <Can permission="alerts.create">
            <Button type="button" size="sm" onClick={() => { setEditing({} as Alert); setForm(emptyForm(fields)); }}>
              <Plus size={14} />
              Nouveau
            </Button>
          </Can>
        </div>
      </div>
      <SimpleTable
        title=""
        subtitle=""
        loading={query.isPending}
        error={query.error}
        headers={['Date', 'Type', 'Produit', 'Référence', 'Stock actuel', 'Seuil minimum', 'Message', 'Statut', 'Actions']}
        rows={data.map((alert: Alert) => {
          const designation = alert.designation ?? alert.product?.name ?? '-';
          const reference = alert.reference ?? alert.product?.reference ?? '-';
          const currentStock = alert.currentStock ?? alert.product?.quantity ?? null;
          const minimumStock = alert.minimumStock ?? alert.product?.minStock ?? null;
          const quantityClass = stockValueClass(currentStock, minimumStock);

          return [
            dateTime(alert.createdAt),
            <span key="type" className="inline-flex items-center gap-1.5 font-medium text-red-700">
              <AlertTriangle size={14} />
              {statusLabel(alert.type)}
            </span>,
            <span key="product" className="font-medium text-slate-900">{designation}</span>,
            <span key="reference" className="font-mono text-xs text-slate-700">{reference}</span>,
            <span key="currentStock" className={quantityClass}>{currentStock ?? '-'}</span>,
            <span key="minimumStock" className="font-medium text-slate-700">{minimumStock ?? '-'}</span>,
            <span key="message" className="block max-w-[340px] whitespace-pre-line text-xs leading-5 text-slate-600">
              {alert.message}
            </span>,
            <AlertStatusBadge key="read" isRead={alert.isRead} />,
            <RowActions
              key="actions"
              onEdit={() => {
                setEditing(alert);
                setForm({ type: alert.type, title: alert.title, message: alert.message, isRead: alert.isRead });
              }}
              onDelete={() => deleteMutation.mutate(alert.id)}
              deleting={deleteMutation.isPending}
              canEdit={can('alerts.update')}
              canDelete={can('alerts.delete')}
            />,
          ];
        })}
        pagination={{
          page,
          limit,
          totalItems: pagination?.totalItems ?? 0,
          totalPages: pagination?.totalPages ?? 0,
          disabled: query.isFetching || deleteMutation.isPending,
          onPageChange: (next) => updateParams({ page: next }),
          onLimitChange: (next) => updateParams({ limit: next, page: 1 }),
        }}
      />
      {editing && can(editing.id ? 'alerts.update' : 'alerts.create') && (
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
      <BulkDeleteDialog
        open={showDeleteAll}
        title="Supprimer toutes les alertes ?"
        message="Cette action supprimera définitivement toutes les alertes actuellement enregistrées. Cette action est irréversible."
        confirmLabel="Supprimer toutes les alertes"
        pending={deleteAllMutation.isPending}
        onCancel={() => setShowDeleteAll(false)}
        onConfirm={() => deleteAllMutation.mutate()}
      />
    </>
  );
}
