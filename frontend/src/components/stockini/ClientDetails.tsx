'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Lock, Pencil, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import type { Customer, DropdownOption } from '@/lib/stockini/types';

type CustomerType = Customer['type'];

interface ClientFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  type: CustomerType;
  creditBalance: string;
  debtDueDate: string;
  autoLockEnabled: boolean;
}

interface ClientDetailsProps {
  client: Customer;
  onClose: () => void;
  onSave: (updatedClient: Partial<Customer>) => Promise<void> | void;
  saving?: boolean;
}

const CUSTOMER_TYPES: Array<{ value: CustomerType; label: string }> = [
  { value: 'INDIVIDUAL', label: 'Passager' },
  { value: 'COMPANY', label: 'Entreprise' },
  { value: 'GARAGE', label: 'Garage' },
];

function formatAmount(value: number | string): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '0,00';
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function getInitialFormData(client: Customer): ClientFormData {
  return {
    name: client.name,
    phone: client.phone ?? '',
    email: client.email ?? '',
    address: client.address ?? '',
    type: client.type,
    creditBalance: String(client.creditBalance ?? 0),
    debtDueDate: isoToDateInput(client.debtDueDate),
    autoLockEnabled: client.autoLockEnabled ?? true,
  };
}

export function ClientDetails({ client, onClose, onSave, saving = false }: ClientDetailsProps) {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>(() => getInitialFormData(client));
  const [dateError, setDateError] = useState<string | null>(null);
  const [savingDebt, setSavingDebt] = useState(false);
  const { can } = usePermissions();
  const queryClient = useQueryClient();

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
    setDateError(null);
  }, [client]);

  const handleCancel = () => {
    setFormData(getInitialFormData(client));
    setEditMode(false);
    setDateError(null);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (formData.debtDueDate) {
      const parsed = new Date(formData.debtDueDate);
      if (isNaN(parsed.getTime())) {
        setDateError('Date invalide');
        return;
      }
    }
    setDateError(null);

    const isSavingDebtSettings = can('clients.update_debt_due_date');
    if (isSavingDebtSettings) setSavingDebt(true);

    try {
      await onSave({
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        type: formData.type,
        creditBalance: Number(formData.creditBalance) || 0,
      });

      if (isSavingDebtSettings) {
        await api.patch(`/customers/${client.id}/debt-settings`, {
          debtDueDate: formData.debtDueDate || null,
          autoLockEnabled: formData.autoLockEnabled,
        });
        queryClient.invalidateQueries({ queryKey: ['customer', client.id] });
        queryClient.invalidateQueries({ queryKey: ['stockini-customers-page'] });
        queryClient.invalidateQueries({ queryKey: ['stockini-customer-options'] });
      }
    } catch {
      toast.error('Erreur lors de la sauvegarde des paramètres');
    } finally {
      setSavingDebt(false);
    }

    setEditMode(false);
  };

  const isSaving = saving || savingDebt;
  const canEditDebtSettings = can('clients.update_debt_due_date');

  return (
    <section className="rounded-lg border border-border/70 bg-white shadow-sm transition-all duration-200">
      {/* Header */}
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

      <form onSubmit={handleSave} className="space-y-6 p-4">
        {/* ── Informations générales ── */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="client-detail-name">Nom</Label>
            <Input
              id="client-detail-name"
              value={formData.name}
              disabled={!editMode || isSaving}
              onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-detail-phone">Téléphone</Label>
            <Input
              id="client-detail-phone"
              value={formData.phone}
              disabled={!editMode || isSaving}
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
              disabled={!editMode || isSaving}
              onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
              placeholder="-"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-detail-type">Type</Label>
            <select
              id="client-detail-type"
              value={formData.type}
              disabled={!editMode || isSaving}
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
              disabled={!editMode || isSaving}
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
              disabled={!editMode || isSaving}
              onChange={(event) => setFormData((current) => ({ ...current, creditBalance: event.target.value }))}
            />
          </div>
        </div>

        {/* ── Verrouillage et échéance ── */}
        <div className="rounded-lg border border-border/60 bg-surface/50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">Verrouillage et échéance</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Statut verrouillage — lecture seule */}
            <div className="space-y-1.5">
              <Label>Statut verrouillage</Label>
              <div className="flex h-9 items-center">
                {client.isLocked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                    <Lock size={11} />
                    Verrouillé
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                    <Unlock size={11} />
                    Actif
                  </span>
                )}
              </div>
            </div>

            {/* Date verrouillage — lecture seule */}
            <div className="space-y-1.5">
              <Label>Date verrouillage</Label>
              <div className="flex h-9 items-center text-sm text-text-secondary">
                {formatDate(client.lockedAt)}
              </div>
            </div>

            {/* Raison verrouillage — lecture seule, pleine largeur */}
            {client.lockedReason && (
              <div className="space-y-1.5 md:col-span-2">
                <Label>Raison verrouillage</Label>
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {client.lockedReason}
                </div>
              </div>
            )}

            {/* Date d'échéance dette — éditable si permission */}
            <div className="space-y-1.5">
              <Label htmlFor="client-detail-debt-due">Date d&apos;échéance dette</Label>
              {editMode && canEditDebtSettings ? (
                <div className="space-y-1">
                  <Input
                    id="client-detail-debt-due"
                    type="date"
                    value={formData.debtDueDate}
                    disabled={isSaving}
                    onChange={(e) => {
                      setFormData((f) => ({ ...f, debtDueDate: e.target.value }));
                      setDateError(null);
                    }}
                  />
                  {dateError && (
                    <p className="text-xs text-red-600">{dateError}</p>
                  )}
                </div>
              ) : (
                <div className="flex h-9 items-center text-sm text-text-secondary">
                  {formatDate(client.debtDueDate)}
                </div>
              )}
            </div>

            {/* Auto-lock — éditable si permission */}
            <div className="space-y-1.5">
              <Label>Auto-lock si échéance dépassée</Label>
              <div className="flex h-9 items-center">
                {editMode && canEditDebtSettings ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formData.autoLockEnabled}
                      disabled={isSaving}
                      onChange={(e) => setFormData((f) => ({ ...f, autoLockEnabled: e.target.checked }))}
                      className="h-4 w-4 rounded border-input"
                    />
                    {formData.autoLockEnabled ? 'Activé' : 'Désactivé'}
                  </label>
                ) : (
                  <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    client.autoLockEnabled
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}>
                    {client.autoLockEnabled ? 'Activé' : 'Désactivé'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {editMode && (
          <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSaving || !formData.name.trim()}>
              <Check size={14} />
              {isSaving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
