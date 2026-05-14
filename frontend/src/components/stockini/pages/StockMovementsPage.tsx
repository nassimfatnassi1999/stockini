'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, statusLabel } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { StockMovement } from '@/lib/stockini/types';
import { CrudModal } from '../shared/CrudModal';
import { PageHeader } from '../shared/PageHeader';
import { cleanPayload, emptyForm, useDropdownOptions } from '../shared/form-utils';
import type { FieldConfig } from '../shared/form-utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';

const MOVEMENT_TYPE_OPTIONS = [
  { value: '', label: 'Tous les types' },
  { value: 'ENTRY', label: 'Entrée stock' },
  { value: 'EXIT', label: 'Sortie stock' },
  { value: 'SALE', label: 'Vente' },
  { value: 'PURCHASE_RECEPTION', label: 'Achat / Réception' },
  { value: 'ADJUSTMENT', label: 'Correction' },
  { value: 'INVENTORY_CORRECTION', label: 'Correction inventaire' },
  { value: 'CUSTOMER_RETURN', label: 'Annulation (retour client)' },
  { value: 'SUPPLIER_RETURN', label: 'Retour fournisseur' },
  { value: 'TRANSFER', label: 'Transfert' },
];

const MOVEMENT_TYPE_SIGN: Record<string, boolean> = {
  ENTRY: true,
  PURCHASE_RECEPTION: true,
  CUSTOMER_RETURN: true,
  EXIT: false,
  SALE: false,
  SUPPLIER_RETURN: false,
};

type Filters = {
  globalSearch: string;
  type: string;
  product: string;
  user: string;
  reference: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: Filters = {
  globalSearch: '',
  type: '',
  product: '',
  user: '',
  reference: '',
  dateFrom: '',
  dateTo: '',
};

function countActiveFilters(f: Filters): number {
  return Object.values(f).filter((v) => v !== '').length;
}

export function StockMovementsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const products = useQuery({ queryKey: ['stockini-products'], queryFn: () => stockiniApi.products() });
  const operationOptions = useDropdownOptions('stock_operation_types');
  const reasonOptions = useDropdownOptions('stock_movement_reasons');
  const fields: FieldConfig[] = [
    { name: 'referencePreview', label: 'Référence', readOnly: true },
    { name: 'movementKind', label: 'Opération', type: 'select', required: true, options: operationOptions },
    { name: 'productId', label: 'Produit', type: 'select', required: true, options: (products.data ?? []).map((item) => ({ value: item.id, label: item.name })) },
    { name: 'quantity', label: 'Quantité / nouveau stock', type: 'number', required: true },
    { name: 'reason', label: 'Motif', type: 'select', options: reasonOptions },
  ];
  const [form, setForm] = useState<Record<string, string | boolean>>(emptyForm(fields));
  const query = useQuery({ queryKey: ['stockini-movements'], queryFn: stockiniApi.movements });

  const allData: StockMovement[] = query.data ?? [];

  const filteredData = useMemo(() => {
    return allData.filter((m: StockMovement & { user?: { fullName: string } }) => {
      if (filters.type && m.type !== filters.type) return false;

      if (filters.dateFrom || filters.dateTo) {
        const movDate = new Date(m.createdAt);
        if (filters.dateFrom) {
          const from = new Date(filters.dateFrom);
          from.setHours(0, 0, 0, 0);
          if (movDate < from) return false;
        }
        if (filters.dateTo) {
          const to = new Date(filters.dateTo);
          to.setHours(23, 59, 59, 999);
          if (movDate > to) return false;
        }
      }

      if (filters.product && !m.product?.name?.toLowerCase().includes(filters.product.toLowerCase())) return false;
      if (filters.user && !(m as StockMovement & { user?: { fullName: string } }).user?.fullName?.toLowerCase().includes(filters.user.toLowerCase())) return false;
      if (filters.reference && !(m.reference ?? '').toLowerCase().includes(filters.reference.toLowerCase())) return false;

      if (filters.globalSearch) {
        const q = filters.globalSearch.toLowerCase();
        const haystack = [
          dateTime(m.createdAt),
          (m as StockMovement & { user?: { fullName: string } }).user?.fullName ?? '',
          m.reference ?? '',
          m.product?.name ?? '',
          statusLabel(m.type),
          String(m.quantity),
          String(m.previousQuantity ?? ''),
          String(m.newQuantity ?? ''),
          m.reason ?? '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [allData, filters]);

  const activeCount = countActiveFilters(filters);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

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
      queryClient.invalidateQueries({ queryKey: ['stockini-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      setForm(emptyForm(fields));
      toast.success('Mouvement stock enregistré');
    },
  });

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader title="Stock" subtitle="Historique des entrées, sorties, corrections et réceptions." />
        <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} />
          Mouvement
        </Button>
      </div>

      <Card className="shadow-card">
        {/* ── Barre principale de recherche et filtres ── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          {/* Recherche globale */}
          <input
            type="text"
            placeholder="Rechercher dans tout l'historique (produit, ref, utilisateur, motif…)"
            value={filters.globalSearch}
            onChange={(e) => setFilter('globalSearch', e.target.value)}
            className="h-8 min-w-[280px] flex-1 rounded-md border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

          {/* Bouton filtre avancé (petit) */}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`relative inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors ${
              activeCount > 0 || filtersOpen
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border bg-white text-text-muted hover:bg-muted'
            }`}
          >
            <Filter size={12} />
            Filtres
            {activeCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {activeCount}
              </span>
            )}
            {filtersOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {/* Compteur */}
          <span className="ml-auto whitespace-nowrap text-xs text-text-muted">
            {filteredData.length} mouvement(s)
          </span>
        </div>

        {/* ── Panel filtres avancés ── */}
        {filtersOpen && (
          <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/30 px-4 py-3">
            {/* Type */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted">Type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilter('type', e.target.value)}
                className="app-select h-8 min-w-[160px] text-xs"
              >
                {MOVEMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Produit */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted">Produit</label>
              <input
                type="text"
                placeholder="Nom du produit"
                value={filters.product}
                onChange={(e) => setFilter('product', e.target.value)}
                className="h-8 w-36 rounded-md border border-border bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Utilisateur */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted">Utilisateur</label>
              <input
                type="text"
                placeholder="Nom utilisateur"
                value={filters.user}
                onChange={(e) => setFilter('user', e.target.value)}
                className="h-8 w-36 rounded-md border border-border bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Référence */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted">Référence</label>
              <input
                type="text"
                placeholder="Réf. document"
                value={filters.reference}
                onChange={(e) => setFilter('reference', e.target.value)}
                className="h-8 w-32 rounded-md border border-border bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Date début */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted">Date début</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilter('dateFrom', e.target.value)}
                className="h-8 rounded-md border border-border bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Date fin */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted">Date fin</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilter('dateTo', e.target.value)}
                className="h-8 rounded-md border border-border bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Reset */}
            {activeCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-3 text-xs text-text-muted transition-colors hover:border-red-300 hover:text-red-600"
              >
                <X size={11} />
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {/* ── Tableau ── */}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Référence</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
                <TableHead className="text-right">Stock avant</TableHead>
                <TableHead className="text-right">Stock après</TableHead>
                <TableHead>Motif</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-text-secondary">Chargement...</TableCell>
                </TableRow>
              )}
              {query.error && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-red-600">Impossible de charger les données.</TableCell>
                </TableRow>
              )}
              {!query.isLoading && !query.error && filteredData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-text-secondary">Aucun mouvement trouvé.</TableCell>
                </TableRow>
              )}
              {filteredData.map((movement: StockMovement & { user?: { fullName: string } }) => {
                const isPositive = MOVEMENT_TYPE_SIGN[movement.type] ?? true;
                return (
                  <TableRow key={movement.id}>
                    <TableCell className="whitespace-nowrap text-text-secondary">{dateTime(movement.createdAt)}</TableCell>
                    <TableCell className="text-text-secondary">{movement.user?.fullName ?? '-'}</TableCell>
                    <TableCell className="font-mono text-text-secondary">{movement.reference ?? '-'}</TableCell>
                    <TableCell className="font-medium">{movement.product?.name ?? '-'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {statusLabel(movement.type)}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : '-'}{movement.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-text-secondary">{movement.previousQuantity}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{movement.newQuantity}</TableCell>
                    <TableCell className="text-text-secondary">{movement.reason ?? '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {modalOpen && (
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
    </>
  );
}
