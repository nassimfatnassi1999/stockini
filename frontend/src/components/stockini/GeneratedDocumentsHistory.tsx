'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Mail,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { stockiniApi } from '@/lib/stockini/api';
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
}

export function GeneratedDocumentsHistory({ selectedDocumentIds, onDocumentSelectionChange, onEmailClick, emailLoading }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);

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

  const handleDownload = (id: string, fileName: string) => {
    const url = stockiniApi.downloadDocumentUrl(id);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const handleView = async (id: string) => {
    try {
      const { url } = await stockiniApi.documentPresignedUrl(id);
      window.open(url, '_blank');
    } catch {
      toast.error('Impossible d\'ouvrir le document');
    }
  };

  const toggleDocSelection = (id: string) => {
    if (selectedDocumentIds.includes(id)) {
      onDocumentSelectionChange(selectedDocumentIds.filter((d) => d !== id));
    } else {
      onDocumentSelectionChange([...selectedDocumentIds, id]);
    }
  };

  const docs = docsQuery.data ?? [];

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

      {open && (
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
                        <div className="flex items-center gap-1">
                          <Button
                            variant="actionView"
                            size="action"
                            title="Voir le PDF"
                            onClick={() => handleView(doc.id)}
                          >
                            <Eye size={13} />
                          </Button>
                          <Button
                            variant="actionView"
                            size="action"
                            title="Télécharger le PDF"
                            onClick={() => handleDownload(doc.id, doc.fileName)}
                          >
                            <Download size={13} />
                          </Button>
                          <Button
                            variant="actionView"
                            size="action"
                            title="Sélectionner pour envoi email"
                            onClick={() => toggleDocSelection(doc.id)}
                          >
                            <Mail size={13} />
                          </Button>
                          <Button
                            variant="actionView"
                            size="action"
                            title="Régénérer le PDF"
                            disabled={regenerateMutation.isPending}
                            onClick={() => regenerateMutation.mutate(doc.id)}
                          >
                            <RefreshCw size={13} className={regenerateMutation.isPending ? 'animate-spin' : ''} />
                          </Button>
                          <Button
                            variant="actionDelete"
                            size="action"
                            title="Supprimer"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(doc.id)}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
