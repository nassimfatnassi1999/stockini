'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalWindow } from '@/components/shared/ModalWindow';
import { useDeleteUserMutation } from '@/lib/users/hooks';
import type { User } from '@/lib/users/types';

interface Props {
  user: User;
  onClose: () => void;
}

export function DeleteUserDialog({ user, onClose }: Props) {
  const mutation = useDeleteUserMutation();

  function handleConfirm() {
    mutation.mutate(user.id, { onSuccess: onClose });
  }

  const footer = (
    <div className="flex justify-end gap-3">
      <Button type="button" variant="outline" size="sm" onClick={onClose}>Annuler</Button>
      <Button
        type="button"
        size="sm"
        disabled={mutation.isPending}
        className="bg-red-600 hover:bg-red-700 text-white"
        onClick={handleConfirm}
      >
        {mutation.isPending ? 'Suppression…' : 'Confirmer la suppression'}
      </Button>
    </div>
  );

  return (
    <ModalWindow
      title="Supprimer l'utilisateur"
      isOpen={true}
      onClose={onClose}
      defaultWidth={420}
      defaultHeight={240}
      minHeight={200}
      darkHeader={true}
      footer={footer}
    >
      <div className="px-6 py-5">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-[13px] font-medium text-amber-700">Désactivation du compte</p>
            <p className="mt-0.5 text-[12px] text-amber-600">
              Cette action va désactiver le compte de{' '}
              <span className="font-semibold">{user.fullName}</span> ({user.email}).
              L&apos;accès à l&apos;application sera révoqué immédiatement.
            </p>
          </div>
        </div>
      </div>
    </ModalWindow>
  );
}
