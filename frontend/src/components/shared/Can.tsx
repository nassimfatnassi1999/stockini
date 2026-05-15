'use client';

import { usePermissions } from '@/lib/hooks/usePermissions';

interface CanProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** Renders children only when the current user has the given permission. */
export function Can({ permission, children, fallback = null }: CanProps) {
  const { can } = usePermissions();
  return can(permission) ? <>{children}</> : <>{fallback}</>;
}

interface CanAnyProps {
  permissions: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** Renders children when the user has at least one of the given permissions. */
export function CanAny({ permissions, children, fallback = null }: CanAnyProps) {
  const { canAny } = usePermissions();
  return canAny(permissions) ? <>{children}</> : <>{fallback}</>;
}

interface CanAllProps {
  permissions: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** Renders children only when the user has ALL of the given permissions. */
export function CanAll({ permissions, children, fallback = null }: CanAllProps) {
  const { canAll } = usePermissions();
  return canAll(permissions) ? <>{children}</> : <>{fallback}</>;
}
