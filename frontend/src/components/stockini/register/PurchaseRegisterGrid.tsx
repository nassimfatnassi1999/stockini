'use client';

import { Plus } from 'lucide-react';
import { PurchaseLineRow } from './PurchaseLineRow';
import {
  calculateDocumentTotals,
  createEmptyLine,
  isFilledLine,
  type RegisterLine,
} from '@/lib/stockini/register-utils';

interface Props {
  lines: RegisterLine[];
  onLinesChange: (lines: RegisterLine[]) => void;
}

const HEADERS = [
  { label: 'N°', className: 'w-8 text-center' },
  { label: 'Réf produit', className: 'min-w-[110px]' },
  { label: 'Désignation', className: 'min-w-[170px]' },
  { label: 'Emplacement', className: 'min-w-[80px]' },
  { label: 'Marque / Famille', className: 'min-w-[90px]' },
  { label: 'Qté', className: 'min-w-[55px] text-right' },
  { label: 'PU Achat HT', className: 'min-w-[80px] text-right' },
  { label: 'TVA %', className: 'min-w-[55px] text-right' },
  { label: 'Remise %', className: 'min-w-[60px] text-right' },
  { label: 'Net HT', className: 'min-w-[80px] text-right' },
  { label: 'Net TTC', className: 'min-w-[85px] text-right' },
  { label: '', className: 'w-8' },
];

function fmt3(value: number): string {
  return value.toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function PurchaseRegisterGrid({ lines, onLinesChange }: Props) {
  const totals = calculateDocumentTotals(lines);

  const updateLine = (index: number, updated: RegisterLine) => {
    const next = lines.map((l, i) => (i === index ? updated : l));
    if (index === lines.length - 1 && isFilledLine(updated)) {
      onLinesChange([...next, createEmptyLine()]);
    } else {
      onLinesChange(next);
    }
  };

  const deleteLine = (index: number) => {
    const next = lines.filter((_, i) => i !== index);
    onLinesChange(next.length > 0 ? next : [createEmptyLine()]);
  };

  const addLine = () => {
    onLinesChange([...lines, createEmptyLine()]);
  };

  return (
    <div className="rounded-lg border border-border/70 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: '900px' }}>
          <thead>
            <tr className="bg-surface border-b border-border/60">
              {HEADERS.map((h, i) => (
                <th
                  key={i}
                  className={`px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-700 border-r border-border/30 last:border-r-0 ${h.className}`}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <PurchaseLineRow
                key={line.id}
                line={line}
                lineNumber={index + 1}
                onChange={(updated) => updateLine(index, updated)}
                onDelete={() => deleteLine(index)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Add line button */}
      <div className="px-3 py-1.5 border-t border-border/30">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
        >
          <Plus size={12} />
          Ajouter une ligne
        </button>
      </div>

      {/* Totals */}
      <div className="border-t border-border/70 bg-surface px-4 py-3">
        <div className="flex flex-wrap items-end justify-end gap-6">
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Total HT
            </div>
            <div className="mt-0.5 font-semibold tabular-nums text-text-primary">
              {fmt3(totals.totalHt)} DT
            </div>
          </div>
          {totals.totalRemise > 0 && (
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Total Remise
              </div>
              <div className="mt-0.5 font-semibold tabular-nums text-orange-600">
                −{fmt3(totals.totalRemise)} DT
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Total TVA
            </div>
            <div className="mt-0.5 font-semibold tabular-nums text-text-primary">
              {fmt3(totals.totalTva)} DT
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Total TTC
            </div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-primary">
              {fmt3(totals.totalTtc)} DT
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Timbre fiscal</div>
            <div className="mt-0.5 font-semibold tabular-nums text-text-primary">{fmt3(totals.stampDuty)} DT</div>
          </div>
          <div className="text-right border-l border-border pl-5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Total à payer</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-primary">{fmt3(totals.totalFinal)} DT</div>
          </div>
        </div>
      </div>
    </div>
  );
}
