'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { AnalyticsDashboard } from '@/components/stockini/AnalyticsDashboard';
import { getCurrentUser, hasPermission } from '@/lib/auth';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin'];

function canViewReports(): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  return ADMIN_ROLES.includes(user.role) || hasPermission('reports.view');
}

export default function RapportsPage() {
  const router = useRouter();
  const [access, setAccess] = useState<'loading' | 'granted' | 'denied'>('loading');

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    setAccess(canViewReports() ? 'granted' : 'denied');
  }, [router]);

  if (access === 'loading') return null;

  if (access === 'denied') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5">
        <div className="rounded-full bg-red-50 p-5">
          <ShieldOff size={36} className="text-red-500" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold text-text-primary">Accès refusé</h1>
          <p className="mt-2 max-w-sm text-sm text-text-secondary">
            Vous n'avez pas les permissions nécessaires pour consulter les rapports.
            Contactez votre administrateur pour obtenir l'accès.
          </p>
        </div>
        <button
          onClick={() => router.replace('/dashboard')}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Retour au Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">Rapports détaillés</span>
        <span className="text-[11px] text-text-muted">— Statistiques complètes toutes catégories</span>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
