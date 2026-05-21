'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { KebabMenu } from './KebabMenu';

interface RowActionsProps {
  onEdit?: () => void;
  onDelete: () => void;
  deleting: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function RowActions({ onEdit, onDelete, deleting, canEdit = true, canDelete = true }: RowActionsProps) {
  return (
    <div className="flex justify-end">
      <KebabMenu
        items={[
          {
            label: 'Modifier',
            icon: <Pencil size={14} />,
            onClick: onEdit ?? (() => {}),
            hidden: !onEdit || !canEdit,
          },
          {
            label: 'Supprimer',
            icon: <Trash2 size={14} />,
            onClick: onDelete,
            disabled: deleting,
            variant: 'destructive',
            hidden: !canDelete,
          },
        ]}
      />
    </div>
  );
}
