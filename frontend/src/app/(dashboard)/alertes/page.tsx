'use client';

import { AlertsPage } from '@/components/stockini/StockiniShell';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

export default function Page() {
  return (
    <PermissionGuard permission="alerts.view">
      <AlertsPage />
    </PermissionGuard>
  );
}
