'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalWindow } from '@/components/shared/ModalWindow';
import { useUpdateUserMutation } from '@/lib/users/hooks';
import { USER_ROLES, type User, type UserRole } from '@/lib/users/types';

interface Props {
  user: User;
  onClose: () => void;
}

interface Form {
  fullName: string;
  phone: string;
  roleName: UserRole;
  isActive: boolean;
}

export function EditUserModal({ user, onClose }: Props) {
  const [form, setForm] = useState<Form>({
    fullName: user.fullName,
    phone: user.phone ?? '',
    roleName: user.role.name as UserRole,
    isActive: user.isActive,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const mutation = useUpdateUserMutation();

  useEffect(() => {
    setForm({
      fullName: user.fullName,
      phone: user.phone ?? '',
      roleName: user.role.name as UserRole,
      isActive: user.isActive,
    });
  }, [user]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.fullName.trim()) e.fullName = 'Nom obligatoire';
    if (!form.roleName) e.roleName = 'Rôle obligatoire';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(
      {
        id: user.id,
        payload: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || undefined,
          roleName: form.roleName,
          isActive: form.isActive,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalWindow
      title="Modifier l'utilisateur"
      reference={user.email}
      isOpen={true}
      onClose={onClose}
      defaultWidth={440}
      defaultHeight={400}
      darkHeader={true}
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
        <div className="space-y-1">
          <Label htmlFor="eu-fullName" className="text-[12px] text-text-secondary">
            Nom complet <span className="text-red-500">*</span>
          </Label>
          <Input id="eu-fullName" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className="h-9 text-[13px]" />
          {errors.fullName && <p className="text-[11px] text-red-500">{errors.fullName}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="eu-phone" className="text-[12px] text-text-secondary">Téléphone</Label>
          <Input id="eu-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+216 XX XXX XXX" className="h-9 text-[13px]" />
        </div>

        <div className="space-y-1">
          <Label htmlFor="eu-role" className="text-[12px] text-text-secondary">
            Rôle <span className="text-red-500">*</span>
          </Label>
          <select
            id="eu-role"
            value={form.roleName}
            onChange={(e) => set('roleName', e.target.value as UserRole)}
            className="app-select h-9 text-[13px]"
          >
            {USER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {errors.roleName && <p className="text-[11px] text-red-500">{errors.roleName}</p>}
        </div>

        <div className="flex items-center gap-3">
          <input
            id="eu-active"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            className="h-4 w-4 rounded accent-orange-500"
          />
          <Label htmlFor="eu-active" className="text-[12px] text-text-secondary">Compte actif</Label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </ModalWindow>
  );
}
