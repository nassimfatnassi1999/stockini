'use client';

import { SuppliersPage } from '@/components/stockini/StockiniShell';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

export default function Page() {
  return (
    <PermissionGuard permission="suppliers.view">
      <SuppliersPage />
    </PermissionGuard>
  );
}
