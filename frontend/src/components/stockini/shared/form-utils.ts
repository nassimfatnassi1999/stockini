'use client';

import { useQuery } from '@tanstack/react-query';
import { stockiniApi } from '@/lib/stockini/api';
import { FALLBACK_OPTIONS } from './dropdown-options';

export type FieldConfig = {
  name: string;
  label: string;
  readOnly?: boolean;
  required?: boolean;
  type?: 'text' | 'number' | 'email' | 'select' | 'checkbox';
  options?: Array<{ value: string; label: string }>;
};

export function useDropdownOptions(category: string) {
  const query = useQuery({
    queryKey: ['stockini-dropdown-options', category],
    queryFn: () => stockiniApi.dropdownOptionsByCategory(category),
  });
  const options = (query.data ?? []).map((option) => ({ value: option.value, label: option.label }));
  return options.length > 0 ? options : (FALLBACK_OPTIONS[category] ?? []);
}

export function emptyForm(fields: FieldConfig[]) {
  return fields.reduce<Record<string, string | boolean>>((acc, field) => {
    acc[field.name] = field.type === 'checkbox' ? false : '';
    return acc;
  }, {});
}

export function cleanPayload(form: Record<string, string | boolean>, fields: FieldConfig[]) {
  return fields.reduce<Record<string, string | number | boolean | null>>((acc, field) => {
    const value = form[field.name];
    if (field.type === 'checkbox') {
      acc[field.name] = Boolean(value);
      return acc;
    }
    if (field.readOnly) return acc;
    const text = String(value ?? '').trim();
    if (!text && !field.required) return acc;
    acc[field.name] = field.type === 'number' ? Number(text || 0) : text;
    return acc;
  }, {});
}

export function numberValue(value: number | string | boolean | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCalculatedAmount(value: number) {
  return value.toFixed(2);
}
