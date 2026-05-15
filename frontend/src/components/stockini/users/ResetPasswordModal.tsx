'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useResetPasswordMutation } from '@/lib/users/hooks';
import type { User } from '@/lib/users/types';

interface Props {
  user: User;
  onClose: () => void;
}

export function ResetPasswordModal({ user, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const mutation = useResetPasswordMutation();

  function validate(): boolean {
    const e: typeof errors = {};
    if (password.length < 8) e.password = 'Minimum 8 caractères';
    if (confirm !== password) e.confirm = 'Les mots de passe ne correspondent pas';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate({ id: user.id, payload: { password } }, { onSuccess: onClose });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0d2236] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Réinitialiser le mot de passe</h2>
            <p className="text-[11px] text-white/50">{user.fullName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="space-y-1">
            <Label htmlFor="rp-password" className="text-[12px] text-white/70">
              Nouveau mot de passe <span className="text-red-400">*</span>
            </Label>
            <Input
              id="rp-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((p) => ({ ...p, password: undefined }));
              }}
              placeholder="Minimum 8 caractères"
              className="h-9 text-[13px]"
            />
            {errors.password && <p className="text-[11px] text-red-400">{errors.password}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="rp-confirm" className="text-[12px] text-white/70">
              Confirmer le mot de passe <span className="text-red-400">*</span>
            </Label>
            <Input
              id="rp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setErrors((p) => ({ ...p, confirm: undefined }));
              }}
              placeholder="Répéter le mot de passe"
              className="h-9 text-[13px]"
            />
            {errors.confirm && <p className="text-[11px] text-red-400">{errors.confirm}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Réinitialisation…' : 'Réinitialiser'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
