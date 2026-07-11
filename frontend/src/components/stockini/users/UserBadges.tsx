'use client';

import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, type UserRole } from '@/lib/users/types';
import { Wallet } from 'lucide-react';

export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'active' : 'inactive'} className="text-[10px] font-semibold">
      {isActive ? 'Actif' : 'Inactif'}
    </Badge>
  );
}

const ROLE_VARIANT: Record<UserRole, 'admin' | 'stock' | 'seller' | 'purchase' | 'cashier'> = {
  ADMIN:            'admin',
  STOCK_MANAGER:    'stock',
  SELLER:           'seller',
  PURCHASE_MANAGER: 'purchase',
  CASHIER:           'cashier',
};

export function UserRoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge variant={ROLE_VARIANT[role] ?? 'secondary'} className="text-[10px] font-semibold">
      {role === 'CASHIER' && <Wallet size={11} className="mr-1" aria-hidden="true" />}
      {ROLE_LABELS[role] ?? role}
    </Badge>
  );
}
