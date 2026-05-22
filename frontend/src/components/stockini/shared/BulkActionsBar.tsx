'use client';

import { ArrowRightLeft, Download, Loader2, Mail, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkActionsBarProps {
  count: number;
  onDownload: () => void;
  onEmail: () => void;
  emailLoading?: boolean;
  canTransform?: boolean;
  onTransform?: () => void;
  onClear: () => void;
}

export function BulkActionsBar({
  count,
  onDownload,
  onEmail,
  emailLoading,
  canTransform,
  onTransform,
  onClear,
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

      {/* Générer — orange */}
      <button
        type="button"
        onClick={onDownload}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium',
          'border border-orange-200/70 bg-orange-50 text-orange-700',
          'transition-all duration-150',
          'hover:-translate-y-px hover:border-orange-300 hover:bg-orange-100',
        )}
      >
        <Download size={12} />
        Générer
      </button>

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

      {/* Transformer — violet */}
      {canTransform && onTransform && (
        <button
          type="button"
          onClick={onTransform}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium',
            'border border-violet-200/70 bg-violet-50 text-violet-700',
            'transition-all duration-150',
            'hover:-translate-y-px hover:border-violet-300 hover:bg-violet-100',
          )}
        >
          <ArrowRightLeft size={12} />
          Transformer
        </button>
      )}

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
