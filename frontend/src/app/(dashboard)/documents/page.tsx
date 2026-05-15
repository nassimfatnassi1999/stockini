'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Eye,
  FileText,
  Loader2,
  Mail,
  Pencil,
  Search,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  DocumentEmailLog,
  DocumentStatus,
  GeneratedDocument,
  SalesDocumentType,
} from '@/lib/stockini/types';
import { money } from '@/lib/stockini/format';

// ─── Constants ───────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<SalesDocumentType, string> = {
  DEVIS: 'Devis',
  BON_COMMANDE: 'Bon de commande',
  BON_LIVRAISON: 'Bon de livraison',
  FACTURE: 'Facture',
  AVOIR: 'Avoir',
};

const DOC_TYPE_COLORS: Record<SalesDocumentType, string> = {
  DEVIS: 'border-blue-200 bg-blue-50 text-blue-700',
  BON_COMMANDE: 'border-purple-200 bg-purple-50 text-purple-700',
  BON_LIVRAISON: 'border-teal-200 bg-teal-50 text-teal-700',
  FACTURE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  AVOIR: 'border-red-200 bg-red-50 text-red-700',
};

const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
  GENERATED: 'Généré',
  SENT: 'Envoyé',
  DELETED: 'Supprimé',
};

const DOC_STATUS_COLORS: Record<DocumentStatus, string> = {
  GENERATED: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  SENT: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DELETED: 'border-red-200 bg-red-50 text-red-700',
};

const EMAIL_STATUS_COLORS: Record<string, string> = {
  PENDING: 'text-yellow-600',
  SENT: 'text-emerald-600',
  FAILED: 'text-red-600',
};

function fmtSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

// ─── Modals ──────────────────────────────────────────────────────────────────

interface EditModalProps {
  doc: GeneratedDocument;
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ doc, onClose, onSaved }: EditModalProps) {
  const [documentNumber, setDocumentNumber] = useState(doc.documentNumber);
  const [clientName, setClientName] = useState(doc.clientName ?? doc.sale?.customer?.name ?? '');
  const [status, setStatus] = useState<DocumentStatus>(doc.status);

  const updateMutation = useMutation({
    mutationFn: () =>
      stockiniApi.updateDocument(doc.id, { documentNumber, clientName, status }),
    onSuccess: () => {
      toast.success('Document mis à jour');
      onSaved();
      onClose();
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border/70 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">Modifier le document</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
            <X size={15} className="text-text-muted" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="edit-doc-number">Numéro document</Label>
            <Input
              id="edit-doc-number"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-client-name">Nom client</Label>
            <Input
              id="edit-client-name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-status">Statut</Label>
            <select
              id="edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as DocumentStatus)}
              className="app-select"
            >
              <option value="GENERATED">Généré</option>
              <option value="SENT">Envoyé</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button
            size="sm"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            {updateMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface EmailModalProps {
  doc: GeneratedDocument;
  onClose: () => void;
  onSent: () => void;
}

function EmailModal({ doc, onClose, onSent }: EmailModalProps) {
  const defaultEmail = doc.sale?.customer?.email ?? '';
  const defaultName = doc.clientName ?? doc.sale?.customer?.name ?? 'Client';

  const [to, setTo] = useState(defaultEmail);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(`${DOC_TYPE_LABELS[doc.documentType]} ${doc.documentNumber}`);
  const [message, setMessage] = useState(
    `Bonjour ${defaultName},\n\nVeuillez trouver en pièce jointe votre ${DOC_TYPE_LABELS[doc.documentType].toLowerCase()}.\n\nCordialement.`,
  );

  const sendMutation = useMutation({
    mutationFn: () =>
      stockiniApi.sendEmailForDocument(doc.id, { to, cc: cc || undefined, bcc: bcc || undefined, subject, message }),
    onSuccess: () => {
      toast.success('Email envoyé avec succès');
      onSent();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Échec de l'envoi email");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border/70 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Envoyer par email</h2>
            <p className="text-xs text-text-muted mt-0.5">{doc.documentNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
            <X size={15} className="text-text-muted" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">À *</Label>
            <Input
              id="email-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinataire@email.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email-cc">CC</Label>
              <Input
                id="email-cc"
                type="email"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="cc@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-bcc">BCC</Label>
              <Input
                id="email-bcc"
                type="email"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="bcc@email.com"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Sujet</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-message">Message</Label>
            <textarea
              id="email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div className="rounded-md border border-border/60 bg-surface px-3 py-2 text-xs text-text-muted">
            <span className="font-medium">Pièce jointe :</span> {doc.fileName}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button
            size="sm"
            disabled={sendMutation.isPending || !to}
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? (
              <><Loader2 size={13} className="animate-spin mr-1.5" />Envoi…</>
            ) : (
              'Envoyer'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DeleteConfirmProps {
  doc: GeneratedDocument;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

function DeleteConfirm({ doc, onClose, onConfirm, isPending }: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border/70 bg-white shadow-2xl">
        <div className="p-5">
          <h2 className="text-sm font-semibold text-text-primary">Supprimer le document</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Confirmer la suppression de <span className="font-mono font-semibold">{doc.documentNumber}</span> ?
            Le fichier PDF restera dans le stockage MinIO.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? 'Suppression…' : 'Supprimer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface EmailLogsModalProps {
  doc: GeneratedDocument;
  onClose: () => void;
}

function EmailLogsModal({ doc, onClose }: EmailLogsModalProps) {
  const logsQuery = useQuery<DocumentEmailLog[]>({
    queryKey: ['document-email-logs', doc.id],
    queryFn: () => stockiniApi.documentEmailLogs(doc.id),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border/70 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Historique des emails</h2>
            <p className="text-xs text-text-muted mt-0.5">{doc.documentNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
            <X size={15} className="text-text-muted" />
          </button>
        </div>
        <div className="overflow-auto max-h-[60vh]">
          {logsQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={20} className="animate-spin text-text-muted" />
            </div>
          ) : !logsQuery.data?.length ? (
            <p className="py-10 text-center text-sm text-text-muted">Aucun email envoyé pour ce document</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="border-b border-border/60">
                  {['Destinataire', 'Sujet', 'Date envoi', 'Statut', 'Erreur'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {logsQuery.data.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-text-secondary">{log.recipientEmail}</td>
                    <td className="px-4 py-3 text-text-secondary">{log.subject}</td>
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                      {new Date(log.sentAt).toLocaleString('fr-TN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${EMAIL_STATUS_COLORS[log.status] ?? 'text-text-muted'}`}>
                        {log.status === 'SENT' ? 'Envoyé' : log.status === 'FAILED' ? 'Échec' : log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-red-600 max-w-[200px] truncate">
                      {log.errorMessage ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end border-t border-border/60 px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  // Filters
  const [search, setSearch] = useState('');
  const [docType, setDocType] = useState<SalesDocumentType | ''>('');
  const [status, setStatus] = useState<DocumentStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minSize, setMinSize] = useState('');
  const [maxSize, setMaxSize] = useState('');
  const [page, setPage] = useState(1);

  // Per-document action loading
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Modals
  const [editDoc, setEditDoc] = useState<GeneratedDocument | null>(null);
  const [emailDoc, setEmailDoc] = useState<GeneratedDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<GeneratedDocument | null>(null);
  const [emailLogsDoc, setEmailLogsDoc] = useState<GeneratedDocument | null>(null);

  const queryKey = ['documents', { search, docType, status, dateFrom, dateTo, minSize, maxSize, page }];

  const docsQuery = useQuery({
    queryKey,
    queryFn: () =>
      stockiniApi.listDocuments({
        ...(search && { search }),
        ...(docType && { documentType: docType }),
        ...(status && { status }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
        ...(minSize && { minSize: Math.round(Number(minSize) * 1024) }),
        ...(maxSize && { maxSize: Math.round(Number(maxSize) * 1024) }),
        page,
        limit: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => stockiniApi.deleteGeneratedDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast.success('Document supprimé');
      setDeleteDoc(null);
    },
    onError: () => { toast.error('Erreur lors de la suppression'); setDeleteDoc(null); },
  });

  const handleView = useCallback(async (doc: GeneratedDocument) => {
    if (viewingId) return;
    setViewingId(doc.id);
    try {
      const blob = await stockiniApi.viewDocument(doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        toast.error('Accès refusé — permission ou session invalide');
      } else if (status === 404) {
        toast.error('Document introuvable dans le stockage');
      } else {
        toast.error('Impossible d\'ouvrir le document');
      }
    } finally {
      setViewingId(null);
    }
  }, [viewingId]);

  const handleDownload = useCallback(async (doc: GeneratedDocument) => {
    if (downloadingId) return;
    setDownloadingId(doc.id);
    try {
      const blob = await stockiniApi.downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success('Téléchargement terminé');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        toast.error('Accès refusé — permission ou session invalide');
      } else if (status === 404) {
        toast.error('Document introuvable dans le stockage');
      } else {
        toast.error('Échec du téléchargement');
      }
    } finally {
      setDownloadingId(null);
    }
  }, [downloadingId]);

  const resetFilters = () => {
    setSearch('');
    setDocType('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setMinSize('');
    setMaxSize('');
    setPage(1);
  };

  const data = docsQuery.data;
  const docs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const hasFilters = search || docType || status || dateFrom || dateTo || minSize || maxSize;

  return (
    <PermissionGuard permission="documents.view">
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="app-page-title">Documents générés</h1>
        <p className="app-page-subtitle">
          Devis, factures, bons de commande et de livraison
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border/70 bg-white p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px] max-w-sm space-y-1.5">
            <Label>Recherche</Label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Numéro, client…"
                className="pl-8"
              />
            </div>
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select
              value={docType}
              onChange={(e) => { setDocType(e.target.value as SalesDocumentType | ''); setPage(1); }}
              className="app-select min-w-[160px]"
            >
              <option value="">Tous les types</option>
              <option value="DEVIS">Devis</option>
              <option value="BON_COMMANDE">Bon de commande</option>
              <option value="BON_LIVRAISON">Bon de livraison</option>
              <option value="FACTURE">Facture</option>
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Statut</Label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as DocumentStatus | ''); setPage(1); }}
              className="app-select"
            >
              <option value="">Tous</option>
              <option value="GENERATED">Généré</option>
              <option value="SENT">Envoyé</option>
              <option value="DELETED">Supprimé</option>
            </select>
          </div>

          {/* Date range */}
          <div className="space-y-1.5">
            <Label>Date début</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-36"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Date fin</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-36"
            />
          </div>

          {/* Size range */}
          <div className="space-y-1.5">
            <Label>Taille min (Ko)</Label>
            <Input
              type="number"
              value={minSize}
              onChange={(e) => { setMinSize(e.target.value); setPage(1); }}
              placeholder="0"
              className="w-24"
              min={0}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Taille max (Ko)</Label>
            <Input
              type="number"
              value={maxSize}
              onChange={(e) => { setMaxSize(e.target.value); setPage(1); }}
              placeholder="∞"
              className="w-24"
              min={0}
            />
          </div>

          {hasFilters && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="self-end">
              <X size={13} className="mr-1" />
              Réinitialiser
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/70 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <p className="text-sm font-semibold text-text-primary">
            {docsQuery.isLoading ? 'Chargement…' : `${total} document${total !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="border-b border-border/60">
                {[
                  'Type',
                  'Numéro',
                  'Client',
                  'Source',
                  'Total TTC',
                  'Taille',
                  'Date',
                  'Statut',
                  'Actions',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {docsQuery.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center">
                    <Loader2 size={20} className="animate-spin text-text-muted mx-auto" />
                  </td>
                </tr>
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-text-muted">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    Aucun document trouvé
                  </td>
                </tr>
              ) : (
                docs.map((doc) => {
                  const clientDisplay = doc.clientName ?? doc.sale?.customer?.name ?? 'Comptoir';
                  const totalTtc = doc.totalTtc ?? doc.sale?.total;
                  return (
                    <tr key={doc.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`app-status-badge text-xs ${DOC_TYPE_COLORS[doc.documentType] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                          {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap">
                        {doc.documentNumber}
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-[140px] truncate">
                        {clientDisplay}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">
                        {doc.sale?.invoiceNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium whitespace-nowrap">
                        {totalTtc ? money(totalTtc) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                        {fmtSize(doc.fileSize)}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                        {new Date(doc.generatedAt).toLocaleDateString('fr-TN')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`app-status-badge text-xs ${DOC_STATUS_COLORS[doc.status] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                          {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="actionView"
                            size="action"
                            title="Voir le PDF"
                            disabled={viewingId === doc.id}
                            onClick={() => handleView(doc)}
                          >
                            {viewingId === doc.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Eye size={13} />}
                          </Button>
                          {can('documents.download') && (
                            <Button
                              variant="actionView"
                              size="action"
                              title="Télécharger"
                              disabled={downloadingId === doc.id}
                              onClick={() => handleDownload(doc)}
                            >
                              {downloadingId === doc.id
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Download size={13} />}
                            </Button>
                          )}
                          {can('documents.update') && (
                            <Button
                              variant="actionView"
                              size="action"
                              title="Modifier"
                              onClick={() => setEditDoc(doc)}
                            >
                              <Pencil size={13} />
                            </Button>
                          )}
                          {can('documents.email') && (
                            <Button
                              variant="actionView"
                              size="action"
                              title="Envoyer par email"
                              onClick={() => setEmailDoc(doc)}
                            >
                              <Mail size={13} />
                            </Button>
                          )}
                          {can('documents.view_history') && (
                            <Button
                              variant="actionView"
                              size="action"
                              title="Historique emails"
                              onClick={() => setEmailLogsDoc(doc)}
                            >
                              <FileText size={13} />
                            </Button>
                          )}
                          {can('documents.delete') && (
                            <Button
                              variant="actionDelete"
                              size="action"
                              title="Supprimer"
                              onClick={() => setDeleteDoc(doc)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <p className="text-xs text-text-muted">
              Page {page} sur {totalPages} — {total} résultat{total !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {editDoc && (
        <EditModal
          doc={editDoc}
          onClose={() => setEditDoc(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['documents'] })}
        />
      )}

      {emailDoc && (
        <EmailModal
          doc={emailDoc}
          onClose={() => setEmailDoc(null)}
          onSent={() => queryClient.invalidateQueries({ queryKey: ['documents'] })}
        />
      )}

      {deleteDoc && (
        <DeleteConfirm
          doc={deleteDoc}
          onClose={() => setDeleteDoc(null)}
          onConfirm={() => deleteMutation.mutate(deleteDoc.id)}
          isPending={deleteMutation.isPending}
        />
      )}

      {emailLogsDoc && (
        <EmailLogsModal
          doc={emailLogsDoc}
          onClose={() => setEmailLogsDoc(null)}
        />
      )}
    </div>
    </PermissionGuard>
  );
}
