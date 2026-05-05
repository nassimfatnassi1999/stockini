'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Boxes, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { money } from '@/lib/stockini/format';
import type { Lookup, Product } from '@/lib/stockini/types';

interface ProductFormData {
  name: string;
  salePrice: string;
  quantity: string;
  categoryId: string;
}

interface ProductDetailsProps {
  product: Product;
  categories?: Lookup[];
  onClose: () => void;
  onSave: (updatedProduct: Omit<Partial<Product>, 'quantity'> & { categoryId?: string }) => Promise<void> | void;
  saving?: boolean;
}

function getInitialFormData(product: Product): ProductFormData {
  return {
    name: product.name,
    salePrice: String(product.salePrice ?? 0),
    quantity: String(product.quantity ?? 0),
    categoryId: product.category?.id ?? '',
  };
}

export function ProductDetails({ product, categories = [], onClose, onSave, saving = false }: ProductDetailsProps) {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(() => getInitialFormData(product));

  useEffect(() => {
    setEditMode(false);
    setFormData(getInitialFormData(product));
  }, [product]);

  const handleCancel = () => {
    setFormData(getInitialFormData(product));
    setEditMode(false);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({
      name: formData.name.trim(),
      salePrice: Number(formData.salePrice) || 0,
      ...(formData.categoryId ? { categoryId: formData.categoryId } : {}),
    });
    setEditMode(false);
  };

  return (
    <section className="rounded-lg border border-border/70 bg-white shadow-sm transition-all duration-200">
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Détails produit</h2>
          <p className="font-mono text-sm text-text-muted">{product.reference ?? product.sku}</p>
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
          <Button type="button" size="sm" variant="outline" asChild>
            <a href="/stock">
              <Boxes size={14} />
              Gérer le stock
            </a>
          </Button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="product-detail-name">Nom produit</Label>
            <Input
              id="product-detail-name"
              value={formData.name}
              disabled={!editMode || saving}
              onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-detail-price">Prix</Label>
            <Input
              id="product-detail-price"
              type={editMode ? 'number' : 'text'}
              min="0"
              step="0.01"
              value={editMode ? formData.salePrice : money(formData.salePrice)}
              disabled={!editMode || saving}
              onChange={(event) => setFormData((current) => ({ ...current, salePrice: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-detail-stock">Stock</Label>
            <Input
              id="product-detail-stock"
              type="number"
              min="0"
              step="1"
              value={formData.quantity}
              disabled
              aria-describedby="product-detail-stock-help"
            />
            <p id="product-detail-stock-help" className="text-xs text-text-muted">
              Le stock se modifie via les entrées/sorties de stock.
            </p>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="product-detail-category">Catégorie</Label>
            <select
              id="product-detail-category"
              value={formData.categoryId}
              disabled={!editMode || saving || categories.length === 0}
              onChange={(event) => setFormData((current) => ({ ...current, categoryId: event.target.value }))}
              className="app-select"
            >
              {product.category && !categories.some((category) => category.id === product.category?.id) && (
                <option value={product.category.id}>{product.category.name}</option>
              )}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
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
