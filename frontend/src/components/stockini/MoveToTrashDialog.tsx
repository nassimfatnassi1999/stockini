'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlideOver } from '@/components/ui/SlideOver';

interface Props {
  label: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MoveToTrashDialog({ label, isPending, onConfirm, onCancel }: Props) {
  return (
    <SlideOver
      title="Déplacer vers la corbeille"
      open={true}
      onClose={onCancel}
      width={420}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button variant="destructive" size="sm" className="flex-1" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Déplacement…' : 'Mettre à la corbeille'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <Trash2 size={24} className="text-amber-600" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-primary">{label}</p>
          <p className="text-xs text-text-muted">
            Cet élément sera envoyé dans la corbeille. Vous pourrez le restaurer ou le supprimer définitivement depuis la corbeille.
          </p>
        </div>
      </div>
    </SlideOver>
  );
}
