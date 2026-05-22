'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalWindow } from '@/components/shared/ModalWindow';

interface Props {
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRMATION_WORD = 'VIDER';

export function EmptyTrashDialog({ isPending, onConfirm, onCancel }: Props) {
  const [input, setInput] = useState('');
  const isConfirmed = input === CONFIRMATION_WORD;

  const footer = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={isPending}>
        Annuler
      </Button>
      <Button variant="destructive" size="sm" className="flex-1" onClick={onConfirm} disabled={!isConfirmed || isPending}>
        {isPending ? 'Suppression…' : 'Supprimer définitivement'}
      </Button>
    </div>
  );

  return (
    <ModalWindow
      title="Vider la corbeille"
      isOpen={true}
      onClose={onCancel}
      defaultWidth={380}
      defaultHeight={330}
      minHeight={280}
      footer={footer}
    >
      <div className="space-y-4 px-6 py-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle size={22} className="text-red-600" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-primary">Vider définitivement la corbeille ?</p>
          <p className="text-sm text-text-secondary">
            Cette action supprimera définitivement tous les éléments. Elle est irréversible.
          </p>
        </div>
        <div className="text-left space-y-1.5">
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
    </ModalWindow>
  );
}
