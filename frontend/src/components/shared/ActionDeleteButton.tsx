'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { DeleteConfirmModal } from './DeleteConfirmModal';

type Entity = 'client' | 'demande' | 'chantier' | 'intervention';

const ENTITY_LABELS: Record<Entity, string> = {
  client: 'Client',
  demande: 'Demande',
  chantier: 'Chantier',
  intervention: 'Intervention',
};

function buildDeleteUrl(entity: Entity, id: string, grRef?: string): string {
  switch (entity) {
    case 'client':
      return `/clients/${encodeURIComponent(id)}`;
    case 'demande':
      return `/demandes/${encodeURIComponent(id)}`;
    case 'chantier':
      return `/chantiers/${encodeURIComponent(id)}`;
    case 'intervention':
      return `/chantiers/${encodeURIComponent(grRef!)}/interventions/${encodeURIComponent(id)}`;
  }
}

interface ActionDeleteButtonProps {
  entity: Entity;
  id: string;
  reference: string;
  grRef?: string;
  onDeleted?: () => void;
}

export function ActionDeleteButton({
  entity,
  id,
  reference,
  grRef,
  onDeleted,
}: ActionDeleteButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await api.delete(buildDeleteUrl(entity, id, grRef));
      toast.success(`Supprimé avec succès`);
      setModalOpen(false);
      onDeleted?.();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 400) {
        toast.error(`Impossible de supprimer : des éléments liés existent`);
      } else if (status === 403) {
        toast.error(`Vous n'avez pas la permission de supprimer cet élément`);
      } else {
        toast.error(`Erreur lors de la suppression`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        title="Supprimer"
        disabled={loading}
        onClick={(e) => {
          e.stopPropagation();
          setModalOpen(true);
        }}
        className="app-action-button app-action-delete flex-shrink-0"
      >
        {loading ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
        ) : (
          <Trash2 size={16} />
        )}
      </button>

      <DeleteConfirmModal
        open={modalOpen}
        entityType={ENTITY_LABELS[entity]}
        reference={reference}
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => { if (!loading) setModalOpen(false); }}
      />
    </>
  );
}
