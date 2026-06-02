'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface ClearHistoryModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending?: boolean;
  moduleName?: string;
}

const CONFIRMATION_WORD = 'VIDER';

export function ClearHistoryModal({
  open,
  onClose,
  onConfirm,
  isPending = false,
  moduleName,
}: ClearHistoryModalProps) {
  const [typed, setTyped] = useState('');

  if (!open) return null;

  const confirmed = typed === CONFIRMATION_WORD;

  function handleConfirm() {
    if (!confirmed || isPending) return;
    onConfirm();
  }

  function handleClose() {
    setTyped('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-xl">
        {/* Icon + Title */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">
            Vider l&apos;historique{moduleName ? ` – ${moduleName}` : ''} ?
          </h2>
        </div>

        {/* Warning message */}
        <p className="mb-4 text-sm text-text-secondary">
          Cette action masque les entrées d&apos;historique affichées dans l&apos;interface.
          Les soldes, dettes, documents, paiements comptables et calculs financiers
          <strong> ne sont pas modifiés</strong>. Les mouvements futurs continueront à apparaître normalement.
        </p>

        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cette action est irréversible pour l&apos;historique actuellement visible.
        </div>

        {/* Confirmation input */}
        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium text-text-primary">
            Tapez <span className="font-mono font-bold text-red-600">{CONFIRMATION_WORD}</span> pour confirmer
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            placeholder={CONFIRMATION_WORD}
            autoComplete="off"
            className="w-full rounded-md border border-border px-3 py-2 font-mono text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!confirmed || isPending}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={14} />
            {isPending ? 'Vidage...' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
