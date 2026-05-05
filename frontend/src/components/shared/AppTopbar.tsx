'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getCurrentUserDisplayName,
  getCurrentUserEmail,
  isAuthenticated,
} from '@/lib/auth';
import { useSidebar } from '@/components/shared/sidebar-context';
import { useBreadcrumbLabels } from '@/components/shared/breadcrumb-context';
import { UserDropdown } from '@/components/shared/UserDropdown';
import { NotificationsDropdown } from '@/components/shared/NotificationsDropdown';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  produits: 'Produits',
  fournisseurs: 'Fournisseurs',
  ventes: 'Ventes',
  achats: 'Achats',
  stock: 'Stock',
  paiements: 'Paiements',
  alertes: 'Alertes',
  rapports: 'Rapports',
  settings: 'Settings',
  'audit-logs': 'Audit logs',
  clients: 'Clients',
  admin: 'Admin',
  permissions: 'Permissions',
  nouveau: 'Nouveau',
  nouvelle: 'Nouvelle',
  modifier: 'Modifier',
  profil: 'Profil',
};

function getInitials(name: string): string {
  return name
    .split(/[\s_]+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function getFallbackLabel(segments: string[], index: number, segment: string) {
  if (index === 1 && segments[0] === 'clients') return 'Détails client';
  if (index === 1 && segments[0] === 'produits') return 'Détails produit';
  return ROUTE_LABELS[segment] ?? segment.replace(/-/g, ' ');
}

function buildBreadcrumbs(pathname: string, labels: Record<string, string>) {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; href: string; last: boolean }[] = [];
  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    acc += `/${seg}`;
    const label = labels[acc] ?? getFallbackLabel(segments, i, seg);
    crumbs.push({ label, href: acc, last: i === segments.length - 1 });
  }
  return crumbs;
}

export function AppTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { collapsed, isMobile, mobileOpen, toggleCollapsed, toggleMobile } = useSidebar();
  const { labels } = useBreadcrumbLabels();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    setDisplayName(getCurrentUserDisplayName());
    setEmail(getCurrentUserEmail());
  }, [router]);

  const identity = displayName ?? email ?? 'Utilisateur';
  const initials = getInitials(identity);
  const crumbs = useMemo(() => buildBreadcrumbs(pathname, labels), [labels, pathname]);

  const onSidebarToggle = () => {
    if (isMobile) {
      toggleMobile();
      return;
    }

    toggleCollapsed();
  };

  const SidebarIcon = isMobile
    ? Menu
    : collapsed
      ? PanelLeftOpen
      : PanelLeftClose;

  const sidebarAriaLabel = isMobile
    ? mobileOpen
      ? 'Fermer le menu'
      : 'Ouvrir le menu'
    : collapsed
      ? 'Agrandir la barre latérale'
      : 'Réduire la barre latérale';

  return (
    <header
      className="sticky top-0 z-30 flex h-[52px] flex-shrink-0 items-center gap-2 border-b border-border bg-white px-3 shadow-topbar sm:px-4 lg:px-6"
    >
      <button
        type="button"
        aria-label={sidebarAriaLabel}
        onClick={onSidebarToggle}
        className="app-action-button h-8 w-8 border-border bg-surface"
      >
        <SidebarIcon size={15} />
      </button>

      {crumbs.length > 1 && (
        <button
          type="button"
          aria-label="Page précédente"
          onClick={() => router.back()}
          className="app-action-button border-border bg-surface"
        >
          <ArrowLeft size={13} />
        </button>
      )}

      <nav className="hidden items-center gap-1.5 overflow-hidden text-xs sm:flex" aria-label="Fil d'Ariane">
        <Link
          href="/dashboard"
          className="truncate text-text-muted transition-colors hover:text-primary hover:underline"
        >
          Accueil
        </Link>
        {crumbs.map((crumb) => (
          <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight size={11} className="text-border-strong" />
            {crumb.last ? (
              <span className="truncate font-medium text-text-primary">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-text-muted transition-colors hover:text-primary hover:underline"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <NotificationsDropdown />
        <UserDropdown initials={initials} identity={identity} />
      </div>
    </header>
  );
}
