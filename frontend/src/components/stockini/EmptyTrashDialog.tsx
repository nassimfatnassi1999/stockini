'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlideOver } from '@/components/ui/SlideOver';

interface Props {
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRMATION_WORD = 'VIDER';

export function EmptyTrashDialog({ isPending, onConfirm, onCancel }: Props) {
  const [input, setInput] = useState('');
  const isConfirmed = input === CONFIRMATION_WORD;

  return (
    <SlideOver
      title="Vider la corbeille"
      open={true}
      onClose={onCancel}
      width={420}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={onConfirm}
            disabled={!isConfirmed || isPending}
          >
            {isPending ? 'Suppression…' : 'Supprimer définitivement'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle size={24} className="text-red-600" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-primary">Vider définitivement la corbeille ?</p>
          <p className="text-sm text-text-secondary">
            Cette action supprimera définitivement tous les éléments. Elle est irréversible.
          </p>
        </div>
        <div className="w-full space-y-1.5 text-left">
          <p className="text-xs text-text-muted">
            Pour confirmer, tapez{' '}
            <span className="font-mono font-semibold text-red-600">{CONFIRMATION_WORD}</span>{' '}
            ci-dessous :
          </p>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={CONFIRMATION_WORD}
            disabled={isPending}
            className="w-full rounded-md border border-border/70 bg-white px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-50"
          />
        </div>
      </div>
    </SlideOver>
  );
}
