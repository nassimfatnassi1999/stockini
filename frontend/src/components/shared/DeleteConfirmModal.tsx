'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  open: boolean;
  entityType: string;
  reference: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  open,
  entityType,
  reference,
  loading = false,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  const content = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0D2B3E]/45 p-4"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onCancel(); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-[420px] rounded-lg bg-white p-6 shadow-[0_8px_40px_rgba(13,43,62,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700">
              <AlertTriangle size={18} />
            </span>
            <h2 id="delete-modal-title" className="text-[15px] font-bold text-text-primary">
              Confirmer la suppression
            </h2>
          </div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
            disabled={loading}
            className="app-action-button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-text-primary">
          <p>
            Voulez-vous supprimer cet élément ?
          </p>
          <p className="mt-1 text-text-secondary">
            <strong>Type :</strong> {entityType}
          </p>
          <p className="text-text-secondary">
            <strong>Référence :</strong>{' '}
            <span className="font-mono font-semibold text-text-primary">
              {reference}
            </span>
          </p>
          <p className="mt-2 text-xs font-semibold text-red-700">
            Cette action est irréversible.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(); }}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConfirm(); }}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Suppression…
              </>
            ) : (
              'Supprimer'
            )}
          </button>
        </div>
      </div>

    </div>
  );

  return createPortal(content, document.body);
}
