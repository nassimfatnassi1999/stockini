'use client';

import Decimal from 'decimal.js';
import { money } from '@/lib/stockini/format';

export function AcceptedDifferenceOption({
  checked,
  disabled,
  difference,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  difference: Decimal;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className={`rounded-lg border p-3 text-sm ${checked ? 'border-amber-300 bg-amber-50' : 'border-border bg-white'}`}>
      <label className={`flex items-start gap-3 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border accent-amber-600"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <span>
          <span className="block font-semibold text-text-primary">Accepter ce montant comme règlement total</span>
          <span className="mt-1 block text-xs leading-5 text-text-muted">
            Le document sera marqué comme payé. La différence
            {difference.gt(0) ? ` de ${money(difference.toFixed(3))}` : ''} sera abandonnée et aucune dette ne sera créée.
          </span>
        </span>
      </label>
      {checked && difference.gt(0) && (
        <p className="mt-3 rounded border border-amber-200 bg-amber-100/60 px-3 py-2 text-xs text-amber-900">
          Cette action constitue un abandon commercial du reliquat et sera enregistrée dans l’audit.
        </p>
      )}
    </div>
  );
}
