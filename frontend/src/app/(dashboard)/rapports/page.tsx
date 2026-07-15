'use client';

import { AnalyticsDashboard } from '@/components/stockini/AnalyticsDashboard';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

export default function RapportsPage() {
  return (
    <PermissionGuard permission="reports.financial.view">
      <div>
        <AnalyticsDashboard />
      </div>
    </PermissionGuard>
  );
}
