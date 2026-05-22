'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlideOver } from '@/components/ui/SlideOver';

interface Props {
  label: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PermanentDeleteDialog({ label, isPending, onConfirm, onCancel }: Props) {
  return (
    <SlideOver
      title="Suppression définitive"
      open={true}
      onClose={onCancel}
      width={420}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button variant="destructive" size="sm" className="flex-1" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Suppression…' : 'Supprimer définitivement'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle size={24} className="text-red-600" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-primary">{label}</p>
          <p className="text-xs text-text-muted">
            Cette action est irréversible. Voulez-vous vraiment supprimer définitivement cet élément ?
          </p>
        </div>
      </div>
    </SlideOver>
  );
}
