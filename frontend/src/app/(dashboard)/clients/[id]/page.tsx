'use client';

import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientDetails } from '@/components/stockini/ClientDetails';
import { Button } from '@/components/ui/button';
import { useBreadcrumbLabels } from '@/components/shared/breadcrumb-context';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import type { Customer } from '@/lib/stockini/types';

function ClientDetailsRoute() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { removeLabel, setLabel } = useBreadcrumbLabels();

  const clientQuery = useQuery({
    queryKey: ['customer', id],
    queryFn: () => stockiniApi.customer(id as string),
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) => stockiniApi.updateCustomer(id as string, data),
    onSuccess: (updatedClient) => {
      queryClient.setQueryData(['customer', id], updatedClient);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Client modifié avec succès');
    },
    onError: () => {
      toast.error('Échec de la modification du client');
    },
  });

  useEffect(() => {
    if (!id) return;

    const href = `/clients/${id}`;
    const label = clientQuery.data?.name?.trim() || 'Détails client';
    setLabel(href, label);

    return () => removeLabel(href);
  }, [clientQuery.data?.name, id, removeLabel, setLabel]);

  if (!id) {
    return (
      <div className="rounded-lg border border-border/70 bg-white px-4 py-10 text-center text-sm text-red-600">
        Client introuvable.
      </div>
    );
  }

  if (clientQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border/70 bg-white px-4 py-10 text-center text-sm text-text-muted">
        Chargement du client...
      </div>
    );
  }

  if (clientQuery.isError || !clientQuery.data) {
    return (
      <div className="space-y-4">
        <Button type="button" variant="outline" onClick={() => navigate('/clients')}>
          Retour
        </Button>
        <div className="rounded-lg border border-border/70 bg-white px-4 py-10 text-center text-sm text-red-600">
          Impossible de charger ce client.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">ClientDetailsPage</h1>
        <p className="mt-1 text-sm text-text-muted">Fiche client et modification des informations.</p>
      </div>
      <ClientDetails
        client={clientQuery.data}
        onClose={() => navigate('/clients')}
        onSave={async (updatedClient) => {
          await updateMutation.mutateAsync(updatedClient);
        }}
        saving={updateMutation.isPending}
      />
    </div>
  );
}

export default function ClientDetailsPage() {
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
        <Route path="/clients/:id" element={<ClientDetailsRoute />} />
        <Route path="*" element={<ClientDetailsRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
