'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { BrowserRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProductDetails } from '@/components/stockini/ProductDetails';
import { Button } from '@/components/ui/button';
import { useBreadcrumbLabels } from '@/components/shared/breadcrumb-context';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import type { Product } from '@/lib/stockini/types';

type ProductUpdatePayload = Omit<Partial<Product>, 'quantity'> & { categoryId?: string };

function hasApiMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  return Boolean(error.response?.data?.message);
}

function ProductDetailsRoute() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { removeLabel, setLabel } = useBreadcrumbLabels();

  const productQuery = useQuery({
    queryKey: ['stockini-product', id],
    queryFn: () => stockiniApi.product(id as string),
    enabled: Boolean(id),
  });
  const categoriesQuery = useQuery({ queryKey: ['stockini-categories'], queryFn: stockiniApi.categories });

  const updateMutation = useMutation({
    mutationFn: (data: ProductUpdatePayload) => stockiniApi.updateProduct(id as string, data),
    onSuccess: (updatedProduct) => {
      queryClient.setQueryData(['stockini-product', id], updatedProduct);
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      toast.success('Produit modifié avec succès');
    },
    onError: (error) => {
      if (!hasApiMessage(error)) {
        toast.error('Échec de la modification du produit. Veuillez vérifier les champs saisis.');
      }
    },
  });

  useEffect(() => {
    if (!id) return;

    const href = `/produits/${id}`;
    const label = productQuery.data?.name?.trim() || 'Détails produit';
    setLabel(href, label);

    return () => removeLabel(href);
  }, [id, productQuery.data?.name, removeLabel, setLabel]);

  if (!id) {
    return (
      <div className="rounded-lg border border-border/70 bg-white px-4 py-10 text-center text-sm text-red-600">
        Produit introuvable.
      </div>
    );
  }

  if (productQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border/70 bg-white px-4 py-10 text-center text-sm text-text-muted">
        Chargement du produit...
      </div>
    );
  }

  if (productQuery.isError || !productQuery.data) {
    return (
      <div className="space-y-4">
        <Button type="button" variant="outline" onClick={() => navigate('/produits')}>
          Retour
        </Button>
        <div className="rounded-lg border border-border/70 bg-white px-4 py-10 text-center text-sm text-red-600">
          Impossible de charger ce produit.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="app-page-title">Détail produit</h1>
        <p className="app-page-subtitle">Fiche produit et modification du catalogue.</p>
      </div>
      <ProductDetails
        product={productQuery.data}
        categories={categoriesQuery.data ?? []}
        onClose={() => navigate('/produits')}
        onSave={async (updatedProduct) => {
          await updateMutation.mutateAsync(updatedProduct);
        }}
        saving={updateMutation.isPending}
      />
    </div>
  );
}

export default function ProductDetailsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="rounded-lg border border-border/70 bg-white px-4 py-10 text-center text-sm text-text-muted">
        Chargement...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/produits/:id" element={<ProductDetailsRoute />} />
        <Route path="*" element={<ProductDetailsRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
