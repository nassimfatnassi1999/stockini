'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Plus, Trash2, Lock, Unlock } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { ModalFormGrid, fullSpan } from '@/components/shared/ModalForm';
import { KebabMenu } from '@/components/stockini/shared/KebabMenu';
import { MoveToTrashDialog } from '@/components/stockini/MoveToTrashDialog';
import { Can } from '@/components/shared/Can';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { usePermissions } from '@/lib/hooks/usePermissions';
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
  debtDueDate: string;
  autoLockEnabled: boolean;
}

const EMPTY_FORM: CreateCustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  type: 'INDIVIDUAL',
  taxNumber: '',
  debtDueDate: '',
  autoLockEnabled: true,
};

function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '0,000 DT';
  return num.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' DT';
}

function typeLabel(type: string): string {
  return CUSTOMER_TYPES.find((t) => t.value === type)?.label ?? type;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Lock confirmation dialog ─────────────────────────────────────────────────
interface LockDialogProps {
  customer: Customer;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
}
function LockDialog({ customer, onConfirm, onCancel, isPending }: LockDialogProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-base font-semibold">Verrouiller le client</h2>
        <p className="mb-4 text-sm text-text-secondary">
          Voulez-vous verrouiller <strong>{customer.name}</strong> ? Il ne pourra plus créer de factures ou BL.
        </p>
        <div className="mb-4 space-y-1.5">
          <Label htmlFor="lock-reason">Raison (optionnelle)</Label>
          <Input
            id="lock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: impayés, litige…"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>Annuler</Button>
          <Button size="sm" variant="destructive" onClick={() => onConfirm(reason)} disabled={isPending}>
            {isPending ? 'Verrouillage…' : 'Verrouiller'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Unlock confirmation dialog ───────────────────────────────────────────────
interface UnlockDialogProps {
  customer: Customer;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}
function UnlockDialog({ customer, onConfirm, onCancel, isPending }: UnlockDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-base font-semibold">Déverrouiller le client</h2>
        <p className="mb-4 text-sm text-text-secondary">
          Voulez-vous déverrouiller <strong>{customer.name}</strong> et lui permettre de créer des factures et BL à nouveau ?
        </p>
        {customer.lockedReason && (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Raison du verrouillage : {customer.lockedReason}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>Annuler</Button>
          <Button size="sm" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Déverrouillage…' : 'Déverrouiller'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const formId = useId();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateCustomerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const [lockTarget, setLockTarget] = useState<Customer | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<Customer | null>(null);
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
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Client déplacé dans la corbeille');
      setTrashTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors du déplacement dans la corbeille');
      setTrashTarget(null);
    },
  });

  const lockMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch<Customer>(`/customers/${id}/lock`, { reason: reason || undefined }).then((r) => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData<Customer[]>(['customers', search], (prev) =>
        prev ? prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)) : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Client verrouillé');
      setLockTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors du verrouillage');
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (id: string) => api.patch<Customer>(`/customers/${id}/unlock`).then((r) => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData<Customer[]>(['customers', search], (prev) =>
        prev ? prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)) : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Client déverrouillé');
      setUnlockTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors du déverrouillage');
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
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
      autoLockEnabled: form.autoLockEnabled,
      ...(form.phone.trim() && { phone: form.phone.trim() }),
      ...(form.email.trim() && { email: form.email.trim() }),
      ...(form.address.trim() && { address: form.address.trim() }),
      ...(form.taxNumber.trim() && { taxNumber: form.taxNumber.trim() }),
      ...(form.debtDueDate.trim() && { debtDueDate: form.debtDueDate.trim() }),
    };
    createMutation.mutate(payload as Partial<CreateCustomerForm>);
  };

  const closeModal = () => {
    setShowModal(false);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  return (
    <PermissionGuard permission="clients.view">
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="app-page-title">Clients</h1>
          <p className="app-page-subtitle">
            {customers.length} client{customers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Can permission="clients.create">
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
            className="gap-1.5"
          >
            <Plus size={14} />
            Nouveau client
          </Button>
        </Can>
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
                    Statut
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
                    Dettes
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
                    <td className="px-4 py-3">
                      {customer.isLocked ? (
                        <span
                          className="app-status-badge border-red-200 bg-red-50 text-red-700 inline-flex items-center gap-1"
                          title={[
                            customer.lockedReason,
                            customer.lockedAt ? `le ${formatDate(customer.lockedAt)}` : null,
                          ].filter(Boolean).join(' — ')}
                        >
                          <Lock size={10} />
                          Verrouillé
                        </span>
                      ) : (
                        <span className="app-status-badge border-green-200 bg-green-50 text-green-700">
                          Actif
                        </span>
                      )}
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
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(() => {
                        const debt = customer.debtAmount ?? 0;
                        if (debt > 0) {
                          return (
                            <span className="inline-flex items-center rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                              {formatCurrency(debt)}
                            </span>
                          );
                        }
                        return <span className="text-text-muted">{formatCurrency(0)}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <KebabMenu
                        items={[
                          {
                            label: 'Verrouiller',
                            icon: <Lock size={14} />,
                            onClick: () => setLockTarget(customer),
                            hidden: !can('clients.lock') || !!customer.isLocked,
                          },
                          {
                            label: 'Déverrouiller',
                            icon: <Unlock size={14} />,
                            onClick: () => setUnlockTarget(customer),
                            hidden: !can('clients.unlock') || !customer.isLocked,
                          },
                          {
                            divider: true,
                            hidden: !can('clients.lock') && !can('clients.unlock'),
                          },
                          {
                            label: 'Supprimer',
                            icon: <Trash2 size={14} />,
                            onClick: () => setTrashTarget({ id: customer.id, name: customer.name }),
                            variant: 'destructive',
                            hidden: !can('clients.delete'),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {trashTarget && (
        <MoveToTrashDialog
          label={trashTarget.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(trashTarget.id)}
          onCancel={() => setTrashTarget(null)}
        />
      )}

      {lockTarget && (
        <LockDialog
          customer={lockTarget}
          isPending={lockMutation.isPending}
          onConfirm={(reason) => lockMutation.mutate({ id: lockTarget.id, reason })}
          onCancel={() => setLockTarget(null)}
        />
      )}

      {unlockTarget && (
        <UnlockDialog
          customer={unlockTarget}
          isPending={unlockMutation.isPending}
          onConfirm={() => unlockMutation.mutate(unlockTarget.id)}
          onCancel={() => setUnlockTarget(null)}
        />
      )}

      {/* Create Customer Modal */}
      <SlideOver
        title="Nouveau client"
        open={showModal}
        onClose={closeModal}
        width={480}
        footer={
          <>
            <Button type="button" variant="outline" size="sm" onClick={closeModal}>
              Annuler
            </Button>
            <Button type="submit" form={formId} size="sm" disabled={createMutation.isPending} className="gap-1.5">
              {createMutation.isPending ? 'Création…' : 'Créer le client'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit}>
          {formError && (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {formError}
            </p>
          )}
          <ModalFormGrid>
            {/* Référence — pleine largeur */}
            <div className="space-y-1.5" style={fullSpan}>
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

            {/* Nom — pleine largeur */}
            <div className="space-y-1.5" style={fullSpan}>
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

            {/* Type */}
            <div className="space-y-1.5">
              <Label htmlFor="customer-type">Type</Label>
              <select
                id="customer-type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CreateCustomerForm['type'] }))}
                className="app-select"
              >
                {customerTypeOptions.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Téléphone */}
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">Téléphone</Label>
              <Input
                id="customer-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+216 …"
              />
            </div>

            {/* Email */}
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

            {/* Adresse — pleine largeur */}
            <div className="space-y-1.5" style={fullSpan}>
              <Label htmlFor="customer-address">Adresse</Label>
              <Input
                id="customer-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Adresse complète"
              />
            </div>

            {/* Matricule fiscal — pleine largeur */}
            <div className="space-y-1.5" style={fullSpan}>
              <Label htmlFor="customer-tax">Matricule fiscal</Label>
              <Input
                id="customer-tax"
                value={form.taxNumber}
                onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
                placeholder="Matricule fiscal optionnel"
              />
            </div>

            {/* Date d'échéance dette */}
            <div className="space-y-1.5">
              <Label htmlFor="customer-debt-due">Date d&apos;échéance dette</Label>
              <Input
                id="customer-debt-due"
                type="date"
                value={form.debtDueDate}
                onChange={(e) => setForm((f) => ({ ...f, debtDueDate: e.target.value }))}
              />
            </div>

            {/* Auto-lock */}
            <div className="flex items-center gap-2 self-end pb-1.5">
              <input
                id="customer-auto-lock"
                type="checkbox"
                checked={form.autoLockEnabled}
                onChange={(e) => setForm((f) => ({ ...f, autoLockEnabled: e.target.checked }))}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="customer-auto-lock" className="cursor-pointer">
                Auto-lock si échéance dépassée
              </Label>
            </div>
          </ModalFormGrid>
        </form>
      </SlideOver>
    </div>
    </PermissionGuard>
  );
}
