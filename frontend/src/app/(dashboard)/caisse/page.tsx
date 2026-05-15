'use client';

import { Wallet } from 'lucide-react';
import { CashDashboard } from '@/components/stockini/caisse/CashDashboard';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

export default function CaissePage() {
  return (
    <PermissionGuard permission="caisse.view">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100">
            <Wallet size={18} className="text-orange-600" />
          </div>
          <div>
            <h1 className="app-page-title">Caisse &amp; Trésorerie</h1>
            <p className="app-page-subtitle">Suivi des flux financiers, transactions et analytiques</p>
          </div>
        </div>

        <CashDashboard />
      </div>
    </PermissionGuard>
  );
}
