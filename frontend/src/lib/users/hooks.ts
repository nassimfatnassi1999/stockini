import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { usersApi } from './api';
import type {
  CreateUserPayload,
  ResetPasswordPayload,
  UpdateUserPayload,
  UpdateUserStatusPayload,
  UsersQueryParams,
} from './types';

const USERS_KEY = 'users';

export function useUsersQuery(params?: UsersQueryParams) {
  return useQuery({
    queryKey: [USERS_KEY, params],
    queryFn: () => usersApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useUserQuery(id: string) {
  return useQuery({
    queryKey: [USERS_KEY, id],
    queryFn: () => usersApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useCreateUserMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => usersApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success('Utilisateur créé avec succès');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Erreur lors de la création';
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    },
  });
}

export function useUpdateUserMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
      usersApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success('Utilisateur modifié avec succès');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Erreur lors de la modification';
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    },
  });
}

export function useToggleUserStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateUserStatusPayload;
    }) => usersApi.updateStatus(id, payload),
    onSuccess: (_, { payload }) => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success(
        payload.isActive
          ? 'Utilisateur activé avec succès'
          : 'Utilisateur désactivé avec succès',
      );
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Opération refusée';
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    },
  });
}

export function useResetPasswordMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: ResetPasswordPayload;
    }) => usersApi.resetPassword(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success('Mot de passe réinitialisé avec succès');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Erreur lors de la réinitialisation';
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    },
  });
}

export function useDeleteUserMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
      toast.success('Utilisateur supprimé avec succès');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Suppression refusée';
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    },
  });
}
