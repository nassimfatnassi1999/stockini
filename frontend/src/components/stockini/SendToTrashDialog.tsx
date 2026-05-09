'use client';

import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  label: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SendToTrashDialog({ label, isPending, onConfirm, onCancel }: Props) {
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
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <Trash2 size={22} className="text-amber-600" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">
              Envoyer vers la corbeille ?
            </h3>
            <p className="text-sm text-text-secondary">
              <span className="font-semibold">{label}</span>
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Cet élément sera déplacé vers la corbeille. Vous pourrez le restaurer ou le supprimer définitivement.
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
            {isPending ? 'Déplacement…' : 'Envoyer à la corbeille'}
          </Button>
        </div>
      </div>
    </div>
  );
}
