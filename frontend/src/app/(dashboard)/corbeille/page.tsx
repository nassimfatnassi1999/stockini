'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { PermanentDeleteWithImpactDialog } from '@/components/stockini/PermanentDeleteWithImpactDialog';
import { EmptyTrashDialog } from '@/components/stockini/EmptyTrashDialog';
import { FileText, RotateCcw, Trash2 } from 'lucide-react';
import { KebabMenu } from '@/components/stockini/shared/KebabMenu';
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
  { value: 'document', label: 'Documents' },
];

const ENTITY_LABELS: Record<TrashEntityType, string> = {
  product: 'Produit',
  customer: 'Client',
  supplier: 'Fournisseur',
  sale: 'Vente',
  purchase: 'Achat',
  payment: 'Paiement',
  document: 'Document',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  DEVIS: 'Devis',
  BON_COMMANDE: 'Bon de commande',
  BON_LIVRAISON: 'Bon de livraison',
  FACTURE: 'Facture',
  AVOIR: 'Avoir',
};

function fmtSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

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
  const { can } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [permanentTarget, setPermanentTarget] = useState<TrashItem | null>(null);
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);

  const canRestore = can('trash.restore');
  const canPermanentDelete = can('trash.permanent_delete');
  const canEmpty = can('trash.empty');

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
      queryClient.invalidateQueries({ queryKey: ['stockini-customers-page'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-customer-options'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast.success('Élément restauré avec succès.');
    },
    onError: () => {
      toast.error('Échec de la restauration');
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: ({ entity, id, confirmCascade }: { entity: TrashEntityType; id: string; confirmCascade?: boolean }) =>
      stockiniApi.permanentDeleteTrashItem(entity, id, confirmCascade),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['trash-impact'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-sales'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-payments'] });
      queryClient.invalidateQueries({ queryKey: ['avoirs'] });
      toast.success('Élément supprimé définitivement.');
      setPermanentTarget(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Échec de la suppression définitive');
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: () => stockiniApi.emptyTrash(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-customers-page'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-customer-options'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['cash'] });
      setShowEmptyDialog(false);
      if (result.failedCount > 0) {
        toast.warning(`Corbeille partiellement vidée (${result.failedCount} élément(s) non supprimé(s))`);
      } else {
        toast.success('Corbeille vidée définitivement');
      }
    },
    onError: () => {
      toast.error('Échec du vidage de la corbeille');
    },
  });

  const items = trashQuery.data ?? [];

  return (
    <PermissionGuard permission="trash.view">
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="app-page-title">Corbeille</h1>
          <p className="app-page-subtitle">
            {items.length} élément{items.length !== 1 ? 's' : ''} supprimé{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canEmpty && items.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setShowEmptyDialog(true)}
          >
            <Trash2 size={15} />
            Vider la corbeille
          </Button>
        )}
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
                  {(activeTab === 'all' || activeTab === 'document') && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Type doc
                    </th>
                  )}
                  {(activeTab === 'all' || activeTab === 'document') && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Taille
                    </th>
                  )}
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
                      <span className="app-status-badge border-slate-200 bg-slate-50 text-slate-700 inline-flex items-center gap-1">
                        {item.entity === 'document' && <FileText size={11} />}
                        {ENTITY_LABELS[item.entity]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-text-secondary">
                      {item.reference || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary max-w-[200px] truncate">
                      {item.name}
                    </td>
                    {(activeTab === 'all' || activeTab === 'document') && (
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {item.documentType ? (DOC_TYPE_LABELS[item.documentType] ?? item.documentType) : '—'}
                      </td>
                    )}
                    {(activeTab === 'all' || activeTab === 'document') && (
                      <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                        {item.entity === 'document' ? fmtSize(item.fileSize) : '—'}
                      </td>
                    )}
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
                      <KebabMenu
                        items={[
                          {
                            label: 'Restaurer',
                            icon: <RotateCcw size={14} />,
                            onClick: () => restoreMutation.mutate({ entity: item.entity, id: item.id }),
                            disabled: restoreMutation.isPending,
                            hidden: !canRestore,
                          },
                          {
                            label: 'Supprimer définitivement',
                            icon: <Trash2 size={14} />,
                            onClick: () => setPermanentTarget(item),
                            variant: 'destructive',
                            hidden: !canPermanentDelete,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {permanentTarget && (
        <PermanentDeleteWithImpactDialog
          item={permanentTarget}
          isPending={permanentDeleteMutation.isPending}
          onConfirm={(confirmCascade) =>
            permanentDeleteMutation.mutate({
              entity: permanentTarget.entity,
              id: permanentTarget.id,
              confirmCascade,
            })
          }
          onCancel={() => setPermanentTarget(null)}
        />
      )}

      {showEmptyDialog && (
        <EmptyTrashDialog
          isPending={emptyTrashMutation.isPending}
          onConfirm={() => emptyTrashMutation.mutate()}
          onCancel={() => setShowEmptyDialog(false)}
        />
      )}
    </div>
    </PermissionGuard>
  );
}
