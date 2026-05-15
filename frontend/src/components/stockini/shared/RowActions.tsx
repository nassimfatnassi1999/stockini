'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RowActionsProps {
  onEdit?: () => void;
  onDelete: () => void;
  deleting: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function RowActions({ onEdit, onDelete, deleting, canEdit = true, canDelete = true }: RowActionsProps) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && canEdit && (
        <Button type="button" size="action" variant="actionEdit" onClick={onEdit} title="Modifier">
          <Pencil size={16} />
        </Button>
      )}
      {canDelete && (
        <Button type="button" size="action" variant="actionDelete" onClick={onDelete} disabled={deleting} title="Supprimer">
          <Trash2 size={16} />
        </Button>
      )}
    </div>
  );
}
