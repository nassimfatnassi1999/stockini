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
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, border: '1px solid #FFCDD2',
          borderRadius: 6, background: 'transparent',
          cursor: loading ? 'not-allowed' : 'pointer',
          color: '#E53935', flexShrink: 0,
          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (loading) return;
          (e.currentTarget as HTMLElement).style.background = '#FFEBEE';
          (e.currentTarget as HTMLElement).style.borderColor = '#E53935';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.borderColor = '#FFCDD2';
        }}
      >
        {loading ? (
          <span style={{
            width: 11, height: 11,
            border: '2px solid #FFCDD2', borderTopColor: '#E53935',
            borderRadius: '50%', display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }} />
        ) : (
          <Trash2 size={13} />
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
