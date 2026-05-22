'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlideOver } from '@/components/ui/SlideOver';
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

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate({ id: user.id, payload: { password } }, { onSuccess: onClose });
  }

  return (
    <SlideOver
      title="Réinitialiser le mot de passe"
      subtitle={user.fullName}
      open={true}
      onClose={onClose}
      darkHeader={true}
      width={440}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button type="button" size="sm" disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? 'Réinitialisation…' : 'Réinitialiser'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="rp-password" className="text-[12px] text-text-secondary">
            Nouveau mot de passe <span className="text-red-500">*</span>
          </Label>
          <Input
            id="rp-password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
            placeholder="Minimum 8 caractères"
            className="h-9 text-[13px]"
          />
          {errors.password && <p className="text-[11px] text-red-500">{errors.password}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="rp-confirm" className="text-[12px] text-text-secondary">
            Confirmer le mot de passe <span className="text-red-500">*</span>
          </Label>
          <Input
            id="rp-confirm"
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
            placeholder="Répéter le mot de passe"
            className="h-9 text-[13px]"
          />
          {errors.confirm && <p className="text-[11px] text-red-500">{errors.confirm}</p>}
        </div>
      </div>
    </SlideOver>
  );
}
