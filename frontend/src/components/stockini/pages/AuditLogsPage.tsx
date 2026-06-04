'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime } from '@/lib/stockini/format';
import type { AuditLog, AuditLogQuery } from '@/lib/stockini/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ─── Action → badge variant ──────────────────────────────────────────────────

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'muted' | 'outline' | 'active' | 'inactive' | 'admin' | 'stock' | 'seller' | 'purchase';

function actionVariant(action: string): BadgeVariant {
  if (action.includes('created')) return 'success';
  if (action.includes('validated')) return 'active';
  if (action.includes('deleted') || action.includes('cancelled') || action.includes('annulation')) return 'danger';
  if (action.includes('reset') || action.includes('cleared')) return 'warning';
  if (action.startsWith('caisse.')) return 'purchase';
  if (action.startsWith('stock.')) return 'stock';
  if (action.startsWith('payment.')) return 'seller';
  if (action.startsWith('sale.') || action.startsWith('purchase.')) return 'default';
  return 'secondary';
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    'sale.created': 'Vente créée',
    'sale.validated': 'Vente validée',
    'sale.cancelled': 'Vente annulée',
    'sale.deleted': 'Vente supprimée',
    'sale.transformed': 'Transformation',
    'purchase.created': 'Achat créé',
    'purchase.received': 'Réception',
    'purchase.cancelled': 'Achat annulé',
    'purchase.deleted': 'Achat supprimé',
    'payment.sale_payment': 'Paiement client',
    'payment.purchase_payment': 'Paiement fournisseur',
    'payment.deleted': 'Paiement supprimé',
    'caisse.encaissement_vente': 'Encaissement',
    'caisse.decaissement_achat': 'Décaissement',
    'caisse.depot': 'Dépôt manuel',
    'caisse.retrait': 'Retrait manuel',
    'caisse.annulation_vente': 'Annulation encaissement',
    'caisse.annulation_achat': 'Annulation décaissement',
    'caisse.reset': 'Remise à zéro',
    'caisse.history_cleared': 'Historique effacé',
    'stock.entry': 'Entrée stock',
    'stock.exit': 'Sortie stock',
    'stock.adjustment': 'Ajustement stock',
    'stock.inventory_reset': 'Remise à zéro inventaire',
    'USER_CREATED': 'Utilisateur créé',
    'USER_UPDATED': 'Utilisateur modifié',
    'USER_DELETED': 'Utilisateur supprimé',
    'USER_STATUS_CHANGED': 'Statut utilisateur',
    'USER_PASSWORD_RESET': 'Mot de passe réinitialisé',
    'audit.archive.completed': 'Archivage réussi',
    'audit.archive.failed': 'Archivage échoué',
  };
  return labels[action] ?? action;
}

// ─── Diff viewer ──────────────────────────────────────────────────────────────

function DiffValue({ label, value }: { label: string; value: Record<string, unknown> | null | undefined }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{label}</p>
      <pre className="rounded bg-muted px-3 py-2 text-xs font-mono text-text-primary overflow-auto max-h-40">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function MetaValue({ value }: { value: Record<string, unknown> | null | undefined }) {
  if (!value || Object.keys(value).length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Métadonnées</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(value).map(([k, v]) =>
          v == null ? null : (
            <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs text-text-secondary">
              <span className="font-medium text-text-primary">{k}:</span>{' '}
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

// ─── Detail slide-over ────────────────────────────────────────────────────────

function AuditDetailPanel({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-surface border-l border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Badge variant={actionVariant(log.action)}>{actionLabel(log.action)}</Badge>
            <span className="text-sm text-text-secondary">{log.entity}</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wide mb-1">Date</p>
              <p className="font-medium">{dateTime(log.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wide mb-1">Utilisateur</p>
              <p className="font-medium">{log.user?.fullName ?? log.user?.email ?? log.userName ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wide mb-1">Entité</p>
              <p className="font-medium">{log.entity}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary uppercase tracking-wide mb-1">Référence</p>
              <p className="font-mono text-xs text-text-secondary break-all">{log.entityId ?? '-'}</p>
            </div>
          </div>

          {(log.oldValue || log.newValue) && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold">Changements</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DiffValue label="Avant" value={log.oldValue} />
                <DiffValue label="Après" value={log.newValue} />
              </div>
            </div>
          )}

          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="border-t border-border pt-4">
              <MetaValue value={log.metadata} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

const ENTITY_OPTIONS = ['', 'Sale', 'Purchase', 'Payment', 'CaisseMovement', 'StockMovement', 'User', 'Product'];
const ACTION_PREFIXES = ['', 'sale.', 'purchase.', 'payment.', 'caisse.', 'stock.', 'USER_', 'audit.'];

function FilterBar({
  query,
  onChange,
  onReset,
}: {
  query: AuditLogQuery;
  onChange: (q: Partial<AuditLogQuery>) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
      {/* Source toggle */}
      <div className="flex shrink-0 rounded-md border border-border overflow-hidden text-sm">
        {(['active', 'archive'] as const).map((src) => (
          <button
            key={src}
            type="button"
            onClick={() => onChange({ source: src, page: 1 })}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              (query.source ?? 'active') === src
                ? 'bg-app-primary text-white'
                : 'bg-surface text-text-secondary hover:bg-muted',
            )}
          >
            {src === 'active' ? 'Logs actifs' : 'Archives'}
          </button>
        ))}
      </div>

      <div className="min-w-[220px] flex-[1_1_260px]">
        <Input
          placeholder="Recherche (réf, utilisateur…)"
          value={query.search ?? ''}
          onChange={(e) => onChange({ search: e.target.value || undefined, page: 1 })}
          className="h-8 text-sm"
        />
      </div>
      <div className="shrink-0">
        <select
          value={query.entity ?? ''}
          onChange={(e) => onChange({ entity: e.target.value || undefined, page: 1 })}
          className="h-8 w-40 rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-app-ring"
        >
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>{e || 'Toutes entités'}</option>
          ))}
        </select>
      </div>
      <div className="shrink-0">
        <select
          value={query.action ?? ''}
          onChange={(e) => onChange({ action: e.target.value || undefined, page: 1 })}
          className="h-8 w-36 rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-app-ring"
        >
          {ACTION_PREFIXES.map((a) => (
            <option key={a} value={a}>{a || 'Toutes actions'}</option>
          ))}
        </select>
      </div>
      <div className="shrink-0">
        <Input
          type="date"
          value={query.dateFrom ?? ''}
          onChange={(e) => onChange({ dateFrom: e.target.value || undefined, page: 1 })}
          className="h-8 text-sm w-36"
        />
      </div>
      <div className="shrink-0">
        <Input
          type="date"
          value={query.dateTo ?? ''}
          onChange={(e) => onChange({ dateTo: e.target.value || undefined, page: 1 })}
          className="h-8 text-sm w-36"
        />
      </div>
      <Button variant="ghost" size="sm" onClick={onReset} className="h-8 shrink-0 text-xs">
        <RotateCcw size={13} />
        Réinitialiser les filtres
      </Button>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  total,
  limit,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-text-secondary pt-2">
      <span>{total} résultat{total !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="h-7 px-2"
        >
          ‹ Précédent
        </Button>
        <span className="text-xs">Page {page} / {totalPages}</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="h-7 px-2"
        >
          Suivant ›
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DEFAULT_QUERY: AuditLogQuery = { page: 1, limit: 50 };

export function AuditLogsPage() {
  const [query, setQuery] = useState<AuditLogQuery>(DEFAULT_QUERY);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['stockini-audit-logs', query],
    queryFn: () => stockiniApi.auditLogs(query),
    staleTime: 30_000,
  });

  const logs = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  const updateQuery = (patch: Partial<AuditLogQuery>) =>
    setQuery((q) => ({ ...q, ...patch }));

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Journal d'audit</h1>
        <p className="text-sm text-text-secondary">
          {(query.source ?? 'active') === 'archive'
            ? 'Logs archivés (historique long terme exporté vers MinIO) — lecture seule.'
            : 'Logs actifs — toutes les actions critiques métier, non modifiables.'}
        </p>
      </div>

      {/* Filters */}
      <FilterBar
        query={query}
        onChange={updateQuery}
        onReset={() => setQuery(DEFAULT_QUERY)}
      />

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-text-secondary text-sm">Chargement…</div>
      ) : error ? (
        <div className="flex items-center justify-center h-40 text-app-danger text-sm">Erreur de chargement</div>
      ) : logs.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-text-secondary text-sm">Aucun résultat</div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-3 py-2.5 text-left font-medium text-text-secondary">Date</th>
                {(query.source ?? 'active') === 'archive' && (
                  <th className="px-3 py-2.5 text-left font-medium text-text-secondary">Archivé le</th>
                )}
                <th className="px-3 py-2.5 text-left font-medium text-text-secondary">Action</th>
                <th className="px-3 py-2.5 text-left font-medium text-text-secondary">Entité</th>
                <th className="px-3 py-2.5 text-left font-medium text-text-secondary">Référence</th>
                <th className="px-3 py-2.5 text-left font-medium text-text-secondary">Utilisateur</th>
                <th className="px-3 py-2.5 text-left font-medium text-text-secondary"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className={cn(
                    'border-b border-border/50 hover:bg-muted/50 transition-colors',
                    selected?.id === log.id && 'bg-app-primary-soft',
                  )}
                >
                  <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap">{dateTime(log.createdAt)}</td>
                  {(query.source ?? 'active') === 'archive' && (
                    <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap text-xs">
                      {log.archivedAt ? dateTime(log.archivedAt) : '—'}
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <Badge variant={actionVariant(log.action)} className="whitespace-nowrap">
                      {actionLabel(log.action)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-text-primary">{log.entity}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-text-secondary max-w-[140px] truncate">
                    {(log.metadata as Record<string, unknown> | null)?.invoiceNumber as string
                      ?? (log.metadata as Record<string, unknown> | null)?.orderNumber as string
                      ?? (log.metadata as Record<string, unknown> | null)?.reference as string
                      ?? log.entityId
                      ?? '-'}
                  </td>
                  <td className="px-3 py-2.5 text-text-secondary">
                    {log.user?.fullName ?? log.user?.email ?? log.userName ?? '-'}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => setSelected(log)}
                      className="text-xs text-app-primary hover:underline"
                    >
                      Détails
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={query.page ?? 1}
        totalPages={totalPages}
        total={total}
        limit={query.limit ?? 50}
        onChange={(p) => updateQuery({ page: p })}
      />

      {/* Detail panel */}
      {selected && (
        <AuditDetailPanel log={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
