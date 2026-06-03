'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { ModalFormGrid } from '@/components/shared/ModalForm';
import { MoveToTrashDialog } from '@/components/stockini/MoveToTrashDialog';
import { Can } from '@/components/shared/Can';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { stockiniApi, type ProductsQueryParams } from '@/lib/stockini/api';
import { dateTime, money } from '@/lib/stockini/format';
import { calcPurchasePriceTtc, calcSalePrice, roundPrice } from '@/lib/stockini/pricing';
import { toast } from '@/lib/toast';
import type { Product } from '@/lib/stockini/types';
import { PageHeader } from '../shared/PageHeader';
import { RowActions } from '../shared/RowActions';
import { SearchBox } from '../shared/SearchBox';
import { StateRows } from '../shared/StateRows';
import { StockBadge } from '../shared/StockBadge';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ProductFormState {
  reference: string;
  name: string;
  categoryId: string;
  brandId: string;
  supplierId: string;
  tva: string;
  purchasePrice: string;
  quantity: string;
  minStock: string;
  location: string;
}

type ActiveFilters = Omit<ProductsQueryParams, 'search'>;

// ─── Constants ─────────────────────────────────────────────────────────────

const EMPTY_PRODUCT_FORM: ProductFormState = {
  reference: '',
  name: '',
  categoryId: '',
  brandId: '',
  supplierId: '',
  tva: '19',
  purchasePrice: '',
  quantity: '0',
  minStock: '',
  location: '',
};

const EMPTY_FILTERS: ActiveFilters = {
  categoryId: undefined,
  brandId: undefined,
  supplierId: undefined,
  status: undefined,
  stockStatus: undefined,
  purchasePriceMin: undefined,
  purchasePriceMax: undefined,
  salePriceMin: undefined,
  salePriceMax: undefined,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function productToFormState(p: Product): ProductFormState {
  return {
    reference: p.reference,
    name: p.name,
    categoryId: p.category?.id ?? '',
    brandId: p.brand?.id ?? '',
    supplierId: p.supplier?.id ?? '',
    tva: String(p.tva ?? 19),
    purchasePrice: String(p.purchasePrice ?? ''),
    quantity: String(p.quantity ?? 0),
    minStock: String(p.minStock ?? ''),
    location: p.location ?? '',
  };
}

function lastSaleTooltip(product: Product): string | undefined {
  if (product.lastSellingPrice == null) return undefined;
  return [
    product.lastSaleDocumentType
      ? `Type: ${product.lastSaleDocumentType.replace(/_/g, ' ')}`
      : null,
    product.lastSaleDocumentReference
      ? `Document: ${product.lastSaleDocumentReference}`
      : null,
    product.lastSaleDate ? `Date: ${dateTime(product.lastSaleDate)}` : null,
    product.lastSaleCustomer?.name ? `Client: ${product.lastSaleCustomer.name}` : null,
  ]
    .filter(Boolean)
    .join('\n') || undefined;
}

function countActiveFilters(f: ActiveFilters): number {
  return Object.values(f).filter((v) => v !== undefined && v !== '').length;
}

// ─── ProductModal ────────────────────────────────────────────────────────────

function ProductModal({
  mode,
  initialValues,
  categoryOptions,
  brandOptions,
  supplierOptions,
  onClose,
  onSubmit,
  saving,
}: {
  mode: 'create' | 'edit';
  initialValues?: ProductFormState;
  categoryOptions: Array<{ value: string; label: string }>;
  brandOptions: Array<{ value: string; label: string }>;
  supplierOptions: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSubmit: (form: ProductFormState) => void;
  saving: boolean;
}) {
  const formId = useId();
  const [form, setForm] = useState<ProductFormState>(initialValues ?? EMPTY_PRODUCT_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormState, string>>>({});

  const priceHt = parseFloat(form.purchasePrice) || 0;
  const tvaNum = parseFloat(form.tva) || 19;
  const priceTtc = roundPrice(calcPurchasePriceTtc(priceHt, tvaNum));
  const priceSale = roundPrice(calcSalePrice(priceHt, tvaNum));

  const set = (field: keyof ProductFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.reference.trim()) next.reference = 'La référence est obligatoire';
    if (!form.name.trim()) next.name = 'La désignation est obligatoire';
    if (!form.categoryId) next.categoryId = 'La catégorie est obligatoire';
    if (!form.brandId) next.brandId = 'La marque est obligatoire';
    if (form.purchasePrice === '' || Number(form.purchasePrice) < 0)
      next.purchasePrice = "Prix d'achat HT invalide";
    if (form.tva === '' || Number(form.tva) < 0) next.tva = 'TVA invalide';
    if (form.quantity === '' || Number(form.quantity) < 0)
      next.quantity = 'Stock actuel invalide';
    if (form.minStock === '' || Number(form.minStock) < 0)
      next.minStock = 'Seuil invalide';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  };

  const footer = (
    <>
      <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
      <Button type="submit" form={formId} disabled={saving}>
        <Check size={14} />
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </>
  );

  return (
    <SlideOver
      title={mode === 'edit' ? 'Modifier le produit' : 'Nouveau produit'}
      open={true}
      onClose={onClose}
      width={580}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit}>
        <ModalFormGrid>
          <div className="space-y-1.5">
            <Label htmlFor="pf-reference">Référence *</Label>
            <Input id="pf-reference" value={form.reference} onChange={set('reference')} placeholder="Ex: D/FREIN AV FIESTA 08" required />
            {errors.reference && <p className="text-xs text-red-600">{errors.reference}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-name">Désignation *</Label>
            <Input id="pf-name" value={form.name} onChange={set('name')} required />
            {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-category">Catégorie *</Label>
            <select id="pf-category" value={form.categoryId} onChange={set('categoryId')} required className="app-select">
              <option value="">Sélectionner</option>
              {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errors.categoryId && <p className="text-xs text-red-600">{errors.categoryId}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-brand">Marque *</Label>
            <select id="pf-brand" value={form.brandId} onChange={set('brandId')} required className="app-select">
              <option value="">Sélectionner</option>
              {brandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errors.brandId && <p className="text-xs text-red-600">{errors.brandId}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-supplier">Fournisseur</Label>
            <select id="pf-supplier" value={form.supplierId} onChange={set('supplierId')} className="app-select">
              <option value="">Sélectionner</option>
              {supplierOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-location">Emplacement</Label>
            <Input id="pf-location" value={form.location} onChange={set('location')} placeholder="Saisir un emplacement" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-tva">TVA *</Label>
            <div className="relative">
              <Input id="pf-tva" type="number" min="0" max="100" step="1" placeholder="19" value={form.tva} onChange={set('tva')} required />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">%</span>
            </div>
            {errors.tva && <p className="text-xs text-red-600">{errors.tva}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-purchase-ht">Prix d'achat HT *</Label>
            <div className="relative">
              <Input id="pf-purchase-ht" type="number" min="0" step="0.001" placeholder="0,000" value={form.purchasePrice} onChange={set('purchasePrice')} required />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">DT</span>
            </div>
            {errors.purchasePrice && <p className="text-xs text-red-600">{errors.purchasePrice}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>
              Prix d'achat TTC{' '}
              <span className="text-xs font-normal text-text-muted">(HT × (1 + TVA%))</span>
            </Label>
            <div className="relative">
              <Input type="text" readOnly tabIndex={-1} value={priceHt > 0 ? money(priceTtc) : '—'} className="bg-muted/40 cursor-not-allowed font-mono text-text-secondary" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">DT</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Prix vente HT{' '}
              <span className="text-xs font-normal text-text-muted">(Achat HT × 1,4)</span>
            </Label>
            <div className="relative">
              <Input type="text" readOnly tabIndex={-1} value={priceHt > 0 ? money(priceSale) : '—'} className="bg-primary/5 cursor-not-allowed font-mono font-semibold text-primary" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">DT</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-quantity">
              Stock actuel{mode === 'edit' ? <span className="ml-1 text-xs font-normal text-text-muted">(lecture seule)</span> : ' *'}
            </Label>
            <Input
              id="pf-quantity"
              type="number"
              min="0"
              step="1"
              value={form.quantity}
              onChange={set('quantity')}
              readOnly={mode === 'edit'}
              className={mode === 'edit' ? 'bg-muted/40 cursor-not-allowed' : ''}
              required={mode === 'create'}
            />
            {errors.quantity && <p className="text-xs text-red-600">{errors.quantity}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-min">Seuil minimum *</Label>
            <Input id="pf-min" type="number" min="0" step="1" value={form.minStock} onChange={set('minStock')} required />
            {errors.minStock && <p className="text-xs text-red-600">{errors.minStock}</p>}
          </div>
        </ModalFormGrid>
      </form>
    </SlideOver>
  );
}

// ─── AdvancedFilters ─────────────────────────────────────────────────────────

function AdvancedFilters({
  filters,
  onChange,
  onReset,
  categoryOptions,
  brandOptions,
  supplierOptions,
  loading,
}: {
  filters: ActiveFilters;
  onChange: (f: ActiveFilters) => void;
  onReset: () => void;
  categoryOptions: Array<{ value: string; label: string }>;
  brandOptions: Array<{ value: string; label: string }>;
  supplierOptions: Array<{ value: string; label: string }>;
  loading: boolean;
}) {
  const set = <K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) =>
    onChange({ ...filters, [key]: value || undefined });

  const setPriceNum = (key: keyof ActiveFilters) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange({ ...filters, [key]: val === '' ? undefined : Number(val) });
  };

  const hasAny = countActiveFilters(filters) > 0;

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3">
      {/* Grid de filtres — auto-fit pour s'adapter à toutes les largeurs */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(155px,1fr))]">
        {/* Catégorie */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Catégorie</label>
          <select
            className="app-select w-full"
            value={filters.categoryId ?? ''}
            onChange={(e) => set('categoryId', e.target.value || undefined)}
            disabled={loading}
          >
            <option value="">Toutes</option>
            {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Marque */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Marque</label>
          <select
            className="app-select w-full"
            value={filters.brandId ?? ''}
            onChange={(e) => set('brandId', e.target.value || undefined)}
            disabled={loading}
          >
            <option value="">Toutes</option>
            {brandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Fournisseur */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Fournisseur</label>
          <select
            className="app-select w-full"
            value={filters.supplierId ?? ''}
            onChange={(e) => set('supplierId', e.target.value || undefined)}
            disabled={loading}
          >
            <option value="">Tous</option>
            {supplierOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Statut produit */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Statut</label>
          <select
            className="app-select w-full"
            value={filters.status ?? ''}
            onChange={(e) => set('status', (e.target.value as 'active' | 'inactive') || undefined)}
            disabled={loading}
          >
            <option value="">Tous</option>
            <option value="active">Actif</option>
            <option value="inactive">Archivé</option>
          </select>
        </div>

        {/* Stock */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Stock</label>
          <select
            className="app-select w-full"
            value={filters.stockStatus ?? ''}
            onChange={(e) => set('stockStatus', (e.target.value as 'low' | 'out' | 'available') || undefined)}
            disabled={loading}
          >
            <option value="">Tous</option>
            <option value="available">Disponible</option>
            <option value="low">Stock bas</option>
            <option value="out">Rupture</option>
          </select>
        </div>

        {/* Prix achat min */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Achat HT min (DT)</label>
          <Input
            type="number"
            min="0"
            step="0.001"
            placeholder="0,000"
            value={filters.purchasePriceMin ?? ''}
            onChange={setPriceNum('purchasePriceMin')}
            disabled={loading}
            className="h-9 text-sm"
          />
        </div>

        {/* Prix achat max */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Achat HT max (DT)</label>
          <Input
            type="number"
            min="0"
            step="0.001"
            placeholder="∞"
            value={filters.purchasePriceMax ?? ''}
            onChange={setPriceNum('purchasePriceMax')}
            disabled={loading}
            className="h-9 text-sm"
          />
        </div>

        {/* Prix vente min */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Vente HT min (DT)</label>
          <Input
            type="number"
            min="0"
            step="0.001"
            placeholder="0,000"
            value={filters.salePriceMin ?? ''}
            onChange={setPriceNum('salePriceMin')}
            disabled={loading}
            className="h-9 text-sm"
          />
        </div>

        {/* Prix vente max */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-muted">Vente HT max (DT)</label>
          <Input
            type="number"
            min="0"
            step="0.001"
            placeholder="∞"
            value={filters.salePriceMax ?? ''}
            onChange={setPriceNum('salePriceMax')}
            disabled={loading}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* Bouton Réinitialiser compact en bas à droite */}
      {hasAny && (
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-muted hover:text-text-primary"
          >
            <X size={11} />
            Réinitialiser les filtres
          </button>
        </div>
      )}
    </div>
  );
}

// ─── FilterBadges ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  inactive: 'Archivé',
};

const STOCK_LABELS: Record<string, string> = {
  available: 'Disponible',
  low: 'Stock bas',
  out: 'Rupture',
};

function FilterBadges({
  search,
  filters,
  categoryOptions,
  brandOptions,
  supplierOptions,
  onRemoveSearch,
  onRemoveFilter,
  onReset,
}: {
  search: string;
  filters: ActiveFilters;
  categoryOptions: Array<{ value: string; label: string }>;
  brandOptions: Array<{ value: string; label: string }>;
  supplierOptions: Array<{ value: string; label: string }>;
  onRemoveSearch: () => void;
  onRemoveFilter: (key: keyof ActiveFilters) => void;
  onReset: () => void;
}) {
  const badges: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (search) {
    badges.push({ key: 'search', label: `"${search}"`, onRemove: onRemoveSearch });
  }
  if (filters.categoryId) {
    const name = categoryOptions.find((o) => o.value === filters.categoryId)?.label ?? filters.categoryId;
    badges.push({ key: 'categoryId', label: `Catégorie: ${name}`, onRemove: () => onRemoveFilter('categoryId') });
  }
  if (filters.brandId) {
    const name = brandOptions.find((o) => o.value === filters.brandId)?.label ?? filters.brandId;
    badges.push({ key: 'brandId', label: `Marque: ${name}`, onRemove: () => onRemoveFilter('brandId') });
  }
  if (filters.supplierId) {
    const name = supplierOptions.find((o) => o.value === filters.supplierId)?.label ?? filters.supplierId;
    badges.push({ key: 'supplierId', label: `Fournisseur: ${name}`, onRemove: () => onRemoveFilter('supplierId') });
  }
  if (filters.status) {
    badges.push({ key: 'status', label: `Statut: ${STATUS_LABELS[filters.status] ?? filters.status}`, onRemove: () => onRemoveFilter('status') });
  }
  if (filters.stockStatus) {
    badges.push({ key: 'stockStatus', label: `Stock: ${STOCK_LABELS[filters.stockStatus] ?? filters.stockStatus}`, onRemove: () => onRemoveFilter('stockStatus') });
  }
  if (filters.purchasePriceMin !== undefined) {
    badges.push({ key: 'purchasePriceMin', label: `Achat ≥ ${money(filters.purchasePriceMin)}`, onRemove: () => onRemoveFilter('purchasePriceMin') });
  }
  if (filters.purchasePriceMax !== undefined) {
    badges.push({ key: 'purchasePriceMax', label: `Achat ≤ ${money(filters.purchasePriceMax)}`, onRemove: () => onRemoveFilter('purchasePriceMax') });
  }
  if (filters.salePriceMin !== undefined) {
    badges.push({ key: 'salePriceMin', label: `Vente ≥ ${money(filters.salePriceMin)}`, onRemove: () => onRemoveFilter('salePriceMin') });
  }
  if (filters.salePriceMax !== undefined) {
    badges.push({ key: 'salePriceMax', label: `Vente ≤ ${money(filters.salePriceMax)}`, onRemove: () => onRemoveFilter('salePriceMax') });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 bg-muted/20">
      <span className="text-xs text-text-muted font-medium">Filtres actifs :</span>
      {badges.map((b) => (
        <span
          key={b.key}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary"
        >
          {b.label}
          <button
            type="button"
            onClick={b.onRemove}
            className="ml-0.5 rounded-full p-0.5 hover:bg-primary/15 transition-colors"
            aria-label="Supprimer ce filtre"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="ml-auto text-xs text-text-muted underline-offset-2 hover:text-text-primary hover:underline transition-colors"
      >
        Réinitialiser tous
      </button>
    </div>
  );
}

// ─── ProductsPage ────────────────────────────────────────────────────────────

export function ProductsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);

  const queryParams: ProductsQueryParams = { search: search || undefined, ...filters };

  const query = useQuery({
    queryKey: ['stockini-products', queryParams],
    queryFn: () => stockiniApi.products(queryParams),
  });
  const categories = useQuery({ queryKey: ['stockini-categories'], queryFn: stockiniApi.categories });
  const brands = useQuery({ queryKey: ['stockini-brands'], queryFn: stockiniApi.brands });
  const suppliers = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });

  const data = query.data ?? [];
  const categoryOptions = (categories.data ?? []).map((item) => ({ value: item.id, label: item.name }));
  const brandOptions = (brands.data ?? []).map((item) => ({ value: item.id, label: item.name }));
  const supplierOptions = (suppliers.data ?? []).map((item) => ({ value: item.id, label: item.name }));

  const activeFilterCount = countActiveFilters(filters) + (search ? 1 : 0);

  const handleResetAll = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
  };

  const handleRemoveFilter = (key: keyof ActiveFilters) =>
    setFilters((prev) => ({ ...prev, [key]: undefined }));

  const createMutation = useMutation({
    mutationFn: (form: ProductFormState) =>
      stockiniApi.createProduct({
        reference: form.reference.trim(),
        name: form.name.trim(),
        categoryId: form.categoryId,
        brandId: form.brandId,
        ...(form.supplierId && { supplierId: form.supplierId }),
        tva: Number(form.tva) || 19,
        purchasePrice: Number(form.purchasePrice),
        quantity: Number(form.quantity) || 0,
        minStock: Number(form.minStock),
        ...(form.location.trim() && { location: form.location.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      toast.success('Produit créé');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: ProductFormState }) =>
      stockiniApi.updateProduct(id, {
        reference: form.reference.trim(),
        name: form.name.trim(),
        categoryId: form.categoryId,
        brandId: form.brandId,
        ...(form.supplierId ? { supplierId: form.supplierId } : {}),
        tva: Number(form.tva) || 19,
        purchasePrice: Number(form.purchasePrice),
        minStock: Number(form.minStock),
        ...(form.location.trim() && { location: form.location.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setEditingProduct(null);
      toast.success('Produit modifié');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: stockiniApi.deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success('Produit déplacé dans la corbeille');
      setTrashTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors du déplacement dans la corbeille');
      setTrashTarget(null);
    },
  });

  return (
    <>
      <PageHeader title="Produits" subtitle="Catalogue connecté au backend : catégories, marques, fournisseurs et seuils." />

      <Card className="shadow-card">
        {/* ── Barre d'outils principale ── */}
        <CardHeader className="space-y-0 px-4 py-3">
          {/* Une seule ligne, flex-nowrap, aucun retour à la ligne */}
          <div className="flex min-w-0 items-center gap-2">
            {/* Titre — ne rétrécit pas */}
            <CardTitle className="shrink-0 whitespace-nowrap">Catalogue pièces</CardTitle>

            {/* Zone actions — prend tout l'espace restant, jamais de wrap */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* Recherche — prend tout l'espace disponible */}
              <SearchBox
                value={search}
                onChange={setSearch}
                placeholder="Rechercher un produit..."
                className="min-w-0 flex-1"
              />

              {/* Bouton filtres avancés avec badge inline */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFiltersOpen((o) => !o)}
                className="shrink-0 gap-1.5"
              >
                {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span className="hidden sm:inline">Filtres</span>
                {countActiveFilters(filters) > 0 && (
                  <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white">
                    {countActiveFilters(filters)}
                  </span>
                )}
              </Button>

              {/* Bouton Nouveau — ne rétrécit jamais */}
              <Can permission="products.create">
                <Button type="button" size="sm" onClick={() => setModalOpen(true)} className="shrink-0">
                  <Plus size={14} />
                  <span className="hidden sm:inline">Nouveau</span>
                </Button>
              </Can>
            </div>
          </div>
        </CardHeader>

        {/* ── Zone filtres avancés avec animation smooth ── */}
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: filtersOpen ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <AdvancedFilters
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(EMPTY_FILTERS)}
              categoryOptions={categoryOptions}
              brandOptions={brandOptions}
              supplierOptions={supplierOptions}
              loading={categories.isLoading || brands.isLoading || suppliers.isLoading}
            />
          </div>
        </div>

        {/* ── Badges filtres actifs ── */}
        <FilterBadges
          search={search}
          filters={filters}
          categoryOptions={categoryOptions}
          brandOptions={brandOptions}
          supplierOptions={supplierOptions}
          onRemoveSearch={() => setSearch('')}
          onRemoveFilter={handleRemoveFilter}
          onReset={handleResetAll}
        />

        {/* ── Tableau ── */}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Référence</TableHead>
                <TableHead>Désignation</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Marque</TableHead>
                <TableHead className="text-right">Stock / Seuil min</TableHead>
                <TableHead className="text-right">Achat HT</TableHead>
                <TableHead className="text-right">Achat TTC</TableHead>
                <TableHead className="text-right">Prix vente HT</TableHead>
                <TableHead className="text-right">Dernier prix vente</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading || query.error ? (
                <StateRows
                  loading={query.isLoading}
                  error={query.error}
                  empty={false}
                  colSpan={11}
                />
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-text-secondary">
                    {activeFilterCount > 0
                      ? 'Aucun produit ne correspond aux filtres actifs.'
                      : 'Aucun produit dans le catalogue.'}
                  </td>
                </tr>
              ) : null}
              {data.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono font-semibold">{product.reference}</TableCell>
                  <TableCell>
                    <Link
                      href={`/produits/${product.id}`}
                      className="text-left font-medium text-primary underline-offset-4 transition-colors hover:text-primary-dark hover:underline"
                    >
                      {product.name}
                    </Link>
                    <div className="text-xs text-text-muted">{product.location ?? product.barcode ?? '-'}</div>
                  </TableCell>
                  <TableCell>{product.category?.name ?? '-'}</TableCell>
                  <TableCell>{product.brand?.name ?? '-'}</TableCell>
                  <TableCell className="text-right font-mono">
                    <span className="font-semibold">{product.quantity}</span>
                    <span className="text-text-muted"> / {product.minStock}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-text-secondary">{money(product.purchasePrice)}</TableCell>
                  <TableCell className="text-right font-mono text-text-secondary">{money(product.purchasePriceTtc)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold text-primary">{money(product.salePrice)}</TableCell>
                  <TableCell className="text-right font-mono text-text-secondary">
                    {product.lastSellingPrice != null ? (
                      <span title={lastSaleTooltip(product)}>{money(product.lastSellingPrice)}</span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell><StockBadge product={product} /></TableCell>
                  <TableCell>
                    <RowActions
                      onEdit={() => setEditingProduct(product)}
                      onDelete={() => setTrashTarget({ id: product.id, name: product.name })}
                      deleting={deleteMutation.isPending}
                      canEdit={can('products.update')}
                      canDelete={can('products.delete')}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal création */}
      {modalOpen && can('products.create') && (
        <ProductModal
          mode="create"
          categoryOptions={categoryOptions}
          brandOptions={brandOptions}
          supplierOptions={supplierOptions}
          onClose={() => setModalOpen(false)}
          onSubmit={(form) => createMutation.mutate(form)}
          saving={createMutation.isPending}
        />
      )}

      {/* Modal modification */}
      {editingProduct && (
        <ProductModal
          mode="edit"
          initialValues={productToFormState(editingProduct)}
          categoryOptions={categoryOptions}
          brandOptions={brandOptions}
          supplierOptions={supplierOptions}
          onClose={() => setEditingProduct(null)}
          onSubmit={(form) => updateMutation.mutate({ id: editingProduct.id, form })}
          saving={updateMutation.isPending}
        />
      )}

      {trashTarget && (
        <MoveToTrashDialog
          label={trashTarget.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(trashTarget.id)}
          onCancel={() => setTrashTarget(null)}
        />
      )}
    </>
  );
}
