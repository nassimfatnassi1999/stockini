'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    if (form.password.length < 8)
      e.password = 'Minimum 8 caractères';
    if (form.confirmPassword !== form.password)
      e.confirmPassword = 'Les mots de passe ne correspondent pas';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0d2236] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-white">Nouvel utilisateur</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4">
            {/* Full name */}
            <div className="space-y-1">
              <Label htmlFor="cu-fullName" className="text-[12px] text-white/70">
                Nom complet <span className="text-red-400">*</span>
              </Label>
              <Input
                id="cu-fullName"
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                placeholder="Prénom Nom"
                className="h-9 text-[13px]"
              />
              {errors.fullName && <p className="text-[11px] text-red-400">{errors.fullName}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1">
              <Label htmlFor="cu-email" className="text-[12px] text-white/70">
                Email <span className="text-red-400">*</span>
              </Label>
              <Input
                id="cu-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="utilisateur@exemple.com"
                className="h-9 text-[13px]"
              />
              {errors.email && <p className="text-[11px] text-red-400">{errors.email}</p>}
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <Label htmlFor="cu-phone" className="text-[12px] text-white/70">
                Téléphone
              </Label>
              <Input
                id="cu-phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+216 XX XXX XXX"
                className="h-9 text-[13px]"
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label htmlFor="cu-password" className="text-[12px] text-white/70">
                Mot de passe <span className="text-red-400">*</span>
              </Label>
              <Input
                id="cu-password"
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="Minimum 8 caractères"
                className="h-9 text-[13px]"
              />
              {errors.password && <p className="text-[11px] text-red-400">{errors.password}</p>}
            </div>

            {/* Confirm password */}
            <div className="space-y-1">
              <Label htmlFor="cu-confirm" className="text-[12px] text-white/70">
                Confirmer mot de passe <span className="text-red-400">*</span>
              </Label>
              <Input
                id="cu-confirm"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
                placeholder="Répéter le mot de passe"
                className="h-9 text-[13px]"
              />
              {errors.confirmPassword && (
                <p className="text-[11px] text-red-400">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Role */}
            <div className="space-y-1">
              <Label htmlFor="cu-role" className="text-[12px] text-white/70">
                Rôle <span className="text-red-400">*</span>
              </Label>
              <select
                id="cu-role"
                value={form.roleName}
                onChange={(e) => set('roleName', e.target.value as UserRole | '')}
                className="h-9 w-full rounded-md border border-white/10 bg-[#0a1c2e] px-3 text-[13px] text-white outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">Sélectionner un rôle</option>
                {USER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {errors.roleName && <p className="text-[11px] text-red-400">{errors.roleName}</p>}
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <input
                id="cu-active"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
                className="h-4 w-4 rounded accent-orange-500"
              />
              <Label htmlFor="cu-active" className="text-[12px] text-white/70">
                Compte actif
              </Label>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Création…' : 'Créer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
