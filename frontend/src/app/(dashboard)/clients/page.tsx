'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Plus, Trash2, X } from 'lucide-react';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
import type { Customer, DropdownOption } from '@/lib/stockini/types';

const CUSTOMER_TYPES = [
  { value: 'INDIVIDUAL', label: 'Passager' },
  { value: 'GARAGE', label: 'Garage' },
  { value: 'COMPANY', label: 'Entreprise' },
] as const;

interface CreateCustomerForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  type: 'INDIVIDUAL' | 'GARAGE' | 'COMPANY';
  taxNumber: string;
}

const EMPTY_FORM: CreateCustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  type: 'INDIVIDUAL',
  taxNumber: '',
};

function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '0,00';
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function typeLabel(type: string): string {
  return CUSTOMER_TYPES.find((t) => t.value === type)?.label ?? type;
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateCustomerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const refFetchController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!showModal) {
      setRefPreview(null);
      return;
    }
    refFetchController.current?.abort();
    const controller = new AbortController();
    refFetchController.current = controller;
    api
      .get<{ reference: string }>('/customers/next-reference', {
        params: { type: form.type },
        signal: controller.signal,
      })
      .then((r) => setRefPreview(r.data.reference))
      .catch(() => {});
    return () => controller.abort();
  // Re-fetch whenever the modal opens or the type changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, form.type]);

  const customersQuery = useQuery<Customer[]>({
    queryKey: ['customers', search],
    queryFn: () =>
      api
        .get<Customer[]>('/customers', { params: search.trim() ? { search: search.trim() } : undefined })
        .then((r) => r.data),
    placeholderData: (prev) => prev,
  });
  const customerTypesQuery = useQuery<DropdownOption[]>({
    queryKey: ['stockini-dropdown-options', 'customer_types'],
    queryFn: () => api.get<DropdownOption[]>('/settings/dropdown-options/customer_types').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<CreateCustomerForm>) => api.post<Customer>('/customers', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Client créé avec succès');
      setShowModal(false);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
    onError: () => {
      toast.error('Échec de la création du client');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`).then((r) => r.data),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Customer[]>(['customers'], (prev) =>
        prev ? prev.filter((c) => c.id !== id) : prev,
      );
      toast.success('Client supprimé avec succès');
      setTrashTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la suppression');
      setTrashTarget(null);
    },
  });

  const customers = customersQuery.data ?? [];
  const customerTypeOptions = customerTypesQuery.data?.length
    ? customerTypesQuery.data.map((option) => ({ value: option.value, label: option.label }))
    : CUSTOMER_TYPES;
  const getTypeLabel = (type: string) => customerTypeOptions.find((option) => option.value === type)?.label ?? typeLabel(type);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Le nom est obligatoire');
      return;
    }
    setFormError(null);
    const payload: Partial<CreateCustomerForm> = {
      name: form.name.trim(),
      type: form.type,
      ...(form.phone.trim() && { phone: form.phone.trim() }),
      ...(form.email.trim() && { email: form.email.trim() }),
      ...(form.address.trim() && { address: form.address.trim() }),
      ...(form.taxNumber.trim() && { taxNumber: form.taxNumber.trim() }),
    };
    createMutation.mutate(payload);
  };

  const closeModal = () => {
    setShowModal(false);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="app-page-title">Clients</h1>
          <p className="app-page-subtitle">
            {customers.length} client{customers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowModal(true)}
          className="gap-1.5"
        >
          <Plus size={14} />
          Nouveau client
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, téléphone, email…"
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg overflow-hidden border border-border/70 bg-white">
        {customersQuery.isLoading ? (
          <div className="px-4 py-12 text-center text-sm text-text-muted">Chargement…</div>
        ) : customersQuery.isError ? (
          <div className="px-4 py-12 text-center text-sm text-red-600">
            Erreur lors du chargement des clients
          </div>
        ) : customers.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-text-muted">
            {search ? 'Aucun client trouvé pour cette recherche' : 'Aucun client enregistré'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Nom
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Référence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Téléphone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Adresse
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Solde crédit
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {customers.map((customer) => (
                  <tr key={customer.id} className="h-12 transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/clients/${customer.id}`}
                        className="text-left font-medium text-primary underline-offset-4 transition-colors hover:text-primary-dark hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-text-secondary">{customer.reference}</td>
                    <td className="px-4 py-3">
                      <span className="app-status-badge border-slate-200 bg-slate-50 text-slate-700">
                        {getTypeLabel(customer.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{customer.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-text-secondary">{customer.email ?? '—'}</td>
                    <td className="px-4 py-3 text-text-secondary max-w-[200px] truncate">
                      {customer.address ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                      {formatCurrency(customer.creditBalance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label={`Supprimer ${customer.name}`}
                        onClick={() => setTrashTarget({ id: customer.id, name: customer.name })}
                        className="app-action-button app-action-delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {trashTarget && (
        <PermanentDeleteDialog
          label={trashTarget.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(trashTarget.id)}
          onCancel={() => setTrashTarget(null)}
        />
      )}

      {/* Create Customer Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 id="modal-title" className="text-base font-semibold text-text-primary">
                Nouveau client
              </h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={closeModal}
                className="app-action-button h-8 w-8"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
              {formError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {formError}
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="customer-reference">Référence</Label>
                <input
                  id="customer-reference"
                  type="text"
                  readOnly
                  value={refPreview ?? ''}
                  placeholder={refPreview === null ? 'Calcul en cours…' : ''}
                  className="flex h-9 w-full rounded-md border border-input bg-muted/40 px-3 py-1 text-sm font-mono text-text-secondary shadow-sm cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-name">
                  Nom <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="customer-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nom du client"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-type">Type</Label>
                <select
                  id="customer-type"
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      type: e.target.value as CreateCustomerForm['type'],
                    }))
                  }
                  className="app-select"
                >
                  {customerTypeOptions.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="customer-phone">Téléphone</Label>
                  <Input
                    id="customer-phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+213 …"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="customer-email">Email</Label>
                  <Input
                    id="customer-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="email@exemple.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-address">Adresse</Label>
                <Input
                  id="customer-address"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Adresse complète"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-tax">Matricule fiscal</Label>
                <Input
                  id="customer-tax"
                  value={form.taxNumber}
                  onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
                  placeholder="Matricule fiscal optionnel"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="gap-1.5"
                >
                  {createMutation.isPending ? 'Création…' : 'Créer le client'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
