'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Banknote, Building2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

type OpType = 'depot' | 'retrait';
type TreasuryAccount = 'PHYSICAL_CASH' | 'BANK_TREASURY';

interface Props {
  type: OpType;
  onClose: () => void;
  defaultAccount?: TreasuryAccount;
}

const ACCOUNT_OPTIONS: { value: TreasuryAccount; label: string; icon: React.ElementType }[] = [
  { value: 'PHYSICAL_CASH', label: 'Caisse physique', icon: Banknote },
  { value: 'BANK_TREASURY', label: 'Banque / Chèques', icon: Building2 },
];

export function CashManualOpModal({ type, onClose, defaultAccount = 'PHYSICAL_CASH' }: Props) {
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [account, setAccount] = useState<TreasuryAccount>(defaultAccount);
  const queryClient = useQueryClient();

  const isDepot = type === 'depot';
  const Icon = isDepot ? ArrowUpCircle : ArrowDownCircle;
  const label = isDepot ? 'Dépôt' : 'Retrait';
  const endpoint = isDepot ? '/caisse/depot' : '/caisse/retrait';

  const mutation = useMutation({
    mutationFn: () =>
      api.post(endpoint, { montant: parseFloat(montant), motif: motif || undefined, account }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['caisse-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['caisse-transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['caisse-balance'] });
      toast.success(`${label} enregistré avec succès`);
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? `Erreur lors du ${label.toLowerCase()}`);
    },
  });

  const valid = !!montant && parseFloat(montant) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              isDepot ? 'bg-emerald-100' : 'bg-red-100',
            )}>
              <Icon size={18} className={isDepot ? 'text-emerald-600' : 'text-red-600'} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">{label} manuel</h2>
              <p className="text-[11px] text-text-secondary">Choisissez le compte cible</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        {/* Account selector */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {ACCOUNT_OPTIONS.map(({ value, label: acc, icon: AccIcon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setAccount(value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] font-medium transition-colors',
                account === value
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-border bg-surface text-text-secondary hover:border-accent/40',
              )}
            >
              <AccIcon size={15} />
              {acc}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {/* Montant */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-text-primary">
              Montant (DT) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="0.000"
              className={cn(
                'w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary',
                'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
              )}
            />
          </div>

          {/* Motif */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-text-primary">Motif</label>
            <input
              type="text"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Optionnel"
              className={cn(
                'w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-primary',
                'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30',
              )}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={!valid || mutation.isPending}
              onClick={() => mutation.mutate()}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold text-white',
                isDepot ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              <Icon size={13} />
              {mutation.isPending ? 'Traitement…' : label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
