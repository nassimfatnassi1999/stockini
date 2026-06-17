'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  getCurrentUser,
  setAuthSession,
  type AuthUser,
} from '@/lib/auth';

interface MeResponse extends AuthUser {
  prenom?: string;
  nom?: string;
  phone?: string | null;
}

export const ME_QUERY_KEY = ['auth', 'me'] as const;

const SUPER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin'];

function isSuperUser(role: string): boolean {
  return SUPER_ROLES.includes(role);
}

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<MeResponse>('/auth/me');
      // Persist fresh permissions to localStorage so hasPermission() stays in sync
      setAuthSession({ accessToken: '', user: data });
      return data;
    },
    staleTime: 30 * 1000,
    retry: 1,
    // Seed from localStorage for the initial render (no flicker)
    initialData: () => {
      const u = getCurrentUser();
      return u ? (u as MeResponse) : undefined;
    },
    initialDataUpdatedAt: 0, // force background refetch even with initialData
  });
}

export function usePermissions() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();

  const permissions = useMemo<string[]>(
    () => me?.permissions ?? getCurrentUser()?.permissions ?? [],
    [me?.permissions]
  );

  const role = useMemo<string>(
    () => me?.role ?? getCurrentUser()?.role ?? '',
    [me?.role]
  );

  const superAdmin = useMemo<boolean>(
    () => me?.isSuperAdmin ?? isSuperUser(role),
    [me?.isSuperAdmin, role]
  );

  const can = useCallback(
    (permission: string): boolean => {
      if (!role) return false;
      if (superAdmin) return true;
      if (permissions.includes('*')) return true;
      if (permissions.includes(permission)) return true;
      const module = permission.split('.')[0];
      return permissions.includes(`${module}.*`);
    },
    [permissions, role, superAdmin],
  );

  const canAny = useCallback(
    (perms: string[]): boolean => perms.some(can),
    [can],
  );

  const canAll = useCallback(
    (perms: string[]): boolean => perms.every(can),
    [can],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [queryClient]);

  return { can, canAny, canAll, permissions, role, isSuperAdmin: superAdmin, invalidate };
}
