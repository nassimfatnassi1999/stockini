'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import { PermanentDeleteDialog } from '@/components/stockini/PermanentDeleteDialog';
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
import { money } from '@/lib/stockini/format';
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
  purchasePrice: string;
  minStock: string;
  location: string;
}

const EMPTY_PRODUCT_FORM: ProductFormState = {
  reference: '',
  name: '',
  categoryId: '',
  brandId: '',
  supplierId: '',
  purchasePrice: '',
  minStock: '',
  location: '',
};

function ProductModal({
  categoryOptions,
  brandOptions,
  supplierOptions,
  onClose,
  onSubmit,
  saving,
}: {
  categoryOptions: Array<{ value: string; label: string }>;
  brandOptions: Array<{ value: string; label: string }>;
  supplierOptions: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSubmit: (form: ProductFormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormState, string>>>({});

  const priceHt = parseFloat(form.purchasePrice) || 0;
  const priceTtc = roundPrice(calcPurchasePriceTtc(priceHt));
  const priceSale = roundPrice(calcSalePrice(priceHt));

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
      next.purchasePrice = 'Prix d\'achat HT invalide';
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
          <h2 className="text-base font-semibold text-text-primary">Nouveau produit</h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
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
            <Input
              id="pf-location"
              value={form.location}
              onChange={set('location')}
              placeholder="Saisir un emplacement"
            />
          </div>

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

          <div className="space-y-1.5">
            <Label>Prix d'achat TTC <span className="text-xs font-normal text-text-muted">(HT × 1,19)</span></Label>
            <div className="relative">
              <Input
                type="text"
                readOnly
                value={priceHt > 0 ? money(priceTtc) : '—'}
                className="bg-muted/40 cursor-not-allowed font-mono text-text-secondary"
                tabIndex={-1}
              />
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Prix de vente <span className="text-xs font-normal text-text-muted">(TTC × 1,4)</span></Label>
            <div className="relative">
              <Input
                type="text"
                readOnly
                value={priceHt > 0 ? money(priceSale) : '—'}
                className="bg-primary/5 cursor-not-allowed font-mono font-semibold text-primary"
                tabIndex={-1}
              />
            </div>
            {priceHt > 0 && (
              <p className="text-[11px] text-text-muted">
                {money(priceHt)} HT → {money(priceTtc)} TTC → {money(priceSale)} vente
              </p>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
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
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [trashTarget, setTrashTarget] = useState<{ id: string; name: string } | null>(null);
  const query = useQuery({ queryKey: ['stockini-products', search], queryFn: () => stockiniApi.products(search) });
  const categories = useQuery({ queryKey: ['stockini-categories'], queryFn: stockiniApi.categories });
  const brands = useQuery({ queryKey: ['stockini-brands'], queryFn: stockiniApi.brands });
  const suppliers = useQuery({ queryKey: ['stockini-suppliers'], queryFn: stockiniApi.suppliers });
  const data = query.data ?? [];

  const createMutation = useMutation({
    mutationFn: (form: ProductFormState) =>
      stockiniApi.createProduct({
        reference: form.reference.trim(),
        name: form.name.trim(),
        categoryId: form.categoryId,
        brandId: form.brandId,
        ...(form.supplierId && { supplierId: form.supplierId }),
        purchasePrice: Number(form.purchasePrice),
        quantity: 0,
        minStock: Number(form.minStock),
        ...(form.location.trim() && { location: form.location.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      setModalOpen(false);
      toast.success('Produit créé');
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
            <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
              <Plus size={14} />
              Nouveau
            </Button>
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
                <TableHead className="text-right">Stock</TableHead>
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
                  <TableCell className="text-right font-mono">{product.quantity} / {product.minStock}</TableCell>
                  <TableCell className="text-right font-mono text-text-secondary">{money(product.purchasePrice)}</TableCell>
                  <TableCell className="text-right font-mono text-text-secondary">{money(product.purchasePriceTtc)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold text-primary">{money(product.salePrice)}</TableCell>
                  <TableCell className="text-right font-mono text-text-secondary">
                    {product.lastSellingPrice != null ? money(product.lastSellingPrice) : '—'}
                  </TableCell>
                  <TableCell><StockBadge product={product} /></TableCell>
                  <TableCell>
                    <RowActions onDelete={() => setTrashTarget({ id: product.id, name: product.name })} deleting={deleteMutation.isPending} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {modalOpen && (
        <ProductModal
          categoryOptions={(categories.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
          brandOptions={(brands.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
          supplierOptions={(suppliers.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
          onClose={() => setModalOpen(false)}
          onSubmit={(form) => createMutation.mutate(form)}
          saving={createMutation.isPending}
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
