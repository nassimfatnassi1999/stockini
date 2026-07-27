'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, BellOff, Eye, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { ResponsiveTableContainer } from '@/components/ui/ResponsiveTableContainer';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import type { Alert } from '@/lib/stockini/types';
import { Can } from '@/components/shared/Can';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { CrudModal } from '../shared/CrudModal';
import { KebabMenu } from '../shared/KebabMenu';
import { SearchBox } from '../shared/SearchBox';
import { cleanPayload, emptyForm, useDropdownOptions } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';
import { useUrlPagination } from '@/hooks/useUrlPagination';
import { getValidPage } from '@/lib/data-table-pagination';
import { BulkDeleteDialog } from '../shared/BulkDeleteDialog';
import { isAdministratorRole } from '@/lib/bulk-delete';
import { formatAlertDate, getAlertTypePresentation, getAlertViewModel } from '@/lib/alerts-presentation';
import { cn } from '@/lib/utils';
import { AlertDetailsDrawer } from '../alerts/AlertDetailsDrawer';

const typeToneClasses = {
  danger: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
};

function AlertTypeBadge({ type }: { type: string }) {
  const presentation = getAlertTypePresentation(type);
  const Icon = presentation.tone === 'neutral' ? Bell : AlertTriangle;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold', typeToneClasses[presentation.tone])}>
      <Icon size={13} aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

function StockValue({ current, minimum }: { current: number | null; minimum: number | null }) {
  const className = current === null
    ? 'border-slate-200 bg-slate-50 text-slate-600'
    : current <= 0
      ? 'border-red-200 bg-red-50 text-red-700'
      : minimum !== null && current <= minimum
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return <span className={cn('inline-flex min-w-9 justify-center rounded-md border px-2 py-1 text-xs font-semibold tabular-nums', className)}>{current ?? '—'}</span>;
}

function MinimumStock({ value }: { value: number | null }) {
  return <span className="inline-flex min-w-9 justify-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium tabular-nums text-slate-700">{value ?? '—'}</span>;
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <tr key={index} className="h-16 border-b border-border/50 last:border-0">
          {Array.from({ length: 7 }, (__, cell) => (
            <td key={cell} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-slate-100" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-3 sm:hidden" aria-label="Chargement des alertes">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-xl border border-border/70 bg-white p-4 shadow-sm">
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-6 w-32 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ searching, canCreate, onCreate }: { searching: boolean; canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-text-muted"><BellOff size={20} /></span>
      <h2 className="mt-3 text-sm font-semibold text-text-primary">{searching ? 'Aucune alerte trouvée' : 'Aucune alerte'}</h2>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">
        {searching ? 'Essayez de modifier votre recherche.' : 'Aucune alerte n’est actuellement enregistrée.'}
      </p>
      {!searching && canCreate && <Button type="button" size="sm" className="mt-4" onClick={onCreate}><Plus size={15} />Créer une alerte</Button>}
    </div>
  );
}

export function AlertsPage() {
  const queryClient = useQueryClient();
  const { can, role } = usePermissions();
  const { page, limit, search, setSearch, urlSearch, updateParams } = useUrlPagination();
  const [editing, setEditing] = useState<Alert | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
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
    queryFn: ({ signal }) => stockiniApi.alertPage({ page, limit, search: urlSearch || undefined }, signal),
    placeholderData: (previous) => previous,
  });
  const data = query.data?.data ?? [];
  const pagination = query.data?.pagination;

  useEffect(() => {
    setSelectedAlert(null);
  }, [page, limit, urlSearch]);

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

  const openCreate = () => {
    setEditing({} as Alert);
    setForm(emptyForm(fields));
  };
  const openEdit = (alert: Alert) => {
    setEditing(alert);
    setForm({ type: alert.type, title: alert.title, message: alert.message, isRead: alert.isRead });
  };
  const rowMenu = (alert: Alert) => [
    { label: 'Voir les détails', icon: <Eye />, onClick: () => setSelectedAlert(alert) },
    { label: 'Modifier', icon: <Pencil />, onClick: () => openEdit(alert), hidden: !can('alerts.update') },
    { divider: true, hidden: !can('alerts.delete') },
    { label: 'Supprimer', icon: <Trash2 />, onClick: () => deleteMutation.mutate(alert.id), disabled: deleteMutation.isPending, variant: 'destructive' as const, hidden: !can('alerts.delete') },
  ];
  const totalItems = pagination?.totalItems ?? 0;
  const hasError = Boolean(query.error) && !query.isPending;

  return (
    <>
      <header className="mb-4 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="app-page-title">Alertes</h1>
            {!query.isPending && <span className="inline-flex rounded-full border border-border bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-text-secondary" aria-label={`${totalItems} alertes au total`}>{totalItems}</span>}
          </div>
          <p className="app-page-subtitle">Alertes de stock, factures impayées, retards achats et système.</p>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 lg:flex lg:justify-end">
          <SearchBox value={search} onChange={setSearch} placeholder="Rechercher une alerte…" clearable className="col-span-3 w-full sm:col-span-3 lg:col-span-1 lg:w-72 xl:w-80" />
          <Can permission="alerts.create">
            <Button type="button" className="h-10" onClick={openCreate}><Plus size={16} />Nouveau</Button>
          </Can>
          {isAdmin && (
            <Button type="button" variant="destructive" className="h-10 px-3 sm:px-4" onClick={() => setShowDeleteAll(true)} disabled={totalItems === 0 || deleteAllMutation.isPending} aria-label="Supprimer toutes les alertes" title="Supprimer toutes les alertes">
              {deleteAllMutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Trash2 size={16} />}
              <span className="hidden sm:inline">Tout supprimer</span>
            </Button>
          )}
        </div>
      </header>

      {query.isPending ? (
        <><LoadingCards /><div className="hidden overflow-hidden rounded-xl border border-border/70 bg-white shadow-card sm:block"><ResponsiveTableContainer><table className="w-full min-w-[920px]"><tbody><LoadingRows /></tbody></table></ResponsiveTableContainer></div></>
      ) : hasError ? (
        <div className="rounded-xl border border-red-200 bg-white px-5 py-12 text-center shadow-card">
          <AlertTriangle className="mx-auto text-red-500" size={24} />
          <h2 className="mt-3 text-sm font-semibold text-text-primary">Impossible de charger les alertes</h2>
          <p className="mt-1 text-sm text-text-secondary">Une erreur est survenue pendant le chargement.</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}><RefreshCw size={15} />Réessayer</Button>
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-xl border border-border/70 bg-white shadow-card"><EmptyState searching={Boolean(urlSearch)} canCreate={can('alerts.create')} onCreate={openCreate} /></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-white shadow-card">
          <div className="divide-y divide-border/60 sm:hidden">
            {data.map((alert) => {
              const details = getAlertViewModel(alert);
              return (
                <article key={`${page}-${limit}-${urlSearch}-${alert.id}`} className="p-4 transition-colors hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 truncate pr-1 text-sm font-semibold text-text-primary" title={details.designation}>{details.designation}</h2>
                    <KebabMenu items={rowMenu(alert)} ariaLabel="Actions de l’alerte" triggerClassName="-mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ring" />
                  </div>
                  <div className="mt-2"><AlertTypeBadge type={alert.type} /></div>
                  <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                    <div className="col-span-3 flex min-w-0 items-center gap-1"><dt className="text-text-muted">Réf.</dt><dd className="truncate font-mono font-medium text-text-primary" title={details.reference}>{details.reference}</dd></div>
                    <div><dt className="text-text-muted">Stock</dt><dd className="mt-1"><StockValue current={details.currentStock} minimum={details.minimumStock} /></dd></div>
                    <div><dt className="text-text-muted">Seuil</dt><dd className="mt-1"><MinimumStock value={details.minimumStock} /></dd></div>
                    <div className="text-right"><dt className="text-text-muted">Date</dt><dd className="mt-1 whitespace-nowrap font-medium text-text-primary">{formatAlertDate(alert.createdAt)}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>

          <div className="hidden sm:block">
            <ResponsiveTableContainer>
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-surface">
                  <tr className="h-11 border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <th className="px-4">Date</th><th className="px-4">Type</th><th className="px-4">Produit</th><th className="px-4">Référence</th><th className="px-4 text-center">Stock actuel</th><th className="px-4 text-center">Seuil minimum</th><th className="w-16 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {data.map((alert) => {
                    const details = getAlertViewModel(alert);
                    return (
                      <tr key={`${page}-${limit}-${urlSearch}-${alert.id}`} className="h-16 transition-colors hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-text-secondary">{formatAlertDate(alert.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-2"><AlertTypeBadge type={alert.type} /></td>
                        <td className="max-w-[250px] px-4 py-2"><span className="block truncate font-medium text-text-primary" title={details.designation}>{details.designation}</span></td>
                        <td className="max-w-[150px] px-4 py-2"><span className="block truncate font-mono text-xs text-text-secondary" title={details.reference}>{details.reference}</span></td>
                        <td className="px-4 py-2 text-center"><StockValue current={details.currentStock} minimum={details.minimumStock} /></td>
                        <td className="px-4 py-2 text-center"><MinimumStock value={details.minimumStock} /></td>
                        <td className="px-4 py-2 text-right"><KebabMenu items={rowMenu(alert)} ariaLabel="Actions de l’alerte" triggerClassName="inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ring" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTableContainer>
          </div>
          <DataTablePagination page={page} limit={limit} totalItems={totalItems} totalPages={pagination?.totalPages ?? 0} disabled={query.isFetching || deleteMutation.isPending} onPageChange={(next) => updateParams({ page: next })} onLimitChange={(next) => updateParams({ limit: next, page: 1 })} />
        </div>
      )}

      <AlertDetailsDrawer alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
      {editing && can(editing.id ? 'alerts.update' : 'alerts.create') && (
        <CrudModal title={editing.id ? 'Modifier alerte' : 'Nouvelle alerte'} fields={fields} form={form} onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))} onClose={() => setEditing(null)} onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }} saving={saveMutation.isPending} />
      )}
      <BulkDeleteDialog open={showDeleteAll} title="Supprimer toutes les alertes ?" message="Cette action supprimera définitivement toutes les alertes actuellement enregistrées. Cette action est irréversible." confirmLabel="Supprimer toutes les alertes" pending={deleteAllMutation.isPending} onCancel={() => setShowDeleteAll(false)} onConfirm={() => deleteAllMutation.mutate()} />
    </>
  );
}
