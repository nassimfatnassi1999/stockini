'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
import { Can } from '@/components/shared/Can';
import { usePermissions } from '@/lib/hooks/usePermissions';
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
import { stockiniApi } from '@/lib/stockini/api';
import { dateTime, money } from '@/lib/stockini/format';
import { calcPurchasePriceTtc, calcSalePrice, roundPrice } from '@/lib/stockini/pricing';
import { toast } from '@/lib/toast';
import type { Product } from '@/lib/stockini/types';
import { PageHeader } from '../shared/PageHeader';
import { RowActions } from '../shared/RowActions';
import { SearchBox } from '../shared/SearchBox';
import { StateRows } from '../shared/StateRows';
import { StockBadge } from '../shared/StockBadge';

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
    if (form.tva === '' || Number(form.tva) < 0)
      next.tva = 'TVA invalide';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary">
            {mode === 'edit' ? 'Modifier le produit' : 'Nouveau produit'}
          </h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {/* Référence */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-reference">Référence *</Label>
            <Input id="pf-reference" value={form.reference} onChange={set('reference')} placeholder="Ex: D/FREIN AV FIESTA 08" required />
            {errors.reference && <p className="text-xs text-red-600">{errors.reference}</p>}
          </div>

          {/* Désignation */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-name">Désignation *</Label>
            <Input id="pf-name" value={form.name} onChange={set('name')} required />
            {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
          </div>

          {/* Catégorie */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-category">Catégorie *</Label>
            <select id="pf-category" value={form.categoryId} onChange={set('categoryId')} required className="app-select">
              <option value="">Sélectionner</option>
              {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errors.categoryId && <p className="text-xs text-red-600">{errors.categoryId}</p>}
          </div>

          {/* Marque */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-brand">Marque *</Label>
            <select id="pf-brand" value={form.brandId} onChange={set('brandId')} required className="app-select">
              <option value="">Sélectionner</option>
              {brandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {errors.brandId && <p className="text-xs text-red-600">{errors.brandId}</p>}
          </div>

          {/* Fournisseur */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-supplier">Fournisseur</Label>
            <select id="pf-supplier" value={form.supplierId} onChange={set('supplierId')} className="app-select">
              <option value="">Sélectionner</option>
              {supplierOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Emplacement */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-location">Emplacement</Label>
            <Input id="pf-location" value={form.location} onChange={set('location')} placeholder="Saisir un emplacement" />
          </div>

          {/* TVA */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-tva">TVA *</Label>
            <div className="relative">
              <Input
                id="pf-tva"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="19"
                value={form.tva}
                onChange={set('tva')}
                required
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">%</span>
            </div>
            {errors.tva && <p className="text-xs text-red-600">{errors.tva}</p>}
          </div>

          {/* Prix d'achat HT */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-purchase-ht">Prix d'achat HT *</Label>
            <div className="relative">
              <Input
                id="pf-purchase-ht"
                type="number"
                min="0"
                step="0.001"
                placeholder="0,000"
                value={form.purchasePrice}
                onChange={set('purchasePrice')}
                required
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">DT</span>
            </div>
            {errors.purchasePrice && <p className="text-xs text-red-600">{errors.purchasePrice}</p>}
          </div>

          {/* Prix d'achat TTC — calculé automatiquement */}
          <div className="space-y-1.5">
            <Label>
              Prix d'achat TTC{' '}
              <span className="text-xs font-normal text-text-muted">(HT × (1 + TVA%))</span>
            </Label>
            <div className="relative">
              <Input
                type="text"
                readOnly
                tabIndex={-1}
                value={priceHt > 0 ? money(priceTtc) : '—'}
                className="bg-muted/40 cursor-not-allowed font-mono text-text-secondary"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">DT</span>
            </div>
          </div>

          {/* Prix de vente — calculé automatiquement */}
          <div className="space-y-1.5">
            <Label>
              Prix vente{' '}
              <span className="text-xs font-normal text-text-muted">(TTC × 1,4)</span>
            </Label>
            <div className="relative">
              <Input
                type="text"
                readOnly
                tabIndex={-1}
                value={priceHt > 0 ? money(priceSale) : '—'}
                className="bg-primary/5 cursor-not-allowed font-mono font-semibold text-primary"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">DT</span>
            </div>
          </div>

          {/* Stock actuel */}
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

          {/* Seuil minimum */}
          <div className="space-y-1.5">
            <Label htmlFor="pf-min">Seuil minimum *</Label>
            <Input id="pf-min" type="number" min="0" step="1" value={form.minStock} onChange={set('minStock')} required />
            {errors.minStock && <p className="text-xs text-red-600">{errors.minStock}</p>}
          </div>

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

export function ProductsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);

  const query = useQuery({ queryKey: ['stockini-products', search], queryFn: () => stockiniApi.products(search) });
  const categories = useQuery({ queryKey: ['stockini-categories'], queryFn: stockiniApi.categories });
  const brands = useQuery({ queryKey: ['stockini-brands'], queryFn: stockiniApi.brands });
  const suppliers = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });
  const data = query.data ?? [];

  const categoryOptions = (categories.data ?? []).map((item) => ({ value: item.id, label: item.name }));
  const brandOptions = (brands.data ?? []).map((item) => ({ value: item.id, label: item.name }));
  const supplierOptions = (suppliers.data ?? []).map((item) => ({ value: item.id, label: item.name }));

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
      toast.success('Produit supprimé avec succès');
      setTrashTarget(null);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la suppression');
      setTrashTarget(null);
    },
  });

  return (
    <>
      <PageHeader title="Produits" subtitle="Catalogue connecté au backend: catégories, marques, fournisseurs et seuils." />
      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 p-4">
          <CardTitle>Catalogue pièces</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchBox value={search} onChange={setSearch} />
            <Can permission="products.create">
              <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
                <Plus size={14} />
                Nouveau
              </Button>
            </Can>
          </div>
        </CardHeader>
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
                <TableHead className="text-right">Prix vente</TableHead>
                <TableHead className="text-right">Dernier prix vente</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <StateRows loading={query.isLoading} error={query.error} empty={data.length === 0} colSpan={11} />
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
        <PermanentDeleteDialog
          label={trashTarget.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(trashTarget.id)}
          onCancel={() => setTrashTarget(null)}
        />
      )}
    </>
  );
}
