'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlideOver } from '@/components/ui/SlideOver';
import { ModalFormGrid, fullSpan } from '@/components/shared/ModalForm';
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
  const formId = useId();

  const footer = (
    <>
      <Button type="button" variant="outline" onClick={onClose}>
        Annuler
      </Button>
      <Button type="submit" form={formId} disabled={saving}>
        <Check size={14} />
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </>
  );

  return (
    <SlideOver title={title} open={true} onClose={onClose} width={520} footer={footer}>
      <form id={formId} onSubmit={onSubmit}>
        <ModalFormGrid>
          {fields.map((field) => (
            <div
              key={field.name}
              style={field.span === 'full' ? fullSpan : field.span === 2 ? { gridColumn: 'span 2' } : undefined}
              className={field.type === 'checkbox' ? 'flex items-center gap-2 self-end py-2' : 'space-y-1.5'}
            >
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
                  <Label htmlFor={`field-${field.name}`}>
                    {field.label}{field.required ? ' *' : ''}
                  </Label>
                  {field.type === 'select' ? (
                    <select
                      id={`field-${field.name}`}
                      value={String(form[field.name] ?? '')}
                      onChange={(event) => onChange(field.name, event.target.value)}
                      required={field.required}
                      className="app-select"
                    >
                      <option value="">Sélectionner</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
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
        </ModalFormGrid>
      </form>
    </SlideOver>
  );
}
