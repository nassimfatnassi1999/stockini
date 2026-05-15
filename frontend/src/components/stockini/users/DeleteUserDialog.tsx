'use client';

import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0d2236] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-white">Supprimer l&apos;utilisateur</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-400" />
            <div>
              <p className="text-[13px] font-medium text-amber-300">
                Désactivation du compte
              </p>
              <p className="mt-0.5 text-[12px] text-amber-300/70">
                Cette action va désactiver le compte de{' '}
                <span className="font-semibold">{user.fullName}</span> ({user.email}).
                L&apos;accès à l&apos;application sera révoqué immédiatement.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Annuler
            </Button>
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
        </div>
      </div>
    </div>
  );
}
