'use client';

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  onClose: () => void;
}

const REASON_SUGGESTIONS = [
  'Clôture annuelle',
  'Clôture mensuelle',
  'Correction comptable',
  'Ouverture nouvel exercice',
];

export function CashResetModal({ onClose }: Props) {
  const [motif, setMotif] = useState('');
  const queryClient = useQueryClient();
  const submitRef = useRef(false);

  const mutation = useMutation({
    mutationFn: () => api.post('/caisse/reset', { motif }),
    onSuccess: () => {
      // Invalidate all caisse queries
      void queryClient.invalidateQueries({ queryKey: ['caisse-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['caisse-transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['caisse-analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['caisse-balance'] });
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!motif.trim() || submitRef.current || mutation.isPending) return;
    submitRef.current = true;
    mutation.mutate(undefined, { onSettled: () => { submitRef.current = false; } });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
              <RotateCcw size={18} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">Remise à zéro de la caisse</h2>
              <p className="text-[11px] text-text-secondary">Action irréversible — traçée dans l'audit</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        {/* Warning */}
        <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-[12px] text-amber-800">
            <p className="font-medium">Cette opération créera une écriture d'ajustement afin de ramener le solde actuel à 0 DT.</p>
            <p className="mt-1 text-amber-700">Les transactions historiques ne seront pas supprimées.</p>
            <p className="mt-1 text-amber-700">Voulez-vous continuer ?</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Motif field */}
          <div className="space-y-2">
            <label className="block text-[12px] font-medium text-text-primary">
              Motif <span className="text-red-500">*</span>
            </label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={3}
              placeholder="Décrivez le motif de la remise à zéro…"
              className={cn(
                'w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-text-primary placeholder:text-text-secondary',
                'transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
              )}
            />
            {/* Quick-pick suggestions */}
            <div className="flex flex-wrap gap-1.5">
              {REASON_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMotif(s)}
                  className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {mutation.isError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {(mutation.error as any)?.response?.data?.message ?? 'Une erreur est survenue.'}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!motif.trim() || mutation.isPending}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition-colors',
                'bg-red-600 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              <RotateCcw size={13} className={mutation.isPending ? 'animate-spin' : ''} />
              {mutation.isPending ? 'Traitement…' : 'Confirmer la remise à zéro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
