'use client';

import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FieldConfig } from './form-utils';

export function CrudModal({
  fields,
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
  title,
}: {
  fields: FieldConfig[];
  form: Record<string, string | boolean>;
  onChange: (name: string, value: string | boolean) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-muted">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name} className={field.type === 'checkbox' ? 'flex items-center gap-2 self-end py-2' : 'space-y-1.5'}>
              {field.type === 'checkbox' ? (
                <>
                  <input
                    id={`field-${field.name}`}
                    type="checkbox"
                    checked={Boolean(form[field.name])}
                    onChange={(event) => onChange(field.name, event.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor={`field-${field.name}`}>{field.label}</Label>
                </>
              ) : (
                <>
                  <Label htmlFor={`field-${field.name}`}>{field.label}{field.required ? ' *' : ''}</Label>
                  {field.type === 'select' ? (
                    <select
                      id={`field-${field.name}`}
                      value={String(form[field.name] ?? '')}
                      onChange={(event) => onChange(field.name, event.target.value)}
                      required={field.required}
                      className="app-select"
                    >
                      <option value="">Sélectionner</option>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : (
                    <Input
                      id={`field-${field.name}`}
                      type={field.type ?? 'text'}
                      min={field.type === 'number' ? 0 : undefined}
                      step={field.type === 'number' ? '0.001' : undefined}
                      value={String(form[field.name] ?? '')}
                      placeholder={field.readOnly ? 'Générée automatiquement' : undefined}
                      onChange={(event) => onChange(field.name, event.target.value)}
                      readOnly={field.readOnly}
                      required={field.required}
                    />
                  )}
                </>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>
              <Check size={14} />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
