'use client';

import type React from 'react';
import { Loader2, Mail, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkActionsBarProps {
  count: number;
  onEmail: () => void;
  emailLoading?: boolean;
  onClear: () => void;
  /** Bouton Transformer (dropdown) injecté avant Envoyer */
  transformButton?: React.ReactNode;
}

export function BulkActionsBar({
  count,
  onEmail,
  emailLoading,
  onClear,
  transformButton,
}: BulkActionsBarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        'rounded-2xl border border-slate-200/80',
        'bg-white/95 backdrop-blur-md shadow-lg shadow-slate-200/60',
        'px-2.5 py-1.5',
        'animate-in slide-in-from-top-2 fade-in duration-200',
      )}
    >
      {/* Selection count */}
      <span className="select-none whitespace-nowrap pl-1 pr-2 text-[11px] font-semibold tabular-nums text-slate-500">
        {count} sél.
      </span>

      <div className="h-4 w-px bg-slate-200" />

      {/* Transformer — dropdown injecté avant Envoyer */}
      {transformButton}

      {/* Envoyer — blue */}
      <button
        type="button"
        onClick={onEmail}
        disabled={emailLoading}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium',
          'border border-blue-200/70 bg-blue-50 text-blue-700',
          'transition-all duration-150',
          'hover:-translate-y-px hover:border-blue-300 hover:bg-blue-100',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {emailLoading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Mail size={12} />
        )}
        Envoyer
      </button>

      <div className="h-4 w-px bg-slate-200" />

      {/* Désélectionner — ghost */}
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition-all duration-150 hover:bg-slate-100 hover:text-slate-600"
        aria-label="Désélectionner tout"
      >
        <X size={12} />
      </button>
    </div>
  );
}
