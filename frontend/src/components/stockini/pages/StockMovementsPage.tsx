'use client';

import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, RotateCcw } from 'lucide-react';
import { Can } from '@/components/shared/Can';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef, type FilterConfig } from '@/components/ui/DataTable';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { StockMovement, StockMovementsQueryParams } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { cleanPayload, emptyForm, useDropdownOptions } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';

// ─── Reset Inventory Modal ─────────────────────────────────────────────────────

interface ResetModalProps {
  onClose: () => void;
  onConfirm: (adminPassword: string) => void;
  isPending: boolean;
}

function ResetInventoryModal({ onClose, onConfirm, isPending }: ResetModalProps) {
  const [password, setPassword]       = useState('');
  const [confirmText, setConfirmText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isValid = confirmText === 'RESET STOCK' && password.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    onConfirm(password);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border p-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-text-primary">Remise à zéro du stock</h2>
            <p className="mt-0.5 text-[12px] text-text-secondary">Action irréversible — administrateur requis</p>
          </div>
        </div>
        <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-[12px] font-medium text-red-700">
            Cette action va remettre <strong>tous les stocks à 0</strong>. Action irréversible.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-text-primary">Mot de passe administrateur</label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-text-primary">
              Tapez <code className="rounded bg-red-100 px-1 text-red-700">RESET STOCK</code> pour confirmer
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET STOCK"
              className="h-9 w-full rounded-md border border-border bg-white px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40"
              autoComplete="off"
              spellCheck={false}
            />
            {confirmText.length > 0 && confirmText !== 'RESET STOCK' && (
              <p className="text-[11px] text-red-500">Le texte ne correspond pas.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={isPending}
              className="h-9 rounded-md border border-border bg-white px-4 text-[12px] font-medium text-text-secondary hover:bg-muted disabled:opacity-50">
              Annuler
            </button>
            <button type="submit" disabled={!isValid || isPending}
              className="h-9 rounded-md bg-red-600 px-4 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-40">
              {isPending ? 'En cours…' : 'Confirmer la remise à zéro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Movement type sign ────────────────────────────────────────────────────────

const MOVEMENT_TYPE_SIGN: Record<string, boolean> = {
  ENTRY: true,
  PURCHASE_RECEPTION: true,
  CUSTOMER_RETURN: true,
  EXIT: false,
  SALE: false,
  SUPPLIER_RETURN: false,
};

// ─── Columns ───────────────────────────────────────────────────────────────────

type MovementRow = StockMovement & { user?: { fullName: string } };

const COLUMNS: ColumnDef<MovementRow>[] = [
  {
    key: 'date',
    label: 'Date',
    sortable: true,
    render: (row) => (
      <span className="whitespace-nowrap text-text-secondary">{dateTime(row.createdAt)}</span>
    ),
  },
  {
    key: 'user',
    label: 'Utilisateur',
    render: (row) => <span className="text-text-secondary">{row.user?.fullName ?? '-'}</span>,
  },
  {
    key: 'reference',
    label: 'Référence',
    render: (row) => <span className="font-mono text-text-secondary">{row.reference ?? '-'}</span>,
  },
  {
    key: 'product',
    label: 'Produit',
    render: (row) => <span className="font-medium">{row.product?.name ?? '-'}</span>,
  },
  {
    key: 'type',
    label: 'Type',
    sortable: true,
    render: (row) => {
      const positive = MOVEMENT_TYPE_SIGN[row.type] ?? true;
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {statusLabel(row.type)}
        </span>
      );
    },
  },
  {
    key: 'quantity',
    label: 'Quantité',
    sortable: true,
    className: 'text-right',
    render: (row) => {
      const positive = MOVEMENT_TYPE_SIGN[row.type] ?? true;
      return (
        <span className={`font-mono font-semibold ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
          {positive ? '+' : '-'}{row.quantity}
        </span>
      );
    },
  },
  {
    key: 'previousQuantity',
    label: 'Stock avant',
    sortable: true,
    className: 'text-right',
    render: (row) => <span className="font-mono text-text-secondary">{row.previousQuantity}</span>,
  },
  {
    key: 'newQuantity',
    label: 'Stock après',
    sortable: true,
    className: 'text-right',
    render: (row) => <span className="font-mono font-semibold">{row.newQuantity}</span>,
  },
  {
    key: 'reason',
    label: 'Motif',
    render: (row) => <span className="text-text-secondary">{row.reason ?? '-'}</span>,
  },
];

const FILTERS: FilterConfig[] = [
  {
    key: 'type',
    label: 'Type',
    type: 'select',
    options: [
      { value: '', label: 'Tous les types' },
      { value: 'ENTRY', label: 'Entrée stock' },
      { value: 'EXIT', label: 'Sortie stock' },
      { value: 'SALE', label: 'Vente' },
      { value: 'PURCHASE_RECEPTION', label: 'Achat / Réception' },
      { value: 'ADJUSTMENT', label: 'Correction' },
      { value: 'INVENTORY_CORRECTION', label: 'Correction inventaire' },
      { value: 'CUSTOMER_RETURN', label: 'Annulation (retour client)' },
      { value: 'SUPPLIER_RETURN', label: 'Retour fournisseur' },
    ],
  },
  { key: 'dateFrom', label: 'Date début', type: 'date' },
  { key: 'dateTo', label: 'Date fin', type: 'date' },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export function StockMovementsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const [modalOpen, setModalOpen]         = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Pagination + filters state
  const [page, setPage]           = useState(1);
  const [limit, setLimit]         = useState(5);
  const [search, setSearch]       = useState('');
  const [sortBy, setSortBy]       = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    type: '',
    dateFrom: '',
    dateTo: '',
  });

  const queryParams: StockMovementsQueryParams = {
    page,
    limit,
    search: search || undefined,
    type: filterValues.type || undefined,
    dateFrom: filterValues.dateFrom || undefined,
    dateTo: filterValues.dateTo || undefined,
    sortBy,
    sortOrder,
  };

  const query = useQuery({
    queryKey: ['stockini-stock-movements', page, limit, search, filterValues, sortBy, sortOrder],
    queryFn: () => stockiniApi.movements(queryParams),
    placeholderData: (prev) => prev,
  });

  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const operationOptions = useDropdownOptions('stock_operation_types');
  const reasonOptions    = useDropdownOptions('stock_movement_reasons');

  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'Référence', readOnly: true },
    { name: 'movementKind', label: 'Opération', type: 'select', required: true, options: operationOptions },
    { name: 'productId', label: 'Produit', type: 'select', required: true, options: (products.data ?? []).map((p) => ({ value: p.id, label: p.name })) },
    { name: 'quantity', label: 'Quantité / nouveau stock', type: 'number', required: true },
    { name: 'reason', label: 'Motif', type: 'select', options: reasonOptions },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));

  const resetMutation = useMutation({
    mutationFn: (adminPassword: string) =>
      stockiniApi.resetInventory({ adminPassword, confirmationText: 'RESET STOCK' }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['stockini-stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setResetModalOpen(false);
      toast.success(result.message);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erreur lors de la remise à zéro');
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const payload = cleanPayload(form, fields);
      const common = {
        productId: String(payload.productId),
        reason: payload.reason ? String(payload.reason) : undefined,
      };
      if (payload.movementKind === 'ADJUSTMENT') {
        return stockiniApi.stockAdjustment({ ...common, newQuantity: Number(payload.quantity) });
      }
      if (payload.movementKind === 'EXIT') {
        return stockiniApi.stockExit({ ...common, quantity: Number(payload.quantity) });
      }
      return stockiniApi.stockEntry({ ...common, quantity: Number(payload.quantity) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      setForm(emptyForm(fields));
      toast.success('Mouvement stock enregistré');
    },
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleSortChange = (col: string, order: 'asc' | 'desc') => {
    setSortBy(col);
    setSortOrder(order);
    setPage(1);
  };

  const data = query.data?.data ?? [];
  const total      = query.data?.total ?? 0;
  const totalPages = query.data?.totalPages ?? 1;

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Stock" subtitle="Historique des entrées, sorties, corrections et réceptions." />
        <div className="flex items-center gap-2">
          <Can permission="stock.reset">
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 text-[12px] font-medium text-red-600 hover:bg-red-100"
              title="Inventaire — Remise à zéro stock"
            >
              <RotateCcw size={13} />
              Remise à zéro
            </button>
          </Can>
          <Can permission="stock.adjust">
            <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
              <Plus size={14} />
              Mouvement
            </Button>
          </Can>
        </div>
      </div>

      <DataTable<MovementRow>
        columns={COLUMNS}
        data={data as MovementRow[]}
        total={total}
        page={page}
        limit={limit}
        totalPages={totalPages}
        loading={query.isFetching}
        filters={FILTERS}
        filterValues={filterValues}
        searchPlaceholder="Rechercher (produit, référence, utilisateur, motif…)"
        searchValue={search}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
        onSearchChange={(s) => { setSearch(s); setPage(1); }}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
        rowKey={(row) => row.id}
        emptyMessage="Aucun mouvement stock trouvé."
      />

      {modalOpen && can('stock.adjust') && (
        <CrudModal
          title="Nouveau mouvement stock"
          fields={fields}
          form={form}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onClose={() => setModalOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          saving={createMutation.isPending}
        />
      )}

      {resetModalOpen && can('stock.reset') && (
        <ResetInventoryModal
          onClose={() => setResetModalOpen(false)}
          onConfirm={(adminPassword) => resetMutation.mutate(adminPassword)}
          isPending={resetMutation.isPending}
        />
      )}
    </>
  );
}
