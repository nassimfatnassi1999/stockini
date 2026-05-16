'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/lib/hooks/usePermissions';

interface Props {
  permission: string;
  redirect?: string;
  children: React.ReactNode;
}

export function PermissionGuard({ permission, redirect = '/dashboard', children }: Props) {
  const router = useRouter();
  const { can, role } = usePermissions();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && role && !can(permission)) {
      router.replace(redirect);
    }
  }, [can, mounted, permission, redirect, role, router]);

  // Before mount: return a stable div placeholder so SSR and client initial
  // render produce the same DOM structure (prevents hydration mismatch).
  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="mb-5 h-12 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-48 animate-pulse rounded-xl border bg-white" />
      </div>
    );
  }

  if (!role) return null;
  if (!can(permission)) return null;
  return <>{children}</>;
}
