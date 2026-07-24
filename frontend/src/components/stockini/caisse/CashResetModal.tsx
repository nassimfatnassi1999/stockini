'use client';

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, AlertTriangle, X, Banknote, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type TreasuryAccount = 'PHYSICAL_CASH' | 'BANK_TREASURY';

interface Props {
  onClose: () => void;
  defaultAccount?: TreasuryAccount;
}

const REASON_SUGGESTIONS = [
  'Clôture annuelle',
  'Clôture mensuelle',
  'Correction comptable',
  'Ouverture nouvel exercice',
];

const ACCOUNT_OPTIONS: { value: TreasuryAccount; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'PHYSICAL_CASH', label: 'Caisse physique', icon: Banknote, color: 'text-orange-600' },
  { value: 'BANK_TREASURY', label: 'Banque / Chèques / Virements', icon: Building2, color: 'text-blue-600' },
];

export function CashResetModal({ onClose, defaultAccount = 'PHYSICAL_CASH' }: Props) {
  const [motif, setMotif] = useState('');
  const [account, setAccount] = useState<TreasuryAccount>(defaultAccount);
  const queryClient = useQueryClient();
  const submitRef = useRef(false);

  const mutation = useMutation({
    mutationFn: () => api.post('/caisse/reset', { motif, account }),
    onSuccess: () => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative max-h-[calc(100dvh-24px)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-6">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
              <RotateCcw size={18} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">Remise à zéro</h2>
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

        {/* Account selector */}
        <div className="mb-4 space-y-2">
          <p className="text-[12px] font-medium text-text-primary">Compte à remettre à zéro</p>
          <div className="grid grid-cols-2 gap-2">
            {ACCOUNT_OPTIONS.map(({ value, label, icon: Icon, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => setAccount(value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] font-medium transition-colors',
                  account === value
                    ? 'border-accent bg-accent/5 text-accent'
                    : 'border-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary',
                )}
              >
                <Icon size={16} className={account === value ? 'text-accent' : color} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Warning */}
        <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-[12px] text-amber-800">
            <p className="font-medium">
              Le solde de{' '}
              {account === 'PHYSICAL_CASH' ? 'la caisse physique' : 'la trésorerie bancaire'}{' '}
              sera ramené à 0 DT.
            </p>
            <p className="mt-1 text-amber-700">Les transactions historiques ne seront pas supprimées.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {mutation.isError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {(mutation.error as any)?.response?.data?.message ?? 'Une erreur est survenue.'}
            </p>
          )}

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
              {mutation.isPending ? 'Traitement…' : 'Confirmer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
