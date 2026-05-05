'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, User } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrateur',
  direction: 'Direction',
  assistante: 'Assistante',
  charge_affaires: "Chargé d'Affaires",
  technicien: 'Technicien',
  qualite: 'Qualité',
  comptabilite: 'Comptabilité',
  lecture: 'Lecture seule',
};

const profileSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  prenom: z.string().min(1, 'Le prénom est requis'),
});

const passwordSchema = z
  .object({
    oldPassword: z.string().min(1, 'Requis'),
    newPassword: z.string().min(8, 'Au moins 8 caractères'),
    confirmNewPassword: z.string().min(1, 'Requis'),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmNewPassword'],
  });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

interface UserProfile {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  role: string;
}

export default function ProfilPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  const {
    register: regProfile,
    handleSubmit: handleProfile,
    reset: resetProfile,
    formState: { errors: errProfile },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  const {
    register: regPwd,
    handleSubmit: handlePwd,
    reset: resetPwd,
    formState: { errors: errPwd },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    api
      .get<UserProfile>('/auth/me')
      .then((res) => {
        setUser(res.data);
        resetProfile({ nom: res.data.nom, prenom: res.data.prenom });
      })
      .catch(() => router.push('/login'));
  }, []);

  const onSaveProfile = async (data: ProfileForm) => {
    setLoadingProfile(true);
    try {
      const res = await api.patch<UserProfile>('/auth/me', data);
      setUser(res.data);
      toast.success('Informations mises à jour.');
      router.refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erreur lors de la mise à jour.');
    } finally {
      setLoadingProfile(false);
    }
  };

  const onChangePassword = async (data: PasswordForm) => {
    setLoadingPassword(true);
    try {
      await api.patch('/auth/me/password', {
        oldPassword: data.oldPassword,
        newPassword: data.newPassword,
      });
      toast.success('Mot de passe modifié avec succès.');
      resetPwd();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erreur lors de la modification.');
    } finally {
      setLoadingPassword(false);
    }
  };

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Mon profil</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Gérez vos informations personnelles et votre mot de passe.
        </p>
      </div>

      {/* Section informations personnelles */}
      <section className="rounded-xl border border-border bg-white shadow-card">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <User size={15} className="text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-primary">Informations personnelles</h2>
        </div>

        <form onSubmit={handleProfile(onSaveProfile)} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Prénom</label>
              <input
                {...regProfile('prenom')}
                type="text"
                placeholder="Prénom"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {errProfile.prenom && (
                <p className="text-xs text-red-500">{errProfile.prenom.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Nom</label>
              <input
                {...regProfile('nom')}
                type="text"
                placeholder="Nom"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {errProfile.nom && (
                <p className="text-xs text-red-500">{errProfile.nom.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Email</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-border bg-muted px-3 py-2 text-sm text-text-secondary"
              />
              <p className="text-[11px] text-text-muted">L'email ne peut pas être modifié.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Rôle</label>
              <input
                type="text"
                value={ROLE_LABELS[user.role] ?? user.role}
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-border bg-muted px-3 py-2 text-sm text-text-secondary"
              />
              <p className="text-[11px] text-text-muted">Le rôle est géré par un administrateur.</p>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loadingProfile}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white outline-none transition-colors hover:bg-primary-dark focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingProfile && <Loader2 size={14} className="animate-spin" />}
              Enregistrer les informations
            </button>
          </div>
        </form>
      </section>

      {/* Section sécurité / mot de passe */}
      <section className="rounded-xl border border-border bg-white shadow-card">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <Lock size={15} className="text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-primary">Sécurité</h2>
        </div>

        <form onSubmit={handlePwd(onChangePassword)} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Mot de passe actuel</label>
            <input
              {...regPwd('oldPassword')}
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errPwd.oldPassword && (
              <p className="text-xs text-red-500">{errPwd.oldPassword.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Nouveau mot de passe</label>
              <input
                {...regPwd('newPassword')}
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {errPwd.newPassword && (
                <p className="text-xs text-red-500">{errPwd.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Confirmer le mot de passe</label>
              <input
                {...regPwd('confirmNewPassword')}
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {errPwd.confirmNewPassword && (
                <p className="text-xs text-red-500">{errPwd.confirmNewPassword.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loadingPassword}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white outline-none transition-colors hover:bg-primary-dark focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingPassword && <Loader2 size={14} className="animate-spin" />}
              Modifier le mot de passe
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
