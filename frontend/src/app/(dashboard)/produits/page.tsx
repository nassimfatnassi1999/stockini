'use client';

import { ProductsPage } from '@/components/stockini/StockiniShell';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

export default function Page() {
  return (
    <PermissionGuard permission="products.view">
      <ProductsPage />
    </PermissionGuard>
  );
}
