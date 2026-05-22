'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalWindow } from '@/components/shared/ModalWindow';

interface Props {
  label: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PermanentDeleteDialog({ label, isPending, onConfirm, onCancel }: Props) {
  const footer = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={isPending}>
        Annuler
      </Button>
      <Button variant="destructive" size="sm" className="flex-1" onClick={onConfirm} disabled={isPending}>
        {isPending ? 'Suppression…' : 'Supprimer définitivement'}
      </Button>
    </div>
  );

  return (
    <ModalWindow
      title="Suppression définitive"
      isOpen={true}
      onClose={onCancel}
      defaultWidth={380}
      defaultHeight={260}
      minHeight={220}
      footer={footer}
    >
      <div className="space-y-3 px-6 py-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle size={22} className="text-red-600" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-primary">{label}</p>
          <p className="text-xs text-text-muted">
            Cette action est irréversible. Voulez-vous vraiment supprimer définitivement cet élément ?
          </p>
        </div>
      </div>
    </ModalWindow>
  );
}
