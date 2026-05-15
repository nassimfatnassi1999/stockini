'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/lib/hooks/usePermissions';

interface Props {
  permission: string;
  redirect?: string;
  children: React.ReactNode;
}

/**
 * Redirects to `redirect` (default: /dashboard) if the current user
 * does not have `permission`. Renders null while the session loads.
 */
export function PermissionGuard({ permission, redirect = '/dashboard', children }: Props) {
  const router = useRouter();
  const { can, role } = usePermissions();

  useEffect(() => {
    if (role && !can(permission)) {
      router.replace(redirect);
    }
  }, [can, permission, redirect, role, router]);

  if (!role) return null;
  if (!can(permission)) return null;
  return <>{children}</>;
}
