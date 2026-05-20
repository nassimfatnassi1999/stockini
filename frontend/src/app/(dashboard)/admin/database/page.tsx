'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Box,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Server,
  Shield,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  Wrench,
  XCircle,
  Plus,
  Eye,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { Can } from '@/components/shared/Can';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BackupInfo {
  filename: string;
  size: number;
  createdAt: string;
  createdBy: string;
  type: string;
  status?: 'valid' | 'invalid' | 'missing-sql';
}

interface SystemHealth {
  database: { status: 'ok' | 'error'; message?: string; responseMs?: number };
  minio: { status: 'ok' | 'error'; message?: string };
  smtp: { status: 'ok' | 'error'; message?: string };
  disk: { backupsSize: number; uploadsSize: number };
  stats: {
    customers: number;
    products: number;
    sales: number;
    documents: number;
    auditLogs: number;
    dbSizeBytes: number;
  };
  lastBackup: string | null;
  uptime: number;
}

interface ImportPreview {
  rows: Record<string, unknown>[];
  errors: string[];
}

interface SystemdService {
  name: string;
  serviceName: string;
  status: 'active' | 'inactive' | 'failed' | 'not_found';
  healthy: boolean;
}

interface InfrastructureStats {
  cpu: { usage: number; cores: number; temperature: number | null; model: string };
  ram: { total: number; used: number; free: number; usagePercent: number };
  disk: { total: number; used: number; free: number; usagePercent: number };
  system: { uptime: string; platform: string; hostname: string; loadAverage: number[] };
  docker?: { containersRunning: number; containersStopped: number; unavailable?: boolean };
  services?: SystemdService[];
  network: { rx: string; tx: string };
  deployment: { mode: 'docker' | 'systemd'; environment: 'development' | 'production' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: 'ok' | 'error'; label: string }) {
  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
      status === 'ok'
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    )}>
      {status === 'ok'
        ? <CheckCircle2 size={13} />
        : <XCircle size={13} />}
      {label}
    </div>
  );
}

// ─── Backup Status Badge ──────────────────────────────────────────────────────

function BackupStatusBadge({ status }: { status?: string }) {
  if (status === 'invalid') {
    return (
      <div className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <XCircle size={10} /> Invalide
      </div>
    );
  }
  if (status === 'missing-sql') {
    return (
      <div className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
        <AlertTriangle size={10} /> SQL manquant
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle2 size={10} /> Valide
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  confirmKeyword?: string;
  dangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirmer',
  confirmKeyword = 'CONFIRMER',
  dangerous,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const needsTyping = dangerous;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        </div>
        <p className="mb-4 text-sm text-text-secondary">{message}</p>
        {needsTyping && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-text-secondary">
              Tapez <span className="font-mono font-bold text-red-600">{confirmKeyword}</span> pour valider
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder={confirmKeyword}
              autoFocus
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
          <Button
            size="sm"
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={needsTyping && typed !== confirmKeyword}
            onClick={() => { setTyped(''); onConfirm(); }}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: SAUVEGARDES
// ═══════════════════════════════════════════════════════════

function BackupsTab() {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ type: 'delete' | 'restore-file' | 'restore-server'; filename?: string } | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<BackupInfo[]>('/admin/database/backups');
      setBackups(data);
    } catch {
      toast.error('Erreur lors du chargement des sauvegardes');
    } finally {
      setLoading(false);
    }
  }, []);

  const createBackup = async () => {
    setCreating(true);
    try {
      const { data } = await api.post<{ success: boolean; filename: string; size: number }>('/admin/database/backup');
      toast.success(`Sauvegarde créée : ${data.filename}`);
      await loadBackups();
    } catch {
      toast.error('Échec de la création de la sauvegarde');
    } finally {
      setCreating(false);
    }
  };

  const downloadBackup = async (filename: string) => {
    const url = `/api/admin/database/backups/${encodeURIComponent(filename)}/download`;
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!res.ok) {
        let msg = `Erreur HTTP ${res.status}`;
        try { const json = await res.json() as { message?: string }; msg = json.message ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('Fichier reçu vide');
      const burl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = burl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(burl);
      toast.success('Sauvegarde téléchargée');
    } catch (err) {
      console.error('[DOWNLOAD] Backup error:', err);
      toast.error(`Erreur téléchargement : ${(err as Error).message}`);
    }
  };

  const deleteBackup = async (filename: string) => {
    try {
      await api.delete(`/admin/database/backups/${encodeURIComponent(filename)}`);
      toast.success('Sauvegarde supprimée');
      await loadBackups();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleRestoreFile = async (file: File) => {
    setRestoring(true);
    try {
      // Use fetch directly to avoid axios interceptor double-toast on 500 errors.
      // Never set Content-Type manually with FormData — the browser must add the boundary.
      const token = typeof window !== 'undefined' ? (localStorage.getItem('access_token') ?? '') : '';
      const form = new FormData();
      form.append('file', file);

      const res = await fetch('/api/admin/database/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      type RestoreResponse = { success?: boolean; restored?: string[]; message?: string };
      let json: RestoreResponse = {};
      try { json = await res.json() as RestoreResponse; } catch { /* ignore parse errors */ }

      if (!res.ok) {
        throw new Error(json.message ?? `Erreur HTTP ${res.status}`);
      }

      toast.success(`Restauration réussie : ${(json.restored ?? []).join(', ')}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(`Erreur restauration : ${(err as Error).message}`);
    } finally {
      setRestoring(false);
      if (restoreRef.current) restoreRef.current.value = '';
    }
  };

  const restoreByFilename = async (filename: string) => {
    setRestoring(true);
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('access_token') ?? '') : '';
      const res = await fetch(`/api/admin/database/backups/${encodeURIComponent(filename)}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      type RestoreResponse = { success?: boolean; restored?: string[]; message?: string };
      let json: RestoreResponse = {};
      try { json = await res.json() as RestoreResponse; } catch { /* ignore */ }
      if (!res.ok) {
        throw new Error(json.message ?? `Erreur HTTP ${res.status}`);
      }
      toast.success(`Restauration réussie : ${(json.restored ?? []).join(', ')}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error(`Erreur restauration : ${(err as Error).message}`);
    } finally {
      setRestoring(false);
    }
  };

  // Load on mount
  useState(() => { void loadBackups(); });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Sauvegardes système</h2>
          <p className="text-xs text-text-secondary">Créez et gérez les sauvegardes complètes de votre ERP</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadBackups} disabled={loading}>
            <RefreshCw size={13} className={cn('mr-1.5', loading && 'animate-spin')} />
            Actualiser
          </Button>
          <Can permission="database.backup">
            <Button size="sm" onClick={createBackup} disabled={creating}>
              {creating
                ? <RefreshCw size={13} className="mr-1.5 animate-spin" />
                : <Plus size={13} className="mr-1.5" />}
              {creating ? 'Création...' : 'Créer une sauvegarde'}
            </Button>
          </Can>
        </div>
      </div>

      {/* Restore zone */}
      <Can permission="database.restore">
        <Card className="border-dashed border-orange-300 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-900/10">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Upload size={18} className="text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">Restaurer depuis un fichier</p>
              <p className="text-xs text-text-secondary">Uploadez un fichier .zip de sauvegarde pour restaurer</p>
            </div>
            <input
              ref={restoreRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setConfirm({ type: 'restore-file' });
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={restoring}
              onClick={() => restoreRef.current?.click()}
              className="border-orange-300 text-orange-700 hover:bg-orange-100"
            >
              {restoring ? <RefreshCw size={13} className="mr-1.5 animate-spin" /> : <Upload size={13} className="mr-1.5" />}
              {restoring ? 'Restauration...' : 'Choisir un fichier'}
            </Button>
          </CardContent>
        </Card>
      </Can>

      {/* Backup list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={20} className="animate-spin text-text-muted" />
              <span className="ml-2 text-sm text-text-muted">Chargement...</span>
            </div>
          ) : !backups || backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Archive size={40} className="mb-3 text-text-muted" />
              <p className="text-sm font-medium text-text-secondary">Aucune sauvegarde</p>
              <p className="mt-1 text-xs text-text-muted">Créez votre première sauvegarde</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Fichier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Taille</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Archive size={14} className="text-text-muted" />
                        <span className="font-mono text-xs text-text-primary">{b.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{formatBytes(b.size)}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{formatDate(b.createdAt)}</td>
                    <td className="px-4 py-3">
                      <BackupStatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => void downloadBackup(b.filename)}
                        >
                          <Download size={12} className="mr-1" /> Télécharger
                        </Button>
                        <Can permission="database.restore">
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              'h-7 px-2',
                              b.status === 'valid'
                                ? 'border-orange-200 text-orange-600 hover:bg-orange-50'
                                : 'cursor-not-allowed opacity-50',
                            )}
                            disabled={b.status !== 'valid' || restoring}
                            title={b.status !== 'valid' ? 'Ce backup ne peut pas être restauré' : undefined}
                            onClick={() => b.status === 'valid' && setConfirm({ type: 'restore-server', filename: b.filename })}
                          >
                            <Upload size={12} className="mr-1" /> Restaurer
                          </Button>
                        </Can>
                        <Can permission="database.backup">
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              'h-7 px-2',
                              b.status !== 'valid'
                                ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100'
                                : 'border-red-200 text-red-600 hover:bg-red-50',
                            )}
                            onClick={() => setConfirm({ type: 'delete', filename: b.filename })}
                            title={b.status !== 'valid' ? 'Supprimer ce backup invalide' : undefined}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Confirm modals */}
      <ConfirmDialog
        open={confirm?.type === 'delete'}
        title="Supprimer la sauvegarde"
        message={`Supprimer définitivement ${confirm?.filename ?? ''} ?`}
        confirmText="Supprimer"
        dangerous={false}
        onConfirm={() => {
          if (confirm?.filename) void deleteBackup(confirm.filename);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.type === 'restore-file'}
        title="Restaurer depuis un fichier ?"
        message="Cette opération remplacera les données actuelles par celles de la sauvegarde. Une sauvegarde de sécurité sera créée automatiquement avant la restauration. Cette action est irréversible."
        confirmText="Restaurer"
        confirmKeyword="RESTAURER"
        dangerous
        onConfirm={() => {
          const file = restoreRef.current?.files?.[0];
          if (file) void handleRestoreFile(file);
          setConfirm(null);
        }}
        onCancel={() => {
          setConfirm(null);
          if (restoreRef.current) restoreRef.current.value = '';
        }}
      />
      <ConfirmDialog
        open={confirm?.type === 'restore-server'}
        title="Restaurer cette sauvegarde ?"
        message={`Cette opération remplacera les données actuelles par celles de ${confirm?.filename ?? 'la sauvegarde'}. Une sauvegarde de sécurité sera créée automatiquement avant la restauration. Cette action est irréversible.`}
        confirmText="Restaurer"
        confirmKeyword="RESTAURER"
        dangerous
        onConfirm={() => {
          if (confirm?.filename) void restoreByFilename(confirm.filename);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: EXPORTS
// ═══════════════════════════════════════════════════════════

const EXPORT_ENTITIES = [
  { key: 'products', label: 'Produits', icon: FileText, description: 'Catalogue produits complet' },
  { key: 'stock', label: 'Stock', icon: HardDrive, description: 'État du stock avec alertes' },
  { key: 'customers', label: 'Clients', icon: FileText, description: 'Liste des clients' },
  { key: 'suppliers', label: 'Fournisseurs', icon: FileText, description: 'Liste des fournisseurs' },
  { key: 'sales', label: 'Ventes', icon: FileSpreadsheet, description: 'Toutes les ventes' },
  { key: 'purchases', label: 'Achats', icon: FileSpreadsheet, description: 'Tous les achats' },
  { key: 'payments', label: 'Paiements', icon: FileSpreadsheet, description: 'Paiements clients' },
  { key: 'audit_logs', label: 'Audit Logs', icon: Shield, description: 'Journal des actions' },
];

function ExportsTab() {
  const [exporting, setExporting] = useState<string | null>(null);

  const doExport = async (entity: string, format: 'xlsx' | 'csv') => {
    const key = `${entity}-${format}`;
    setExporting(key);
    try {
      const token = localStorage.getItem('access_token');
      const url = `/api/admin/database/export/${entity}?format=${format}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      if (!res.ok) {
        let msg = `Erreur HTTP ${res.status}`;
        try { const json = await res.json() as { message?: string }; msg = json.message ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('Fichier export vide');
      const burl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = burl;
      a.download = `${entity}-export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(burl);
      toast.success(`Export ${format.toUpperCase()} téléchargé`);
    } catch (err) {
      console.error('[EXPORT] Error:', err);
      toast.error(`Erreur export : ${(err as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Exports de données</h2>
        <p className="text-xs text-text-secondary">Exportez vos données métier en Excel ou CSV</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {EXPORT_ENTITIES.map(({ key, label, icon: Icon, description }) => (
          <Card key={key} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-app-primary/10">
                  <Icon size={16} className="text-app-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm">{label}</CardTitle>
                  <p className="text-[11px] text-text-muted">{description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  disabled={exporting === `${key}-xlsx`}
                  onClick={() => void doExport(key, 'xlsx')}
                >
                  {exporting === `${key}-xlsx`
                    ? <RefreshCw size={11} className="mr-1 animate-spin" />
                    : <FileSpreadsheet size={11} className="mr-1" />}
                  Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  disabled={exporting === `${key}-csv`}
                  onClick={() => void doExport(key, 'csv')}
                >
                  {exporting === `${key}-csv`
                    ? <RefreshCw size={11} className="mr-1 animate-spin" />
                    : <FileText size={11} className="mr-1" />}
                  CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: IMPORTS
// ═══════════════════════════════════════════════════════════

const IMPORT_ENTITIES = [
  { key: 'products', label: 'Produits', description: 'Colonnes: nom, reference, prix_achat, prix_vente, quantite' },
  { key: 'customers', label: 'Clients', description: 'Colonnes: nom, email, telephone, adresse' },
  { key: 'suppliers', label: 'Fournisseurs', description: 'Colonnes: nom, email, telephone, adresse' },
];

function ImportsTab() {
  const [selected, setSelected] = useState<string>('products');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: string[]; duplicates: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = async (f: File) => {
    setFile(f);
    setPreview(null);
    setResult(null);
    setPreviewing(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const { data } = await api.post<ImportPreview>(
        `/admin/database/import/${selected}/preview`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setPreview(data);
    } catch {
      toast.error('Erreur lors de la prévisualisation');
    } finally {
      setPreviewing(false);
    }
  };

  const doImport = async () => {
    if (!file) return;
    setImporting(true);
    setConfirm(false);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<{ inserted: number; errors: string[]; duplicates: number }>(
        `/admin/database/import/${selected}`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setResult(data);
      toast.success(`Import terminé : ${data.inserted} ligne(s) insérée(s)`);
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      toast.error('Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Import de données</h2>
        <p className="text-xs text-text-secondary">Importez vos données depuis Excel (.xlsx) ou CSV (.csv)</p>
      </div>

      {/* Entity selector */}
      <div className="flex flex-wrap gap-2">
        {IMPORT_ENTITIES.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => { setSelected(e.key); setPreview(null); setResult(null); setFile(null); }}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              selected === e.key
                ? 'border-app-primary bg-app-primary text-white'
                : 'border-border bg-card text-text-secondary hover:border-app-primary hover:text-app-primary',
            )}
          >
            {e.label}
          </button>
        ))}
      </div>

      {/* Upload zone */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-xs text-text-muted">
            {IMPORT_ENTITIES.find((e) => e.key === selected)?.description}
          </p>
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-8 transition-colors hover:border-app-primary hover:bg-app-primary/5"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={24} className="mb-2 text-text-muted" />
            <p className="text-sm font-medium text-text-secondary">
              {file ? file.name : 'Glissez un fichier ou cliquez pour choisir'}
            </p>
            <p className="mt-1 text-xs text-text-muted">Excel (.xlsx) ou CSV (.csv)</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileChange(f); }}
          />
        </CardContent>
      </Card>

      {/* Preview */}
      {previewing && (
        <div className="flex items-center gap-2 py-4 text-sm text-text-muted">
          <RefreshCw size={14} className="animate-spin" />
          Analyse du fichier...
        </div>
      )}
      {preview && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Aperçu des données</CardTitle>
              <div className="flex gap-2">
                {preview.errors.length > 0 && (
                  <Badge variant="danger">{preview.errors.length} erreur(s)</Badge>
                )}
                {preview.rows.length > 0 && (
                  <Badge variant="success">{preview.rows.length} ligne(s) valide(s)</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {preview.errors.length > 0 && (
              <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 p-3">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Erreurs détectées :</p>
                {preview.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>
                ))}
                {preview.errors.length > 5 && (
                  <p className="text-xs text-red-500">... et {preview.errors.length - 5} autre(s)</p>
                )}
              </div>
            )}
            {preview.rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr>
                      {Object.keys(preview.rows[0]).map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-t border-border/50">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 text-text-secondary">{String(v ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.rows.length > 0 && (
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => setConfirm(true)}
                  disabled={importing}
                >
                  <Upload size={13} className="mr-1.5" />
                  Importer {preview.rows.length} ligne(s)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-green-600" />
              <div>
                <p className="text-sm font-medium text-text-primary">Import terminé</p>
                <p className="text-xs text-text-secondary">
                  {result.inserted} insérée(s) · {result.duplicates} doublon(s) · {result.errors.length} erreur(s)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirm}
        title="Confirmer l'import"
        message={`Importer ${preview?.rows.length ?? 0} ligne(s) dans ${IMPORT_ENTITIES.find((e) => e.key === selected)?.label} ? Les doublons seront ignorés.`}
        confirmText="Importer"
        onConfirm={() => void doImport()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function usageColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 75) return 'bg-orange-400';
  return 'bg-green-500';
}

function globalStatus(stats: InfrastructureStats): 'nominal' | 'attention' | 'critique' {
  if (stats.ram.usagePercent > 90 || stats.disk.usagePercent > 90) return 'critique';
  if (stats.cpu.usage > 85 || stats.ram.usagePercent > 75 || stats.disk.usagePercent > 75) return 'attention';
  return 'nominal';
}

// ─── Infrastructure VPS Section ───────────────────────────────────────────────

function InfrastructureSection() {
  const [stats, setStats] = useState<InfrastructureStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<InfrastructureStats>('/admin/system/infrastructure');
      setStats(data);
      setLastUpdated(new Date());
    } catch {
      // Silent fail — each widget shows "--" on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
    const id = setInterval(() => { void loadStats(); }, 10000);
    return () => clearInterval(id);
  }, [loadStats]);

  const status = stats ? globalStatus(stats) : null;
  const isSystemd = stats?.deployment?.mode === 'systemd';

  const activeServices = stats?.services?.filter((s) => s.healthy).length ?? 0;
  const failedServices = stats?.services?.filter(
    (s) => s.status === 'inactive' || s.status === 'failed',
  ).length ?? 0;
  const notFoundServices = stats?.services?.filter((s) => s.status === 'not_found').length ?? 0;
  const allServicesOk = stats?.services
    ? activeServices === stats.services.length
    : true;

  const servicesCardColor = allServicesOk
    ? 'border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-card'
    : failedServices > 0
    ? 'border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-card'
    : 'border-orange-200 bg-orange-50/30 dark:border-orange-800 dark:bg-card';

  const servicesIconColor = allServicesOk
    ? 'bg-green-50 dark:bg-green-900/20'
    : failedServices > 0
    ? 'bg-red-50 dark:bg-red-900/20'
    : 'bg-orange-50 dark:bg-orange-900/20';

  const servicesActivityColor = allServicesOk
    ? 'text-green-600 dark:text-green-400'
    : failedServices > 0
    ? 'text-red-600 dark:text-red-400'
    : 'text-orange-600 dark:text-orange-400';

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={15} className="text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">
            {stats?.deployment?.mode === 'docker' ? 'Infrastructure Docker' : 'Infrastructure VPS'}
          </h3>
          {stats?.deployment && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {stats.deployment.mode === 'docker' ? 'Docker Compose' : 'Services systemd'}
            </span>
          )}
          {status === 'nominal' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 size={9} /> Nominal
            </span>
          )}
          {status === 'attention' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              <AlertTriangle size={9} /> Attention
            </span>
          )}
          {status === 'critique' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <XCircle size={9} /> Critique
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-text-muted">
              Mis à jour {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadStats()}
            disabled={loading}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-text-secondary hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={11} className={cn(loading && 'animate-spin')} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Skeleton loading */}
      {loading && !stats && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {/* Cards grid */}
      {stats && (
        <>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* CPU */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 dark:border-gray-700 dark:bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <Cpu size={13} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">CPU</span>
                </div>
                <span className={cn(
                  'text-xs font-bold',
                  stats.cpu.usage >= 85 ? 'text-red-600' : stats.cpu.usage >= 70 ? 'text-orange-500' : 'text-text-primary',
                )}>
                  {stats.cpu.usage}%
                </span>
              </div>
              <ProgressBar value={stats.cpu.usage} color={usageColor(stats.cpu.usage)} />
              <div className="mt-2 space-y-0.5">
                <p className="text-[10px] text-text-muted truncate" title={stats.cpu.model}>{stats.cpu.model}</p>
                <p className="text-[10px] text-text-muted">{stats.cpu.cores} cœurs
                  {stats.cpu.temperature != null && ` · ${stats.cpu.temperature}°C`}
                </p>
              </div>
            </div>

            {/* RAM */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 dark:border-gray-700 dark:bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20">
                    <MemoryStick size={13} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">RAM</span>
                </div>
                <span className={cn(
                  'text-xs font-bold',
                  stats.ram.usagePercent >= 90 ? 'text-red-600' : stats.ram.usagePercent >= 75 ? 'text-orange-500' : 'text-text-primary',
                )}>
                  {stats.ram.usagePercent}%
                </span>
              </div>
              <ProgressBar value={stats.ram.usagePercent} color={usageColor(stats.ram.usagePercent)} />
              <div className="mt-2 space-y-0.5">
                <p className="text-[10px] text-text-muted">
                  {(stats.ram.used / 1024).toFixed(1)} / {(stats.ram.total / 1024).toFixed(1)} GB
                </p>
                <p className="text-[10px] text-text-muted">{(stats.ram.free / 1024).toFixed(1)} GB libre</p>
              </div>
            </div>

            {/* Disk */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 dark:border-gray-700 dark:bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
                    <HardDrive size={13} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">Disque</span>
                </div>
                <span className={cn(
                  'text-xs font-bold',
                  stats.disk.usagePercent >= 90 ? 'text-red-600' : stats.disk.usagePercent >= 75 ? 'text-orange-500' : 'text-text-primary',
                )}>
                  {stats.disk.usagePercent}%
                </span>
              </div>
              <ProgressBar value={stats.disk.usagePercent} color={usageColor(stats.disk.usagePercent)} />
              <div className="mt-2 space-y-0.5">
                <p className="text-[10px] text-text-muted">{stats.disk.used} / {stats.disk.total} GB</p>
                <p className="text-[10px] text-text-muted">{stats.disk.free} GB libre</p>
              </div>
            </div>

            {/* Uptime / System */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 dark:border-gray-700 dark:bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/20">
                  <Clock size={13} className="text-green-600 dark:text-green-400" />
                </div>
                <span className="text-xs font-medium text-text-secondary">Uptime</span>
              </div>
              <p className="text-base font-bold text-text-primary leading-tight">{stats.system.uptime}</p>
              <div className="mt-1.5 space-y-0.5">
                <p className="text-[10px] text-text-muted truncate" title={stats.system.hostname}>{stats.system.hostname}</p>
                <p className="text-[10px] text-text-muted capitalize">{stats.system.platform}</p>
              </div>
            </div>

            {/* Docker (dev) or Services VPS (prod/systemd) */}
            {isSystemd ? (
              <div className={cn(
                'rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow',
                servicesCardColor,
              )}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', servicesIconColor)}>
                    <Activity size={13} className={servicesActivityColor} />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">Services VPS</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-lg font-bold text-green-600">{activeServices}</span>
                  <span className="text-xs text-text-muted mb-0.5">actifs</span>
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {failedServices > 0 && (
                    <p className="text-[10px] font-medium text-red-500">{failedServices} KO</p>
                  )}
                  {notFoundServices > 0 && (
                    <p className="text-[10px] font-medium text-orange-500">{notFoundServices} introuvable(s)</p>
                  )}
                  {allServicesOk && (
                    <p className="text-[10px] font-medium text-green-600">Tout nominal</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 dark:border-gray-700 dark:bg-card hover:shadow-md transition-shadow">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/20">
                    <Box size={13} className="text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">Docker</span>
                  {stats.docker?.unavailable && (
                    <span className="text-[9px] text-text-muted">(indisponible)</span>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-lg font-bold text-green-600">{stats.docker?.containersRunning ?? 0}</span>
                  <span className="text-xs text-text-muted mb-0.5">actifs</span>
                </div>
                <p className="text-[10px] text-text-muted mt-0.5">{stats.docker?.containersStopped ?? 0} stoppé(s)</p>
              </div>
            )}

            {/* Load Average */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 dark:border-gray-700 dark:bg-card hover:shadow-md transition-shadow">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-900/20">
                  <Activity size={13} className="text-rose-600 dark:text-rose-400" />
                </div>
                <span className="text-xs font-medium text-text-secondary">Load Avg</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(['1m', '5m', '15m'] as const).map((label, i) => (
                  <div key={label} className="text-center">
                    <p className="text-xs font-semibold text-text-primary">
                      {stats.system.loadAverage[i] ?? '--'}
                    </p>
                    <p className="text-[9px] text-text-muted">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Services mini list — systemd mode only */}
          {isSystemd && stats.services && stats.services.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3 dark:border-gray-700 dark:bg-card">
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {stats.services.map((s) => (
                  <div key={s.serviceName} className="flex items-center gap-1.5">
                    {s.healthy ? (
                      <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" />
                    ) : s.status === 'not_found' ? (
                      <AlertTriangle size={11} className="text-orange-500 flex-shrink-0" />
                    ) : (
                      <XCircle size={11} className="text-red-500 flex-shrink-0" />
                    )}
                    <span className={cn(
                      'text-[11px] font-medium',
                      s.healthy
                        ? 'text-text-secondary'
                        : s.status === 'not_found'
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-red-600 dark:text-red-400',
                    )}>
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: SANTÉ SYSTÈME
// ═══════════════════════════════════════════════════════════

function HealthTab() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<SystemHealth>('/admin/database/health');
      setHealth(data);
    } catch {
      toast.error('Erreur lors du chargement de la santé système');
    } finally {
      setLoading(false);
    }
  }, []);

  useState(() => { void loadHealth(); });

  const StatCard = ({ label, value, icon: Icon, color = 'text-app-primary' }: {
    label: string; value: string | number; icon: React.ElementType; color?: string;
  }) => (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-muted', color)}>
        <Icon size={15} />
      </div>
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Santé système</h2>
          <p className="text-xs text-text-secondary">État des services et statistiques ERP</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadHealth} disabled={loading}>
          <RefreshCw size={13} className={cn('mr-1.5', loading && 'animate-spin')} />
          Actualiser
        </Button>
      </div>

      {loading && !health && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {health && (
        <>
          {/* Services */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Services</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Database size={15} className="text-text-muted" />
                    <span className="text-sm font-medium text-text-primary">PostgreSQL</span>
                  </div>
                  <StatusBadge status={health.database.status} label={
                    health.database.status === 'ok' ? `${health.database.responseMs ?? 0}ms` : 'Erreur'
                  } />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <HardDrive size={15} className="text-text-muted" />
                    <span className="text-sm font-medium text-text-primary">MinIO</span>
                  </div>
                  <StatusBadge status={health.minio.status} label={
                    health.minio.status === 'ok' ? 'Connecté' : 'Erreur'
                  } />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    {health.smtp.status === 'ok'
                      ? <Wifi size={15} className="text-text-muted" />
                      : <WifiOff size={15} className="text-text-muted" />}
                    <span className="text-sm font-medium text-text-primary">SMTP</span>
                  </div>
                  <StatusBadge status={health.smtp.status} label={
                    health.smtp.status === 'ok' ? 'Configuré' : 'Non configuré'
                  } />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Infrastructure VPS */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Infrastructure VPS</CardTitle>
            </CardHeader>
            <CardContent>
              <InfrastructureSection />
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Statistiques ERP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Clients" value={health.stats.customers.toLocaleString()} icon={FileText} />
                <StatCard label="Produits" value={health.stats.products.toLocaleString()} icon={HardDrive} />
                <StatCard label="Ventes" value={health.stats.sales.toLocaleString()} icon={FileSpreadsheet} />
                <StatCard label="Documents" value={health.stats.documents.toLocaleString()} icon={FileText} />
                <StatCard label="Audit Logs" value={health.stats.auditLogs.toLocaleString()} icon={Shield} />
                <StatCard label="Taille DB" value={formatBytes(health.stats.dbSizeBytes)} icon={Database} color="text-blue-500" />
              </div>
            </CardContent>
          </Card>

          {/* Disk & System */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Sauvegardes" value={formatBytes(health.disk.backupsSize)} icon={Archive} />
            <StatCard label="Uptime" value={formatUptime(health.uptime)} icon={Clock} color="text-green-500" />
            <StatCard label="Dernière sauvegarde" value={health.lastBackup ? formatDate(health.lastBackup) : 'Jamais'} icon={Server} />
            <StatCard label="Statut global" value={
              health.database.status === 'ok' && health.minio.status === 'ok' ? 'Nominal' : 'Dégradé'
            } icon={CheckCircle2} color={
              health.database.status === 'ok' && health.minio.status === 'ok'
                ? 'text-green-500' : 'text-red-500'
            } />
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: MAINTENANCE
// ═══════════════════════════════════════════════════════════

const MAINTENANCE_ACTIONS = [
  {
    key: 'clean-logs',
    label: 'Nettoyer les logs anciens',
    description: 'Supprime les audit logs de plus de 90 jours',
    icon: Trash2,
    color: 'text-orange-600',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
  },
  {
    key: 'check-documents',
    label: 'Vérifier intégrité documents',
    description: 'Vérifie que tous les documents PDF existent dans MinIO',
    icon: FileText,
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    key: 'check-negative-stock',
    label: 'Vérifier stock négatif',
    description: 'Détecte les produits avec un stock négatif',
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  {
    key: 'clean-trash',
    label: 'Nettoyer la corbeille',
    description: 'Supprime définitivement les éléments en corbeille depuis plus de 30 jours',
    icon: Trash2,
    color: 'text-red-600',
    bg: 'bg-red-100 dark:bg-red-900/30',
  },
  {
    key: 'vacuum-db',
    label: 'Optimiser la base de données',
    description: 'Exécute VACUUM ANALYZE pour optimiser les performances PostgreSQL',
    icon: Database,
    color: 'text-purple-600',
    bg: 'bg-purple-100 dark:bg-purple-900/30',
  },
  {
    key: 'check-orphans',
    label: 'Vérifier enregistrements orphelins',
    description: 'Détecte les lignes de vente sans vente parente',
    icon: Wrench,
    color: 'text-gray-600',
    bg: 'bg-gray-100 dark:bg-gray-800',
  },
];

function MaintenanceTab() {
  const [running, setRunning] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { message: string; details?: unknown }>>({});

  const runAction = async (action: string) => {
    setRunning(action);
    setConfirm(null);
    try {
      const { data } = await api.post<{ message: string; details?: unknown }>(
        `/admin/database/maintenance/${action}`,
      );
      setResults((prev) => ({ ...prev, [action]: data }));
      toast.success(data.message);
    } catch {
      toast.error(`Erreur lors de l'action : ${action}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Outils de maintenance</h2>
        <p className="text-xs text-text-secondary">Optimisez et maintenez votre ERP en bonne santé</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MAINTENANCE_ACTIONS.map(({ key, label, description, icon: Icon, color, bg }) => (
          <Card key={key} className="transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="mb-3 flex items-start gap-3">
                <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', bg)}>
                  <Icon size={16} className={color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{label}</p>
                  <p className="text-xs text-text-muted">{description}</p>
                </div>
              </div>

              {results[key] && (
                <div className="mb-2 rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-xs text-text-secondary">{results[key].message}</p>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={running === key}
                onClick={() => setConfirm(key)}
              >
                {running === key
                  ? <RefreshCw size={12} className="mr-1.5 animate-spin" />
                  : <Wrench size={12} className="mr-1.5" />}
                {running === key ? 'En cours...' : 'Exécuter'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={MAINTENANCE_ACTIONS.find((a) => a.key === confirm)?.label ?? ''}
        message={`Confirmer l'exécution de "${MAINTENANCE_ACTIONS.find((a) => a.key === confirm)?.label}" ?`}
        confirmText="Exécuter"
        onConfirm={() => { if (confirm) void runAction(confirm); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function DatabasePage() {
  return (
    <PermissionGuard permission="database.view">
      <div className="flex flex-col gap-4 p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-app-primary/10">
            <Database size={20} className="text-app-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Base de données</h1>
            <p className="text-xs text-text-secondary">Administration, sauvegardes, exports et maintenance système</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="sauvegardes" className="w-full">
          <TabsList className="mb-2 w-full justify-start gap-1 h-auto flex-wrap bg-muted/50 p-1">
            {[
              { value: 'sauvegardes', label: 'Sauvegardes', icon: Archive },
              { value: 'exports', label: 'Exports', icon: Download },
              { value: 'imports', label: 'Imports', icon: Upload },
              { value: 'sante', label: 'Santé système', icon: Server },
              { value: 'maintenance', label: 'Maintenance', icon: Wrench },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-card"
              >
                <Icon size={13} />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="sauvegardes">
            <Can permission="database.backup" fallback={
              <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-text-muted">
                <Shield size={16} /> Accès refusé — permission database.backup requise
              </div>
            }>
              <BackupsTab />
            </Can>
          </TabsContent>

          <TabsContent value="exports">
            <Can permission="database.export" fallback={
              <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-text-muted">
                <Shield size={16} /> Accès refusé — permission database.export requise
              </div>
            }>
              <ExportsTab />
            </Can>
          </TabsContent>

          <TabsContent value="imports">
            <Can permission="database.import" fallback={
              <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-text-muted">
                <Shield size={16} /> Accès refusé — permission database.import requise
              </div>
            }>
              <ImportsTab />
            </Can>
          </TabsContent>

          <TabsContent value="sante">
            <HealthTab />
          </TabsContent>

          <TabsContent value="maintenance">
            <Can permission="database.maintenance" fallback={
              <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-text-muted">
                <Shield size={16} /> Accès refusé — permission database.maintenance requise
              </div>
            }>
              <MaintenanceTab />
            </Can>
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGuard>
  );
}
