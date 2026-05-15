'use client';

import { PaymentsPage } from '@/components/stockini/StockiniShell';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

export default function Page() {
  return (
    <PermissionGuard permission="payments.view">
      <PaymentsPage />
    </PermissionGuard>
  );
}
