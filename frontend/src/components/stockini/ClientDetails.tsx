'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { Customer, DropdownOption } from '@/lib/stockini/types';

type CustomerType = Customer['type'];

interface ClientFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  type: CustomerType;
  creditBalance: string;
}

interface ClientDetailsProps {
  client: Customer;
  onClose: () => void;
  onSave: (updatedClient: Partial<Customer>) => Promise<void> | void;
  saving?: boolean;
}

const CUSTOMER_TYPES: Array<{ value: CustomerType; label: string }> = [
  { value: 'INDIVIDUAL', label: 'Particulier' },
  { value: 'COMPANY', label: 'Entreprise' },
  { value: 'GARAGE', label: 'Garage' },
];

function formatAmount(value: number | string): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '0,00';
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getInitialFormData(client: Customer): ClientFormData {
  return {
    name: client.name,
    phone: client.phone ?? '',
    email: client.email ?? '',
    address: client.address ?? '',
    type: client.type,
    creditBalance: String(client.creditBalance ?? 0),
  };
}

export function ClientDetails({ client, onClose, onSave, saving = false }: ClientDetailsProps) {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>(() => getInitialFormData(client));
  const customerTypes = useQuery({
    queryKey: ['stockini-dropdown-options', 'customer_types'],
    queryFn: () => api.get<DropdownOption[]>('/settings/dropdown-options/customer_types').then((r) => r.data),
  });
  const typeOptions = customerTypes.data?.length
    ? customerTypes.data.map((option) => ({ value: option.value as CustomerType, label: option.label }))
    : CUSTOMER_TYPES;

  useEffect(() => {
    setEditMode(false);
    setFormData(getInitialFormData(client));
  }, [client]);

  const handleCancel = () => {
    setFormData(getInitialFormData(client));
    setEditMode(false);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({
      name: formData.name.trim(),
      phone: formData.phone.trim() || null,
      email: formData.email.trim() || null,
      address: formData.address.trim() || null,
      type: formData.type,
      creditBalance: Number(formData.creditBalance) || 0,
    });
    setEditMode(false);
  };

  return (
    <section className="rounded-lg border border-border/70 bg-white shadow-sm transition-all duration-200">
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Détails client</h2>
          <p className="font-mono text-sm text-text-muted">{client.reference}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editMode && (
            <Button type="button" size="sm" onClick={() => setEditMode(true)}>
              <Pencil size={16} />
              Modifier
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            <ArrowLeft size={14} />
            Retour
          </Button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="client-detail-name">Nom</Label>
            <Input
              id="client-detail-name"
              value={formData.name}
              disabled={!editMode || saving}
              onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-detail-phone">Téléphone</Label>
            <Input
              id="client-detail-phone"
              value={formData.phone}
              disabled={!editMode || saving}
              onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value }))}
              placeholder="-"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-detail-email">Email</Label>
            <Input
              id="client-detail-email"
              type="email"
              value={formData.email}
              disabled={!editMode || saving}
              onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
              placeholder="-"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-detail-type">Type</Label>
            <select
              id="client-detail-type"
              value={formData.type}
              disabled={!editMode || saving}
              onChange={(event) => setFormData((current) => ({ ...current, type: event.target.value as CustomerType }))}
              className="app-select"
            >
              {typeOptions.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="client-detail-address">Adresse</Label>
            <Input
              id="client-detail-address"
              value={formData.address}
              disabled={!editMode || saving}
              onChange={(event) => setFormData((current) => ({ ...current, address: event.target.value }))}
              placeholder="-"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-detail-credit">Solde crédit</Label>
            <Input
              id="client-detail-credit"
              type={editMode ? 'number' : 'text'}
              min="0"
              step="0.01"
              value={editMode ? formData.creditBalance : `${formatAmount(formData.creditBalance)} DA`}
              disabled={!editMode || saving}
              onChange={(event) => setFormData((current) => ({ ...current, creditBalance: event.target.value }))}
            />
          </div>
        </div>

        {editMode && (
          <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || !formData.name.trim()}>
              <Check size={14} />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
