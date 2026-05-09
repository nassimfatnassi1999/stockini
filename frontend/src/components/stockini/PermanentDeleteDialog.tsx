'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  label: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PermanentDeleteDialog({ label, isPending, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel, isPending]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border/70 bg-white shadow-2xl">
        <div className="space-y-4 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle size={22} className="text-red-600" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">
              Suppression définitive
            </h3>
            <p className="text-sm text-text-secondary">
              <span className="font-semibold">{label}</span>
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Cette action est irréversible. Voulez-vous vraiment supprimer définitivement cet élément ?
            </p>
          </div>
        </div>
        <div className="flex gap-2 border-t border-border/60 px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onCancel}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Suppression…' : 'Supprimer définitivement'}
          </Button>
        </div>
      </div>
    </div>
  );
}
