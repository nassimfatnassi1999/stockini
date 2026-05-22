'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlideOver } from '@/components/ui/SlideOver';
import { useCreateUserMutation } from '@/lib/users/hooks';
import { USER_ROLES, type UserRole } from '@/lib/users/types';

interface Props {
  onClose: () => void;
}

interface Form {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  roleName: UserRole | '';
  isActive: boolean;
}

const EMPTY: Form = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  roleName: '',
  isActive: true,
};

export function CreateUserModal({ onClose }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const mutation = useCreateUserMutation();

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.fullName.trim()) e.fullName = 'Nom obligatoire';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Email valide obligatoire';
    if (form.password.length < 8) e.password = 'Minimum 8 caractères';
    if (form.confirmPassword !== form.password) e.confirmPassword = 'Les mots de passe ne correspondent pas';
    if (!form.roleName) e.roleName = 'Rôle obligatoire';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(
      {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        roleName: form.roleName as UserRole,
        isActive: form.isActive,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <SlideOver
      title="Nouvel utilisateur"
      open={true}
      onClose={onClose}
      darkHeader={true}
      width={460}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            type="button"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => {
              const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
              handleSubmit(fakeEvent);
            }}
          >
            {mutation.isPending ? 'Création…' : 'Créer'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="cu-fullName" className="text-[12px] text-text-secondary">
            Nom complet <span className="text-red-500">*</span>
          </Label>
          <Input id="cu-fullName" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Prénom Nom" className="h-9 text-[13px]" />
          {errors.fullName && <p className="text-[11px] text-red-500">{errors.fullName}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="cu-email" className="text-[12px] text-text-secondary">
            Email <span className="text-red-500">*</span>
          </Label>
          <Input id="cu-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="utilisateur@exemple.com" className="h-9 text-[13px]" />
          {errors.email && <p className="text-[11px] text-red-500">{errors.email}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="cu-phone" className="text-[12px] text-text-secondary">Téléphone</Label>
          <Input id="cu-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+216 XX XXX XXX" className="h-9 text-[13px]" />
        </div>

        <div className="space-y-1">
          <Label htmlFor="cu-password" className="text-[12px] text-text-secondary">
            Mot de passe <span className="text-red-500">*</span>
          </Label>
          <Input id="cu-password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Minimum 8 caractères" className="h-9 text-[13px]" />
          {errors.password && <p className="text-[11px] text-red-500">{errors.password}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="cu-confirm" className="text-[12px] text-text-secondary">
            Confirmer mot de passe <span className="text-red-500">*</span>
          </Label>
          <Input id="cu-confirm" type="password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} placeholder="Répéter le mot de passe" className="h-9 text-[13px]" />
          {errors.confirmPassword && <p className="text-[11px] text-red-500">{errors.confirmPassword}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="cu-role" className="text-[12px] text-text-secondary">
            Rôle <span className="text-red-500">*</span>
          </Label>
          <select
            id="cu-role"
            value={form.roleName}
            onChange={(e) => set('roleName', e.target.value as UserRole | '')}
            className="app-select h-9 text-[13px]"
          >
            <option value="">Sélectionner un rôle</option>
            {USER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {errors.roleName && <p className="text-[11px] text-red-500">{errors.roleName}</p>}
        </div>

        <div className="flex items-center gap-3">
          <input
            id="cu-active"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            className="h-4 w-4 rounded accent-orange-500"
          />
          <Label htmlFor="cu-active" className="text-[12px] text-text-secondary">Compte actif</Label>
        </div>
      </form>
    </SlideOver>
  );
}
