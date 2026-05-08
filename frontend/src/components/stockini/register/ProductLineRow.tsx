'use client';

import { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { ProductSearchAutocomplete } from './ProductSearchAutocomplete';
import { recalculateLine } from '@/lib/stockini/register-utils';
import type { RegisterLine } from '@/lib/stockini/register-utils';
import type { Product } from '@/lib/stockini/types';

interface Props {
  line: RegisterLine;
  lineNumber: number;
  onChange: (line: RegisterLine) => void;
  onDelete: () => void;
}

const DEFAULT_TVA = 19;

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}

const CELL = 'border-r border-border/30';
const NUM_INPUT =
  'w-full bg-transparent text-xs outline-none focus:bg-primary/5 px-2 py-1 rounded min-w-0 tabular-nums text-right';
const TEXT_INPUT =
  'w-full bg-transparent text-xs outline-none focus:bg-primary/5 px-2 py-1 rounded min-w-0';

export function ProductLineRow({ line, lineNumber, onChange, onDelete }: Props) {
  const qteRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<RegisterLine>) => {
    onChange(recalculateLine({ ...line, ...patch }));
  };

  const handleProductSelect = (product: Product) => {
    const tva = line.tvaPercent || DEFAULT_TVA;
    // product.salePrice is TTC; derive the HT unit price
    const salePriceTtc = Number(product.salePrice);
    const puHt = round3(salePriceTtc / (1 + tva / 100));
    onChange(
      recalculateLine({
        ...line,
        productId: product.id,
        reference: product.reference,
        designation: product.name,
        location: product.location ?? '',
        brand: product.brand?.name ?? product.category?.name ?? '',
        puHt,
        quantity: Math.max(line.quantity, 1),
      }),
    );
    setTimeout(() => qteRef.current?.select(), 50);
  };

  const fmt = (v: number) =>
    v > 0 ? v.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—';

  return (
    <tr className="h-9 border-b border-border/30 hover:bg-slate-50/80 group">
      {/* N° */}
      <td className={`w-8 text-center text-xs text-text-muted select-none ${CELL}`}>
        {lineNumber}
      </td>

      {/* Réf produit */}
      <td className={`min-w-[110px] ${CELL}`}>
        <ProductSearchAutocomplete
          value={line.reference}
          onChange={(v) => update({ reference: v })}
          onSelect={handleProductSelect}
          placeholder="Référence…"
          className={`${TEXT_INPUT} font-mono`}
        />
      </td>

      {/* Libellé / Désignation */}
      <td className={`min-w-[170px] ${CELL}`}>
        <ProductSearchAutocomplete
          value={line.designation}
          onChange={(v) => update({ designation: v })}
          onSelect={handleProductSelect}
          placeholder="Désignation…"
          className={TEXT_INPUT}
        />
      </td>

      {/* Emplacement */}
      <td className={`min-w-[80px] px-2 text-xs text-text-muted ${CELL}`}>
        {line.location || '—'}
      </td>

      {/* Marque / Famille */}
      <td className={`min-w-[90px] px-2 text-xs text-text-muted ${CELL}`}>
        {line.brand || '—'}
      </td>

      {/* Qté */}
      <td className={`min-w-[55px] ${CELL}`}>
        <input
          ref={qteRef}
          type="number"
          min={0}
          step={1}
          value={line.quantity === 0 ? '' : line.quantity}
          onChange={(e) => update({ quantity: Math.max(0, Number(e.target.value) || 0) })}
          className={NUM_INPUT}
        />
      </td>

      {/* PU HT */}
      <td className={`min-w-[80px] ${CELL}`}>
        <input
          type="number"
          min={0}
          step={0.001}
          value={line.puHt === 0 ? '' : line.puHt}
          onChange={(e) => update({ puHt: Math.max(0, Number(e.target.value) || 0) })}
          className={NUM_INPUT}
        />
      </td>

      {/* Remise % */}
      <td className={`min-w-[60px] ${CELL}`}>
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={line.remisePercent === 0 ? '' : line.remisePercent}
          onChange={(e) =>
            update({
              remisePercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
            })
          }
          placeholder="0"
          className={NUM_INPUT}
        />
      </td>

      {/* TVA % */}
      <td className={`min-w-[55px] ${CELL}`}>
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={line.tvaPercent}
          onChange={(e) =>
            update({
              tvaPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
            })
          }
          className={NUM_INPUT}
        />
      </td>

      {/* Net HT */}
      <td
        className={`min-w-[80px] px-2 text-xs text-right tabular-nums font-medium text-text-primary ${CELL}`}
      >
        {fmt(line.netHt)}
      </td>

      {/* Net TTC */}
      <td
        className={`min-w-[85px] px-2 text-xs text-right tabular-nums font-semibold text-text-primary ${CELL}`}
      >
        {fmt(line.netTtc)}
      </td>

      {/* Delete */}
      <td className="w-8 px-1 text-center">
        <button
          type="button"
          onClick={onDelete}
          tabIndex={-1}
          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-red-50 hover:text-red-600"
          aria-label="Supprimer la ligne"
        >
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  );
}
