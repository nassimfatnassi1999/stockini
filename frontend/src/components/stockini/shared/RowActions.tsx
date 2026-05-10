'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RowActions({ onEdit, onDelete, deleting }: { onEdit?: () => void; onDelete: () => void; deleting: boolean }) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && (
        <Button type="button" size="action" variant="actionEdit" onClick={onEdit} title="Modifier">
          <Pencil size={16} />
        </Button>
      )}
      <Button type="button" size="action" variant="actionDelete" onClick={onDelete} disabled={deleting} title="Supprimer">
        <Trash2 size={16} />
      </Button>
    </div>
  );
}
