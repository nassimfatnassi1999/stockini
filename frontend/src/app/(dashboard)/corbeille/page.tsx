'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import { hasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { TrashEntityType, TrashItem } from '@/lib/stockini/types';

type TabValue = 'all' | TrashEntityType;

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'product', label: 'Produits' },
  { value: 'customer', label: 'Clients' },
  { value: 'supplier', label: 'Fournisseurs' },
  { value: 'sale', label: 'Ventes' },
  { value: 'purchase', label: 'Achats' },
  { value: 'payment', label: 'Paiements' },
];

const ENTITY_LABELS: Record<TrashEntityType, string> = {
  product: 'Produit',
  customer: 'Client',
  supplier: 'Fournisseur',
  sale: 'Vente',
  purchase: 'Achat',
  payment: 'Paiement',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CorbeillePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [permanentTarget, setPermanentTarget] = useState<TrashItem | null>(null);

  const canRestore = hasPermission('trash.restore');
  const canPermanentDelete = hasPermission('trash.permanent_delete');

  const entity = activeTab === 'all' ? undefined : activeTab;

  const trashQuery = useQuery<TrashItem[]>({
    queryKey: ['trash', activeTab],
    queryFn: () => stockiniApi.trash(entity),
    placeholderData: (prev) => prev,
  });

  const restoreMutation = useMutation({
    mutationFn: ({ entity, id }: { entity: TrashEntityType; id: string }) =>
      stockiniApi.restoreTrashItem(entity, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      toast.success('Élément restauré avec succès.');
    },
    onError: () => {
      toast.error('Échec de la restauration');
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: ({ entity, id }: { entity: TrashEntityType; id: string }) =>
      stockiniApi.permanentDeleteTrashItem(entity, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Élément supprimé définitivement.');
      setPermanentTarget(null);
    },
    onError: () => {
      toast.error('Échec de la suppression définitive');
    },
  });

  const items = trashQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="app-page-title">Corbeille</h1>
        <p className="app-page-subtitle">
          {items.length} élément{items.length !== 1 ? 's' : ''} supprimé{items.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border/70 bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={[
              'shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === tab.value
                ? 'bg-white text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-hidden border border-border/70 bg-white">
        {trashQuery.isLoading ? (
          <div className="px-4 py-12 text-center text-sm text-text-muted">Chargement…</div>
        ) : trashQuery.isError ? (
          <div className="px-4 py-12 text-center text-sm text-red-600">
            Erreur lors du chargement de la corbeille
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-text-muted">
            La corbeille est vide
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Module
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Référence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Nom / Désignation
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Date suppression
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Supprimé par
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Statut
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {items.map((item) => (
                  <tr key={`${item.entity}-${item.id}`} className="h-12 transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <span className="app-status-badge border-slate-200 bg-slate-50 text-slate-700">
                        {ENTITY_LABELS[item.entity]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-text-secondary">
                      {item.reference || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary max-w-[200px] truncate">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {formatDate(item.deletedAt)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {item.deletedBy ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {item.status ? (
                        <span className="app-status-badge border-red-200 bg-red-50 text-red-700">
                          {item.status}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canRestore && (
                          <button
                            type="button"
                            aria-label={`Restaurer ${item.name}`}
                            disabled={restoreMutation.isPending}
                            onClick={() => restoreMutation.mutate({ entity: item.entity, id: item.id })}
                            className="app-action-button text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                        {canPermanentDelete && (
                          <button
                            type="button"
                            aria-label={`Supprimer définitivement ${item.name}`}
                            onClick={() => setPermanentTarget(item)}
                            className="app-action-button app-action-delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {permanentTarget && (
        <PermanentDeleteDialog
          label={`${ENTITY_LABELS[permanentTarget.entity]} — ${permanentTarget.name}`}
          isPending={permanentDeleteMutation.isPending}
          onConfirm={() =>
            permanentDeleteMutation.mutate({ entity: permanentTarget.entity, id: permanentTarget.id })
          }
          onCancel={() => setPermanentTarget(null)}
        />
      )}
    </div>
  );
}
