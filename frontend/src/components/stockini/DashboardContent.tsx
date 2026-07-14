'use client';

import { CashDashboard } from '@/components/stockini/caisse/CashDashboard';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { FinancialAnalytics } from './FinancialAnalytics';

/** Keep the cashier dashboard inside the scope of its caisse permissions. */
export function DashboardContent() {
  const { role } = usePermissions();

  if (role.toUpperCase() === 'CASHIER') {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="app-page-title">Dashboard</h1>
          <p className="app-page-subtitle">Vue opérationnelle des encaissements et de la caisse.</p>
        </div>
        <CashDashboard />
      </div>
    );
  }

  return <FinancialAnalytics />;
}
