'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ProductSearchAutocomplete } from './ProductSearchAutocomplete';
import {
  recalculateSaleLine,
  MIN_MARGIN_PERCENT,
  DEFAULT_MARGIN_PERCENT,
} from '@/lib/stockini/register-utils';
import type { RegisterLine } from '@/lib/stockini/register-utils';
import type { Product } from '@/lib/stockini/types';

interface Props {
  line: RegisterLine;
  lineNumber: number;
  hasLowMarginPermission: boolean;
  canEditUnitPriceHt: boolean;
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

export function ProductLineRow({ line, lineNumber, hasLowMarginPermission, canEditUnitPriceHt, onChange, onDelete }: Props) {
  const qteRef = useRef<HTMLInputElement>(null);
  const [puHtRaw, setPuHtRaw] = useState<string>('');
  const [isPuHtFocused, setIsPuHtFocused] = useState(false);

  const update = (patch: Partial<RegisterLine>) => {
    onChange(recalculateSaleLine({ ...line, ...patch }));
  };

  const handleProductSelect = (product: Product) => {
    const purchasePriceHt = round3(Number(product.purchasePrice));
    // salePrice is stored as HT; use it directly when no purchasePrice is available
    const puHt = purchasePriceHt > 0
      ? 0 // will be computed by recalculateSaleLine from defaultMarginPercent
      : round3(Number(product.salePrice));
    onChange(
      recalculateSaleLine({
        ...line,
        productId: product.id,
        reference: product.reference,
        designation: product.name,
        location: product.location ?? '',
        brand: product.brand?.name ?? product.category?.name ?? '',
        puHt,
        purchasePriceHt,
        defaultMarginPercent: DEFAULT_MARGIN_PERCENT,
        remisePercent: 0,
        quantity: Math.max(line.quantity, 1),
        // Sync TVA from the product so frontend and backend use the same rate
        tvaPercent: Number(product.tva ?? 19),
        manualUnitPriceHt: false,
      }),
    );
    setTimeout(() => qteRef.current?.select(), 50);
  };

  const fmt = (v: number) =>
    v > 0 ? v.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—';

  const puHtDisplayValue = isPuHtFocused
    ? puHtRaw
    : (line.puHt > 0 ? line.puHt.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '');

  const hasProduct = line.productId !== null || line.puHt > 0;
  const margeIsInvalid =
    line.margePercent === null
      ? line.productId !== null
      : line.margePercent < MIN_MARGIN_PERCENT;

  const margePercentDisplay = line.margePercent === null
    ? '—'
    : `${line.margePercent.toLocaleString('fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

  const margeAmountDisplay = line.margeAmount === null
    ? '—'
    : line.margeAmount.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const marginTooltip =
    line.margePercent === null && line.productId !== null
      ? "Prix d'achat HT manquant — vente bloquée"
      : line.margePercent !== null && line.margePercent < MIN_MARGIN_PERCENT
        ? `Marge inférieure au minimum autorisé de ${MIN_MARGIN_PERCENT}%`
        : undefined;

  const margeColorClass =
    line.margePercent === null
      ? line.productId !== null ? 'text-red-600 font-semibold' : 'text-text-muted'
      : line.margePercent < MIN_MARGIN_PERCENT
        ? !hasLowMarginPermission ? 'text-red-600 font-semibold bg-red-50' : 'text-orange-500 font-semibold'
        : 'text-emerald-600 font-semibold';

  return (
    <tr className={`h-9 border-b border-border/30 group ${margeIsInvalid ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-slate-50/80'}`}>
      {/* N° */}
      <td className={`w-8 text-center text-xs text-text-muted select-none ${CELL}`}>
        {lineNumber}
      </td>

      {/* Réf produit */}
      <td className={`min-w-[110px] ${CELL}`}>
        <ProductSearchAutocomplete
          value={line.reference}
          searchMode="REFERENCE"
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
          searchMode="DESIGNATION"
          onChange={(v) => update({ designation: v })}
          onSelect={handleProductSelect}
          placeholder="Désignation…"
          className={TEXT_INPUT}
          editable
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

      {/* PU HT — éditable si canEditUnitPriceHt, sinon lecture seule */}
      <td className={`min-w-[80px] ${CELL}`}>
        {canEditUnitPriceHt ? (
          <input
            type="text"
            inputMode="decimal"
            value={puHtDisplayValue}
            onFocus={() => {
              setPuHtRaw(line.puHt > 0 ? String(line.puHt) : '');
              setIsPuHtFocused(true);
            }}
            onChange={(e) => {
              const raw = e.target.value;
              setPuHtRaw(raw);
              // Recalcul immédiat à chaque frappe
              const newPuHt = Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
              const margin = line.purchasePriceHt > 0
                ? ((newPuHt / line.purchasePriceHt) - 1) * 100 + line.remisePercent
                : line.defaultMarginPercent;
              onChange(recalculateSaleLine({ ...line, defaultMarginPercent: margin, manualUnitPriceHt: true }));
            }}
            onBlur={() => {
              setIsPuHtFocused(false);
              // Recalcul final pour assurer la cohérence (ex: focus sans frappe)
              const newPuHt = Math.max(0, parseFloat(puHtRaw.replace(',', '.')) || 0);
              const margin = line.purchasePriceHt > 0
                ? ((newPuHt / line.purchasePriceHt) - 1) * 100 + line.remisePercent
                : line.defaultMarginPercent;
              onChange(recalculateSaleLine({ ...line, defaultMarginPercent: margin, manualUnitPriceHt: true }));
            }}
            placeholder="—"
            className={NUM_INPUT}
          />
        ) : (
          <div
            className="w-full px-2 py-1 text-xs text-right tabular-nums text-text-secondary cursor-not-allowed select-none"
            title="Vous n'avez pas la permission de modifier le PU HT"
          >
            {line.puHt === 0 ? '—' : line.puHt.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
          </div>
        )}
      </td>

      {/* Marge nette % — read-only, auto-calculated */}
      <td
        className={`min-w-[70px] px-2 text-xs text-right tabular-nums ${CELL} ${margeColorClass}`}
        title={marginTooltip}
      >
        {hasProduct ? margePercentDisplay : '—'}
      </td>

      {/* Marge DT */}
      <td
        className={`min-w-[80px] px-2 text-xs text-right tabular-nums ${CELL} ${margeColorClass}`}
        title={marginTooltip}
      >
        {hasProduct ? margeAmountDisplay : '—'}
      </td>

      {/* Remise % — soustraite directement de la marge brute */}
      <td className={`min-w-[60px] ${CELL}`}>
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={line.remisePercent === 0 ? '' : line.remisePercent}
          onChange={(e) => update({
            remisePercent: Math.max(0, Math.min(100, Number(e.target.value.replace(',', '.')) || 0)),
          })}
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
