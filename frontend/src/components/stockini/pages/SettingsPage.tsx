'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import type { AuditRetentionSettings, DropdownOption } from '@/lib/stockini/types';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { RowActions } from '../shared/RowActions';
import { StateRows } from '../shared/StateRows';
import { Status } from '../shared/Status';
import { cleanPayload, emptyForm } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

function DropdownOptionsManager({ loading, options }: { loading: boolean; options: DropdownOption[] }) {
  const queryClient = useQueryClient();
  const categories = Array.from(new Set([
    'customer_types',
    'payment_methods',
    'payment_types',
    'stock_operation_types',
    'stock_movement_reasons',
    'sale_statuses',
    'purchase_statuses',
    'payment_statuses',
    'report_types',
    'alert_types',
    'units',
    'stock_locations',
    ...options.map((option) => option.category),
  ])).sort();
  const [selectedCategory, setSelectedCategory] = useState(categories[0] ?? 'customer_types');
  const [editing, setEditing] = useState<DropdownOption | null>(null);
  const fields: FieldConfig[] = [
    { name: 'category', label: 'Catégorie', required: true },
    { name: 'label', label: 'Libellé', required: true },
    { name: 'value', label: 'Valeur', required: true },
    { name: 'sortOrder', label: 'Ordre', type: 'number' },
    { name: 'active', label: 'Actif', type: 'checkbox' },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>({ category: selectedCategory, label: '', value: '', sortOrder: '0', active: true });
  const visibleOptions = options.filter((option) => option.category === selectedCategory);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stockini-dropdown-options'] });
    queryClient.invalidateQueries({ queryKey: ['stockini-dropdown-options', selectedCategory] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      return editing?.id
        ? stockiniApi.updateDropdownOption(editing.id, payload)
        : stockiniApi.createDropdownOption(payload);
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      setForm({ category: selectedCategory, label: '', value: '', sortOrder: '0', active: true });
      toast.success('Option enregistrée');
    },
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => stockiniApi.toggleDropdownOption(id, active),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteDropdownOption,
    onSuccess: () => {
      invalidate();
      toast.success('Option supprimée');
    },
    onError: () => toast.error("Option utilisée: désactivez-la au lieu de la supprimer."),
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 p-4">
        <div>
          <CardTitle>Listes déroulantes</CardTitle>
          <p className="mt-1 text-sm text-text-secondary">Options actives triées par ordre puis libellé dans les formulaires.</p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing({} as DropdownOption);
            setForm({ category: selectedCategory, label: '', value: '', sortOrder: String(visibleOptions.length + 1), active: true });
          }}
        >
          <Plus size={14} />
          Ajouter
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${category === selectedCategory ? 'bg-primary/10 font-semibold text-primary' : 'text-text-secondary hover:bg-muted'}`}
            >
              <span>{category}</span>
              <span className="font-mono text-xs">{options.filter((option) => option.category === category).length}</span>
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead>Valeur</TableHead>
                <TableHead>Ordre</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <StateRows loading={loading} error={null} empty={visibleOptions.length === 0} colSpan={5} />
              {visibleOptions.map((option) => (
                <TableRow key={option.id}>
                  <TableCell className="font-medium">{option.label}</TableCell>
                  <TableCell className="font-mono text-xs">{option.value}</TableCell>
                  <TableCell className="font-mono">{option.sortOrder}</TableCell>
                  <TableCell><Status value={option.active ? 'ACTIVE' : 'DISABLED'} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: option.id, active: !option.active })}>
                        {option.active ? 'Désactiver' : 'Activer'}
                      </Button>
                      <RowActions
                        onEdit={() => {
                          setEditing(option);
                          setForm({ category: option.category, label: option.label, value: option.value, sortOrder: String(option.sortOrder), active: option.active });
                        }}
                        onDelete={() => {
                          if (window.confirm('Supprimer cette option ?')) {
                            deleteMutation.mutate(option.id);
                          }
                        }}
                        deleting={deleteMutation.isPending}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {editing && (
        <CrudModal
          title={editing.id ? 'Modifier option' : 'Nouvelle option'}
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
    </Card>
  );
}

function MiniList({ title, items, loading, error }: { title: string; items: string[]; loading: boolean; error: unknown }) {
  return (
    <Card className="shadow-card">
      <CardHeader className="p-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {loading && <p className="text-sm text-text-secondary">Chargement...</p>}
        {Boolean(error) && <p className="text-sm text-red-600">Chargement impossible.</p>}
        {!loading && !error && items.length === 0 && <p className="text-sm text-text-secondary">Aucune donnée.</p>}
        {items.map((item) => (
          <div key={item} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-text-primary">
            {item}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EditableMiniList({
  deleteItem,
  fields,
  items,
  loading,
  queryKey,
  saveItem,
  title,
}: {
  deleteItem: (item: Record<string, any>) => Promise<unknown>;
  fields: FieldConfig[];
  items: Array<Record<string, any>>;
  loading: boolean;
  queryKey: string;
  saveItem: (item: Record<string, any>, editing?: Record<string, any>) => Promise<unknown>;
  title: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const saveMutation = useMutation({
    mutationFn: () => saveItem(cleanPayload(form, fields) as Record<string, string>, editing ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setEditing(null);
      setForm(emptyForm(fields));
      toast.success('Enregistré');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Supprimé');
    },
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
        <CardTitle>{title}</CardTitle>
        <Button type="button" size="sm" onClick={() => { setEditing({}); setForm(emptyForm(fields)); }}>
          <Plus size={14} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {loading && <p className="text-sm text-text-secondary">Chargement...</p>}
        {!loading && items.length === 0 && <p className="text-sm text-text-secondary">Aucune donnée.</p>}
        {items.map((item) => (
          <div key={item.id ?? item.key ?? item.name} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-text-primary">
            <span>{item.name ?? `${item.key}: ${item.value}`}</span>
            <RowActions
              onEdit={() => {
                setEditing(item);
                setForm(item);
              }}
              onDelete={() => deleteMutation.mutate(item)}
              deleting={deleteMutation.isPending}
            />
          </div>
        ))}
      </CardContent>
      {editing && (
        <CrudModal
          title={editing.id || editing.key ? `Modifier ${title.toLowerCase()}` : `Nouveau ${title.toLowerCase()}`}
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
    </Card>
  );
}

// ─── Audit Logs Retention Section ────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

const RETENTION_OPTIONS = [
  { label: 'Illimité (désactiver archivage)', value: 0 },
  { label: '6 mois', value: 6 },
  { label: '12 mois (recommandé)', value: 12 },
  { label: '24 mois', value: 24 },
  { label: '36 mois', value: 36 },
];

function ArchiveConfirmModal({
  eligibleCount,
  retentionMonths,
  loading,
  onConfirm,
  onClose,
}: {
  eligibleCount: number;
  retentionMonths: number;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText === 'ARCHIVER';
  const retentionLabel = retentionMonths === 0 ? 'illimité' : `${retentionMonths} mois`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-text-primary">Archiver les anciens Audit Logs</h2>
          <p className="mt-0.5 text-xs text-text-secondary">Cette opération est irréversible sur la table principale.</p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* Warning */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="mb-2 font-semibold">Cette opération va :</p>
            <ul className="list-inside list-disc space-y-1 text-amber-800 dark:text-amber-400">
              <li>Exporter les logs de plus de <strong>{retentionLabel}</strong> vers MinIO</li>
              <li>Copier les logs dans <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">AuditLogArchive</code></li>
              <li>Supprimer ces logs de la table <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">AuditLog</code> principale</li>
              <li>Réduire la taille de la base de données</li>
            </ul>
          </div>

          {/* Safety note */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <p className="font-semibold text-text-primary">Aucune donnée ne sera perdue.</p>
            <p className="mt-1 text-text-secondary">Les logs resteront consultables depuis :</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-text-secondary">
              <li>l'onglet <strong>Archives</strong> (page Audit Logs)</li>
              <li>la table <code className="rounded bg-muted px-1">audit_log_archives</code></li>
              <li>les fichiers MinIO (.json.gz)</li>
            </ul>
          </div>

          {/* Eligible count */}
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <span className="text-sm text-text-secondary">Logs à archiver :</span>
            <span className="text-xl font-bold text-primary">{eligibleCount.toLocaleString('fr-FR')}</span>
          </div>

          {/* Confirmation input */}
          <div>
            <label className="mb-1.5 block text-sm text-text-secondary">
              Tapez{' '}
              <span className="font-mono font-bold text-text-primary">ARCHIVER</span>
              {' '}pour continuer :
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="ARCHIVER"
              autoFocus
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-app-ring"
            />
            {confirmText.length > 0 && !canConfirm && (
              <p className="mt-1 text-xs text-red-500">Vous devez saisir exactement : ARCHIVER</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            className="bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
          >
            {loading ? 'Archivage en cours…' : 'Archiver maintenant'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuditRetentionCard() {
  const { can } = usePermissions();
  const canArchive = can('audit_logs.archive');
  const queryClient = useQueryClient();
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  const statsQuery = useQuery({
    queryKey: ['audit-log-stats'],
    queryFn: stockiniApi.auditLogStats,
    staleTime: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: ['audit-retention-settings'],
    queryFn: stockiniApi.auditRetentionSettings,
    enabled: canArchive,
    staleTime: 60_000,
  });

  const archivesQuery = useQuery({
    queryKey: ['audit-archives-list'],
    queryFn: stockiniApi.listAuditArchives,
    enabled: canArchive,
    staleTime: 60_000,
  });

  const [localSettings, setLocalSettings] = useState<Partial<AuditRetentionSettings>>({});
  const effectiveSettings = { ...settingsQuery.data, ...localSettings };

  const saveSettingsMutation = useMutation({
    mutationFn: () => stockiniApi.updateRetentionSettings(localSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-retention-settings'] });
      setLocalSettings({});
      toast.success('Paramètres de rétention enregistrés');
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });

  const archiveMutation = useMutation({
    mutationFn: stockiniApi.triggerAuditArchive,
    onSuccess: (result) => {
      setShowArchiveModal(false);
      if (result.skipped) {
        toast.success(`Archivage ignoré : ${result.reason}`);
      } else {
        toast.success(`${result.archivedCount.toLocaleString('fr-FR')} logs archivés (${formatBytes(result.exportedSize)} compressés)`);
      }
      queryClient.invalidateQueries({ queryKey: ['audit-log-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-archives-list'] });
    },
    onError: (err: Error) => {
      setShowArchiveModal(false);
      toast.error(err.message || 'Archivage échoué');
    },
  });

  const downloadMutation = useMutation({
    mutationFn: stockiniApi.getLastAuditArchiveDownload,
    onSuccess: (result) => {
      if (!result) { toast.error('Aucune archive disponible'); return; }
      window.open(result.url, '_blank');
    },
    onError: () => toast.error('Erreur lors de la récupération du lien'),
  });

  const stats = statsQuery.data;
  const hasLocalChanges = Object.keys(localSettings).length > 0;
  const retentionMonths = stats?.retentionMonths ?? 12;

  return (
    <>
      {showArchiveModal && stats && (
        <ArchiveConfirmModal
          eligibleCount={stats.eligibleCount}
          retentionMonths={retentionMonths}
          loading={archiveMutation.isPending}
          onConfirm={() => archiveMutation.mutate()}
          onClose={() => setShowArchiveModal(false)}
        />
      )}

      <Card className="shadow-card">
        {/* Header with quick stats */}
        <CardHeader className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Rétention des Audit Logs</CardTitle>
                <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Conservation : {retentionMonths === 0 ? 'Illimité' : `${retentionMonths} mois`}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                Les logs plus anciens que la durée configurée sont exportés vers MinIO, copiés en archive, puis supprimés de la table principale.
              </p>
            </div>
          </div>

          {/* Quick stats row */}
          <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3 text-sm">
            <div>
              <span className="text-text-secondary">Logs actifs : </span>
              <span className="font-semibold text-text-primary">{stats ? stats.activeCount.toLocaleString('fr-FR') : '…'}</span>
            </div>
            <div>
              <span className="text-text-secondary">Archives : </span>
              <span className="font-semibold text-text-primary">{stats ? stats.archiveCount.toLocaleString('fr-FR') : '…'}</span>
            </div>
            <div>
              <span className="text-text-secondary">Taille active : </span>
              <span className="font-semibold text-text-primary">{stats ? formatBytes(stats.activeEstimatedBytes) : '…'}</span>
            </div>
            <div>
              <span className="text-text-secondary">Dernier archivage : </span>
              <span className="font-semibold text-text-primary">
                {stats
                  ? stats.lastArchiveDate
                    ? new Date(stats.lastArchiveDate).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'Jamais'
                  : '…'}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 p-4 pt-0">

          {/* Stats tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Logs actifs', value: stats ? stats.activeCount.toLocaleString('fr-FR') : '…' },
              { label: 'Logs archivés', value: stats ? stats.archiveCount.toLocaleString('fr-FR') : '…' },
              { label: 'Taille active (est.)', value: stats ? formatBytes(stats.activeEstimatedBytes) : '…' },
              { label: 'Taille archives (est.)', value: stats ? formatBytes(stats.archiveEstimatedBytes) : '…' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs text-text-secondary">{s.label}</p>
                <p className="mt-0.5 text-lg font-semibold text-text-primary">{s.value}</p>
              </div>
            ))}
          </div>

          {stats && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
              <span>
                Prochaine coupure : logs antérieurs au{' '}
                <span className="font-medium text-text-primary">{new Date(stats.nextCutoffDate).toLocaleDateString('fr-FR')}</span>
              </span>
              {stats.eligibleCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                  {stats.eligibleCount.toLocaleString('fr-FR')} logs éligibles à l'archivage
                </span>
              )}
            </div>
          )}

          {/* Settings — admin only */}
          {canArchive && settingsQuery.data && (
            <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
              <p className="text-sm font-semibold text-text-primary">Paramètres de rétention</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Conservation (mois)</label>
                  <select
                    value={effectiveSettings.retentionMonths ?? 12}
                    onChange={(e) => setLocalSettings((s) => ({ ...s, retentionMonths: Number(e.target.value) }))}
                    className="w-full h-8 rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-app-ring"
                  >
                    {RETENTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <input
                    type="checkbox"
                    id="archiveEnabled"
                    checked={effectiveSettings.archiveEnabled ?? true}
                    onChange={(e) => setLocalSettings((s) => ({ ...s, archiveEnabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-border"
                  />
                  <label htmlFor="archiveEnabled" className="text-sm text-text-primary">Archivage automatique (03h00)</label>
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <input
                    type="checkbox"
                    id="compressExport"
                    checked={effectiveSettings.compressExport ?? true}
                    onChange={(e) => setLocalSettings((s) => ({ ...s, compressExport: e.target.checked }))}
                    className="h-4 w-4 rounded border-border"
                  />
                  <label htmlFor="compressExport" className="text-sm text-text-primary">Compression (.gz)</label>
                </div>
              </div>
              {hasLocalChanges && (
                <Button
                  size="sm"
                  onClick={() => saveSettingsMutation.mutate()}
                  disabled={saveSettingsMutation.isPending}
                >
                  {saveSettingsMutation.isPending ? 'Enregistrement…' : 'Enregistrer les paramètres'}
                </Button>
              )}
            </div>
          )}

          {/* Actions */}
          {canArchive && (
            <div className="flex flex-wrap gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowArchiveModal(true)}
                disabled={archiveMutation.isPending}
              >
                Lancer l'archivage
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => downloadMutation.mutate()}
                disabled={downloadMutation.isPending || (archivesQuery.data?.length ?? 0) === 0}
              >
                Télécharger dernière archive
              </Button>
            </div>
          )}

          {/* Archive file list */}
          {canArchive && archivesQuery.data && archivesQuery.data.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
                Fichiers MinIO ({archivesQuery.data.length})
              </p>
              <div className="max-h-40 overflow-auto rounded-lg border border-border">
                {archivesQuery.data.map((key) => (
                  <div key={key} className="border-b border-border/50 px-3 py-1.5 font-mono text-xs text-text-secondary last:border-0 hover:bg-muted/50">
                    {key}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const settings = useQuery({ queryKey: ['stockini-settings'], queryFn: stockiniApi.settings });
  const categories = useQuery({ queryKey: ['stockini-categories'], queryFn: stockiniApi.categories });
  const brands = useQuery({ queryKey: ['stockini-brands'], queryFn: stockiniApi.brands });
  const dropdownOptions = useQuery({ queryKey: ['stockini-dropdown-options'], queryFn: stockiniApi.dropdownOptions });
  return (
    <>
      <PageHeader title="Paramètres Stockini" subtitle="Référentiels backend, catégories, marques et listes déroulantes." />
      <div className="mb-4">
        <DropdownOptionsManager loading={dropdownOptions.isLoading} options={dropdownOptions.data ?? []} />
      </div>
      <div className="mb-4">
        <AuditRetentionCard />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <EditableMiniList
          title="Paramètres"
          queryKey="stockini-settings"
          loading={settings.isLoading}
          items={(settings.data ?? []).map((item) => ({ key: item.key, value: item.value }))}
          fields={[{ name: 'key', label: 'Clé', required: true }, { name: 'value', label: 'Valeur', required: true }]}
          saveItem={(item, editing) => editing?.key ? stockiniApi.updateSetting(editing.key, { value: item.value }) : stockiniApi.createSetting({ key: item.key, value: item.value })}
          deleteItem={(item) => stockiniApi.deleteSetting(item.key)}
        />
        <EditableMiniList
          title="Catégories"
          queryKey="stockini-categories"
          loading={categories.isLoading}
          items={categories.data ?? []}
          fields={[{ name: 'name', label: 'Nom', required: true }, { name: 'description', label: 'Description' }]}
          saveItem={(item, editing) => editing?.id ? stockiniApi.updateCategory(editing.id, item) : stockiniApi.createCategory({ name: item.name, description: item.description })}
          deleteItem={(item) => stockiniApi.deleteCategory(item.id)}
        />
        <EditableMiniList
          title="Marques"
          queryKey="stockini-brands"
          loading={brands.isLoading}
          items={brands.data ?? []}
          fields={[{ name: 'name', label: 'Nom', required: true }]}
          saveItem={(item, editing) => editing?.id ? stockiniApi.updateBrand(editing.id, item) : stockiniApi.createBrand({ name: item.name })}
          deleteItem={(item) => stockiniApi.deleteBrand(item.id)}
        />
      </div>
    </>
  );
}

// Suppress unused warning — MiniList is defined for potential use
export { MiniList };
