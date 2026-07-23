'use client';

import type { ReactNode } from 'react';
import { Combine, Download, Loader2, RotateCcw } from 'lucide-react';
import { BulkActionsBar } from '@/components/stockini/shared/BulkActionsBar';
import { money } from '@/lib/stockini/format';
import {
  calculateSalesSelectionTotal,
  getSalesSelectionActions,
  type SelectableSale,
} from '@/lib/stockini/sales-selection-actions';

interface SalesSelectionActionsBarProps {
  sales: SelectableSale[];
  canConsolidate: boolean;
  canDeconsolidate: boolean;
  onGenerate: () => void;
  onConsolidate: () => void;
  onDeconsolidate: () => void;
  onEmail: () => void;
  onClear: () => void;
  generationLoading?: boolean;
  emailLoading?: boolean;
  fallbackAction?: ReactNode;
}

export function SalesSelectionActionsBar({
  sales,
  canConsolidate,
  canDeconsolidate,
  onGenerate,
  onConsolidate,
  onDeconsolidate,
  onEmail,
  onClear,
  generationLoading,
  emailLoading,
  fallbackAction,
}: SalesSelectionActionsBarProps) {
  const actions = getSalesSelectionActions(sales);
  if (!sales.length) return null;

  const generateButton = actions.showGenerate ? (
    <button
      type="button"
      onClick={onGenerate}
      disabled={generationLoading}
      className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-orange-200/70 bg-orange-50 px-4 text-[12px] font-medium text-orange-700 transition-all duration-150 hover:-translate-y-px hover:border-orange-300 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {generationLoading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      {actions.generateLabel}
    </button>
  ) : null;

  const selectionAction = actions.showDeconsolidate ? (
    canDeconsolidate ? (
      <button
        type="button"
        onClick={onDeconsolidate}
        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50 px-4 text-[12px] font-medium text-amber-800 hover:bg-amber-100"
      >
        <RotateCcw size={12} /> Déconsolider
      </button>
    ) : null
  ) : sales.length >= 2 && canConsolidate ? (
    <button
      type="button"
      onClick={onConsolidate}
      disabled={!actions.showConsolidate}
      title={actions.consolidationError ?? undefined}
      className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-violet-200 bg-violet-50 px-4 text-[12px] font-medium text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Combine size={12} /> Regrouper · {money(calculateSalesSelectionTotal(sales))}
    </button>
  ) : fallbackAction;

  return (
    <div className="flex items-center gap-2">
      {sales.length > 1 && actions.consolidationError && (
        <p className="max-w-64 text-right text-[11px] font-medium leading-tight text-amber-700">
          {actions.consolidationError}
        </p>
      )}
      <BulkActionsBar
        count={sales.length}
        onEmail={onEmail}
        emailLoading={emailLoading}
        onClear={onClear}
        generateButton={generateButton}
        transformButton={selectionAction}
      />
    </div>
  );
}
