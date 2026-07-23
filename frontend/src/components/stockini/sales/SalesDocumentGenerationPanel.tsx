'use client';

import { X } from 'lucide-react';
import type { SalesDocumentType } from '@/lib/stockini/types';

export const SALES_DOCUMENT_GENERATION_ACTIONS: Array<{
  type: SalesDocumentType;
  label: string;
}> = [
  { type: 'DEVIS', label: 'Générer devis' },
  { type: 'BON_COMMANDE', label: 'Générer bon de commande' },
  { type: 'BON_LIVRAISON', label: 'Générer bon de livraison' },
  { type: 'FACTURE', label: 'Générer facture' },
  { type: 'AVOIR', label: 'Générer avoir' },
];

export function SalesDocumentGenerationPanel({
  count,
  generating,
  onGenerate,
  onClose,
}: {
  count: number;
  generating: SalesDocumentType | null;
  onGenerate: (type: SalesDocumentType) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-40 w-64 overflow-hidden rounded-xl border border-border/70 bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center justify-between border-b border-border/60 bg-primary/5 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Générer un document</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {count} vente{count > 1 ? 's' : ''} sélectionnée{count > 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-muted hover:text-text-primary"
          aria-label="Fermer"
        >
          <X size={15} />
        </button>
      </div>
      <div className="space-y-1.5 p-3">
        {SALES_DOCUMENT_GENERATION_ACTIONS.map((action) => (
          <button
            key={action.type}
            type="button"
            disabled={generating !== null}
            onClick={() => onGenerate(action.type)}
            className="flex w-full items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5 text-left text-sm font-medium text-text-primary transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating === action.type && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
