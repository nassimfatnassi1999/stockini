'use client';

import { StockMovementsPage } from '@/components/stockini/StockiniShell';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

export default function Page() {
  return (
    <PermissionGuard permission="stock.view">
      <StockMovementsPage />
    </PermissionGuard>
  );
}
