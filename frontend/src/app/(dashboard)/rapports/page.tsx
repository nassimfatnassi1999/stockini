'use client';

import { AnalyticsDashboard } from '@/components/stockini/AnalyticsDashboard';
import { PermissionGuard } from '@/components/shared/PermissionGuard';

export default function RapportsPage() {
  return (
    <PermissionGuard permission="reports.view">
      <div className="space-y-2">
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Rapports détaillés</span>
          <span className="text-[11px] text-text-muted">— Statistiques complètes toutes catégories</span>
        </div>
        <AnalyticsDashboard />
      </div>
    </PermissionGuard>
  );
}
