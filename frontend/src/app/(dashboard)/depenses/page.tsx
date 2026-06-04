'use client';

import { DepensesPage } from '@/components/stockini/DepensesPage';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

export default function Page() {
  return (
    <PermissionGuard permission="expenses.read">
      <DepensesPage />
    </PermissionGuard>
  );
}
