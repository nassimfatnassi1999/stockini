'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  Link,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { stockiniApi } from '@/lib/stockini/api';
import { KebabMenu } from '@/components/stockini/shared/KebabMenu';
import type { GeneratedDocument, SalesDocumentType } from '@/lib/stockini/types';

const DOC_TYPE_LABELS: Record<SalesDocumentType, string> = {
  DEVIS: 'Devis',
  BON_COMMANDE: 'Bon de commande',
  BON_LIVRAISON: 'Bon de livraison',
  FACTURE: 'Facture',
  AVOIR: 'Avoir',
};

const EMAIL_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  SENT: 'Envoyé',
  FAILED: 'Échec',
};

const EMAIL_STATUS_COLORS: Record<string, string> = {
  PENDING: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  SENT: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  FAILED: 'border-red-200 bg-red-50 text-red-700',
};

interface Props {
  selectedDocumentIds: string[];
  onDocumentSelectionChange: (ids: string[]) => void;
  onEmailClick?: () => void;
  emailLoading?: boolean;
  noHeader?: boolean;
}

interface SendLinkModalProps {
  doc: GeneratedDocument;
  onClose: () => void;
  onSent: () => void;
}

function SendLinkModal({ doc, onClose, onSent }: SendLinkModalProps) {
  const defaultEmail = doc.sale?.customer?.email ?? '';
  const defaultName = doc.sale?.customer?.name ?? 'Client';

  const [to, setTo] = useState(defaultEmail);
  const [subject, setSubject] = useState(
    `${DOC_TYPE_LABELS[doc.documentType]} ${doc.documentNumber} — lien de consultation`,
  );
  const [message, setMessage] = useState(
    `Bonjour ${defaultName},\n\nVeuillez trouver ci-dessous le lien pour consulter et télécharger votre ${DOC_TYPE_LABELS[doc.documentType].toLowerCase()}.\n\nCordialement.`,
  );
  const [expiresInDays, setExpiresInDays] = useState<1 | 7 | 30>(7);

  const sendMutation = useMutation({
    mutationFn: () =>
      stockiniApi.sendEmailLink(doc.id, { to, subject, message, expiresInDays }),
    onSuccess: () => {
      toast.success('Lien PDF envoyé avec succès');
      onSent();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Échec de l'envoi du lien");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border/70 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Envoyer lien PDF</h2>
            <p className="text-xs text-text-muted mt-0.5">{doc.documentNumber} — sans pièce jointe</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
            <X size={15} className="text-text-muted" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="hist-link-to">Destinataire *</Label>
            <Input
              id="hist-link-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinataire@email.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hist-link-subject">Sujet</Label>
            <Input
              id="hist-link-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hist-link-message">Message (optionnel)</Label>
            <textarea
              id="hist-link-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hist-link-expiry">Durée de validité du lien</Label>
            <select
              id="hist-link-expiry"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value) as 1 | 7 | 30)}
              className="app-select w-full"
            >
              <option value={1}>1 jour</option>
              <option value={7}>7 jours (recommandé)</option>
              <option value={30}>30 jours</option>
            </select>
          </div>
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-start gap-2">
            <Link size={13} className="mt-0.5 shrink-0" />
            <span>
              Un lien sécurisé et temporaire sera généré vers le PDF stocké dans MinIO.
              Aucune pièce jointe ne sera envoyée.
            </span>
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
              <><Link size={13} className="mr-1.5" />Envoyer le lien</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function GeneratedDocumentsHistory({ selectedDocumentIds, onDocumentSelectionChange, onEmailClick, emailLoading, noHeader }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [sendLinkDoc, setSendLinkDoc] = useState<GeneratedDocument | null>(null);

  const docsQuery = useQuery<GeneratedDocument[]>({
    queryKey: ['generated-documents'],
    queryFn: () => stockiniApi.generatedDocuments(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => stockiniApi.deleteGeneratedDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast.success('Document supprimé');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: string) => stockiniApi.regenerateDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-documents'] });
      toast.success('Document régénéré');
    },
    onError: () => toast.error('Erreur lors de la régénération'),
  });

  const handleDownload = async (id: string, fileName: string) => {
    try {
      const blob = await stockiniApi.downloadDocument(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error('Échec du téléchargement');
    }
  };

  const handleView = async (id: string) => {
    try {
      const { url } = await stockiniApi.documentPresignedUrl(id);
      window.open(url, '_blank');
    } catch {
      toast.error('Impossible d\'ouvrir le document');
    }
  };

  const handleCopyLink = useCallback(async (id: string) => {
    if (copyingId) return;
    setCopyingId(id);
    try {
      const { url } = await stockiniApi.documentPresignedUrl(id);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      toast.success('Lien copié dans le presse-papiers');
    } catch {
      toast.error('Impossible de récupérer le lien PDF');
    } finally {
      setCopyingId(null);
    }
  }, [copyingId]);

  const toggleDocSelection = (id: string) => {
    if (selectedDocumentIds.includes(id)) {
      onDocumentSelectionChange(selectedDocumentIds.filter((d) => d !== id));
    } else {
      onDocumentSelectionChange([...selectedDocumentIds, id]);
    }
  };

  const docs = docsQuery.data ?? [];

  const tableContent = (
    <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="border-b border-border/60">
                <th className="px-3 py-3 w-10 text-center">
                  <span className="sr-only">Sélection</span>
                </th>
                {['Date', 'Client', 'Facture source', 'Type', 'Numéro', 'Statut email', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {docsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-text-muted">
                    Chargement…
                  </td>
                </tr>
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-text-muted">
                    Aucun document généré
                  </td>
                </tr>
              ) : (
                docs.map((doc) => {
                  const isSelected = selectedDocumentIds.includes(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={`hover:bg-muted/40 transition-colors ${isSelected ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-200' : ''}`}
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleDocSelection(doc.id)}
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                          aria-label={`Sélectionner ${doc.documentNumber}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                        {new Date(doc.generatedAt).toLocaleDateString('fr-TN')}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {doc.sale?.customer?.name ?? 'Comptoir'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        {doc.sale?.invoiceNumber ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {doc.documentNumber}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`app-status-badge text-xs ${EMAIL_STATUS_COLORS[doc.emailStatus] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                        >
                          {EMAIL_STATUS_LABELS[doc.emailStatus] ?? doc.emailStatus}
                        </span>
                        {doc.sentTo && (
                          <p className="text-xs text-text-muted mt-0.5">{doc.sentTo}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <KebabMenu
                          items={[
                            {
                              label: 'Voir le PDF',
                              icon: <Eye size={14} />,
                              onClick: () => handleView(doc.id),
                            },
                            {
                              label: 'Télécharger le PDF',
                              icon: <Download size={14} />,
                              onClick: () => handleDownload(doc.id, doc.fileName),
                            },
                            {
                              label: copyingId === doc.id ? 'Copie…' : 'Copier le lien',
                              icon: copyingId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />,
                              onClick: () => handleCopyLink(doc.id),
                              disabled: copyingId === doc.id,
                            },
                            {
                              label: 'Envoyer le lien par email',
                              icon: <Link size={14} />,
                              onClick: () => setSendLinkDoc(doc),
                            },
                            {
                              label: 'Sélectionner pour email',
                              icon: <Mail size={14} />,
                              onClick: () => toggleDocSelection(doc.id),
                            },
                            {
                              label: 'Régénérer le PDF',
                              icon: <RefreshCw size={14} className={regenerateMutation.isPending ? 'animate-spin' : ''} />,
                              onClick: () => regenerateMutation.mutate(doc.id),
                              disabled: regenerateMutation.isPending,
                            },
                            {
                              label: 'Supprimer',
                              icon: <Trash2 size={14} />,
                              onClick: () => deleteMutation.mutate(doc.id),
                              disabled: deleteMutation.isPending,
                              variant: 'destructive',
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
  );

  const modal = sendLinkDoc ? (
    <SendLinkModal
      doc={sendLinkDoc}
      onClose={() => setSendLinkDoc(null)}
      onSent={() => queryClient.invalidateQueries({ queryKey: ['generated-documents'] })}
    />
  ) : null;

  if (noHeader) {
    return (
      <>
        {tableContent}
        {modal}
      </>
    );
  }

  return (
    <div className="rounded-lg border border-border/70 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/70">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-primary transition-colors"
        >
          <span>Historique des documents générés ({docs.length})</span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {selectedDocumentIds.length > 0 && onEmailClick && (
          <Button
            size="sm"
            variant="outline"
            onClick={onEmailClick}
            disabled={emailLoading}
            className="flex items-center gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50"
          >
            <Mail size={14} />
            Envoyer par email ({selectedDocumentIds.length})
          </Button>
        )}
      </div>
      {open && tableContent}
      {modal}
    </div>
  );
}
