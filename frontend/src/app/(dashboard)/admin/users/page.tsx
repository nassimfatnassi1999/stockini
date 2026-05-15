'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  ToggleLeft,
  ToggleRight,
  UserCog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCurrentUser } from '@/lib/auth';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { usePermissions } from '@/lib/hooks/usePermissions';
import {
  useUsersQuery,
  useToggleUserStatusMutation,
} from '@/lib/users/hooks';
import { USER_ROLES, ROLE_LABELS, type User, type UsersQueryParams } from '@/lib/users/types';
import { UserRoleBadge, UserStatusBadge } from '@/components/stockini/users/UserBadges';
import { CreateUserModal } from '@/components/stockini/users/CreateUserModal';
import { EditUserModal } from '@/components/stockini/users/EditUserModal';
import { ResetPasswordModal } from '@/components/stockini/users/ResetPasswordModal';
import { DeleteUserDialog } from '@/components/stockini/users/DeleteUserDialog';

type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; user: User }
  | { type: 'reset'; user: User }
  | { type: 'delete'; user: User }
  | { type: 'detail'; user: User };

const PAGE_SIZE = 15;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function UserHeader() {
  return (
    <header className="mb-6 space-y-1">
      <div className="flex min-w-0 items-center gap-3">
        <UserCog size={24} className="shrink-0 text-app-primary" aria-hidden="true" />
        <h1 className="min-w-0 text-3xl font-bold tracking-tight text-app-text">
          Gestion des utilisateurs
        </h1>
      </div>
      <p className="text-sm text-app-muted">
        Créer, modifier, désactiver et gérer les accès des utilisateurs Stockini.
      </p>
    </header>
  );
}

function UserDetailModal({ user, onClose }: { user: User; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0d2236] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-white">Détails utilisateur</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
        <dl className="space-y-3 px-6 py-5 text-[13px]">
          {(
            [
              ['Nom complet', user.fullName],
              ['Email', user.email],
              ['Téléphone', user.phone ?? '—'],
              ['Créé le', formatDate(user.createdAt)],
              ['Dernière connexion', formatDate(user.lastLoginAt)],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-white/50">{label}</dt>
              <dd className="text-right text-white">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4">
            <dt className="text-white/50">Rôle</dt>
            <dd>
              <UserRoleBadge role={user.role.name as Parameters<typeof UserRoleBadge>[0]['role']} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/50">Statut</dt>
            <dd>
              <UserStatusBadge isActive={user.isActive} />
            </dd>
          </div>
        </dl>
        <div className="flex justify-end px-6 pb-5">
          <Button variant="outline" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const currentUser = getCurrentUser();
  const { can } = usePermissions();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | ''>('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });

  const params: UsersQueryParams = {
    search: debouncedSearch || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
    page,
    limit: PAGE_SIZE,
  };

  const { data, isLoading, isError } = useUsersQuery(params);
  const toggleStatus = useToggleUserStatusMutation();

  function handleSearchChange(value: string) {
    setSearch(value);
    clearTimeout((handleSearchChange as unknown as { _t: ReturnType<typeof setTimeout> })._t);
    (handleSearchChange as unknown as { _t: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 350);
  }

  function closeModal() {
    setModal({ type: 'none' });
  }

  const users = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <PermissionGuard permission="users.view">
    <div className="flex min-h-full flex-col gap-6 p-6">
      <UserHeader />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Rechercher nom, email…"
              className="h-8 w-[220px] pl-8 text-[12px]"
            />
          </div>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-md border border-white/10 bg-[#0a1c2e] px-3 text-[12px] text-white outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">Tous les rôles</option>
            {USER_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'active' | 'inactive' | '');
              setPage(1);
            }}
            className="h-8 rounded-md border border-white/10 bg-[#0a1c2e] px-3 text-[12px] text-white outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">Tous les statuts</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
        </div>

        {can('users.create') && (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            onClick={() => setModal({ type: 'create' })}
          >
            <Plus size={13} />
            Nouvel utilisateur
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0d2236]">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[46px] animate-pulse border-b border-white/5 bg-white/[0.03]"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-[13px] text-red-400">Erreur lors du chargement des utilisateurs.</p>
            <p className="text-[11px] text-white/40">Vérifiez votre connexion et réessayez.</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <UserCog size={32} className="text-white/20" />
            <p className="text-[13px] text-white/40">Aucun utilisateur trouvé</p>
            {(search || roleFilter || statusFilter) && (
              <button
                type="button"
                className="text-[11px] text-orange-400 underline"
                onClick={() => {
                  setSearch('');
                  setDebouncedSearch('');
                  setRoleFilter('');
                  setStatusFilter('');
                  setPage(1);
                }}
              >
                Effacer les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  {['Nom', 'Email', 'Rôle', 'Statut', 'Dernière connexion', 'Créé le', 'Actions'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-white/40"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 font-medium text-white">{u.fullName}</td>
                      <td className="px-4 py-3 text-white/70">{u.email}</td>
                      <td className="px-4 py-3">
                        <UserRoleBadge
                          role={
                            (ROLE_LABELS[u.role.name as keyof typeof ROLE_LABELS]
                              ? u.role.name
                              : 'SELLER') as Parameters<typeof UserRoleBadge>[0]['role']
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <UserStatusBadge isActive={u.isActive} />
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {formatDate(u.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {/* Voir détails */}
                          <ActionBtn
                            title="Voir détails"
                            onClick={() => setModal({ type: 'detail', user: u })}
                          >
                            <Eye size={13} />
                          </ActionBtn>

                          {/* Modifier */}
                          {can('users.update') && (
                            <ActionBtn
                              title="Modifier"
                              onClick={() => setModal({ type: 'edit', user: u })}
                            >
                              <Pencil size={13} />
                            </ActionBtn>
                          )}

                          {/* Toggle status */}
                          {can('users.update') && (
                            <ActionBtn
                              title={u.isActive ? 'Désactiver' : 'Activer'}
                              disabled={isSelf}
                              onClick={() =>
                                toggleStatus.mutate({
                                  id: u.id,
                                  payload: { isActive: !u.isActive },
                                })
                              }
                            >
                              {u.isActive ? (
                                <ToggleRight size={13} className="text-emerald-400" />
                              ) : (
                                <ToggleLeft size={13} className="text-slate-400" />
                              )}
                            </ActionBtn>
                          )}

                          {/* Reset password */}
                          {can('users.reset_password') && (
                            <ActionBtn
                              title="Réinitialiser mot de passe"
                              onClick={() => setModal({ type: 'reset', user: u })}
                            >
                              <KeyRound size={13} />
                            </ActionBtn>
                          )}

                          {/* Supprimer */}
                          {can('users.delete') && (
                            <ActionBtn
                              title="Supprimer"
                              disabled={isSelf}
                              onClick={() => setModal({ type: 'delete', user: u })}
                            >
                              <Trash2 size={13} className="text-red-400" />
                            </ActionBtn>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-[12px] text-white/50">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} sur {total} utilisateur
            {total > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-white">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal.type === 'create' && <CreateUserModal onClose={closeModal} />}
      {modal.type === 'edit' && <EditUserModal user={modal.user} onClose={closeModal} />}
      {modal.type === 'reset' && <ResetPasswordModal user={modal.user} onClose={closeModal} />}
      {modal.type === 'delete' && <DeleteUserDialog user={modal.user} onClose={closeModal} />}
      {modal.type === 'detail' && (
        <UserDetailModal user={modal.user} onClose={closeModal} />
      )}
    </div>
    </PermissionGuard>
  );
}

function ActionBtn({
  children,
  title,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
