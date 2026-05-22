'use client';

import { AlertTriangle } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';

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
  return (
    <SlideOver
      title="Confirmer la suppression"
      open={open}
      onClose={onCancel}
      width={420}
      footer={
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
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
      }
    >
      <div className="flex flex-col gap-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700">
            <AlertTriangle size={18} />
          </span>
          <p className="text-sm text-text-primary">Voulez-vous supprimer cet élément ?</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6">
          <p className="text-text-secondary">
            <strong>Type :</strong> {entityType}
          </p>
          <p className="text-text-secondary">
            <strong>Référence :</strong>{' '}
            <span className="font-mono font-semibold text-text-primary">{reference}</span>
          </p>
          <p className="mt-2 text-xs font-semibold text-red-700">Cette action est irréversible.</p>
        </div>
      </div>
    </SlideOver>
  );
}
