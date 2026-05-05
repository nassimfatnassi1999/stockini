'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  Boxes,
  CreditCard,
  LayoutDashboard,
  PackageCheck,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getCurrentUserDisplayName, getCurrentUserEmail, getCurrentUserRole } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/shared/sidebar-context';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

interface NavSection {
  items: NavItem[];
  title: string;
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Stockini',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Clients', href: '/clients', icon: Users },
      { label: 'Produits', href: '/produits', icon: PackageCheck },
      { label: 'Ventes', href: '/ventes', icon: ShoppingCart },
      { label: 'Achats', href: '/achats', icon: Truck },
      { label: 'Fournisseurs', href: '/fournisseurs', icon: Warehouse },
    ],
  },
  {
    title: 'Pilotage',
    items: [
      { label: 'Stock', href: '/stock', icon: Boxes },
      { label: 'Paiements', href: '/paiements', icon: CreditCard },
      { label: 'Rapports', href: '/rapports', icon: BarChart3 },
      { label: 'Alertes', href: '/alertes', icon: Bell },
      { label: 'Settings', href: '/settings', icon: Settings },
      { label: 'Audit logs', href: '/audit-logs', icon: ShieldCheck },
    ],
  },
];

function getInitials(name: string): string {
  return name
    .split(/[\s_]+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

export function AppSidebar() {
  const pathname = usePathname();
  const { closeMobile, collapsed, isMobile, mobileOpen } = useSidebar();
  const [role, setRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setRole(getCurrentUserRole());
    setDisplayName(getCurrentUserDisplayName());
    setEmail(getCurrentUserEmail());
  }, []);

  const isAdmin = useMemo(() => (role ? ['SUPER_ADMIN', 'ADMIN', 'super_admin', 'admin'].includes(role) : false), [role]);
  const identity = displayName ?? email ?? 'Utilisateur';
  const initials = getInitials(identity);
  const roleLabel = ['SUPER_ADMIN', 'super_admin'].includes(role ?? '') ? 'Gerant · Admin' : (role?.replace(/_/g, ' ') ?? 'Utilisateur');
  const isCollapsedDesktop = !isMobile && collapsed;

  const closeMobileOnNavigate = () => {
    if (isMobile) {
      closeMobile();
    }
  };

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Fermer le menu"
        aria-hidden={!isMobile || !mobileOpen}
        onClick={closeMobile}
        className={cn(
          'fixed inset-0 z-30 bg-[#0D2B3E]/65 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen max-w-[85vw] flex-col overflow-hidden border-r border-white/10 bg-sidebar-bg shadow-card transition-all duration-200 ease-out lg:static lg:z-20 lg:max-w-none lg:shadow-none',
          isCollapsedDesktop ? 'lg:w-[78px]' : 'lg:w-[240px]',
          isMobile ? (mobileOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0',
          'w-[280px]',
        )}
      >
        <div className="flex h-[64px] items-center border-b border-white/10 px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-light font-mono text-lg font-bold text-white">
              ST
            </div>
            {!isCollapsedDesktop && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">Stockini</p>
                <p className="truncate text-[11px] text-sidebar-text">Gestion stock v3</p>
              </div>
            )}
          </div>

          {isMobile && (
            <button
              type="button"
              aria-label="Fermer la barre latérale"
              onClick={closeMobile}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-text outline-none transition-colors hover:bg-sidebar-hover hover:text-white focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mt-1.5">
              {!isCollapsedDesktop ? (
                <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8BA4BC]">
                  {section.title}
                </p>
              ) : (
                <div className="mx-3 my-2 h-px bg-white/10" />
              )}

              <div className="flex flex-col gap-1">
                {section.items.map(({ href, icon: Icon, label }) => {
                  const active = isActive(href);

                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={closeMobileOnNavigate}
                      title={isCollapsedDesktop ? label : undefined}
                      className={cn(
                        'group relative flex items-center rounded-md text-[12px] font-medium outline-none transition-colors',
                        isCollapsedDesktop ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2',
                        active
                          ? 'border-l-[2.5px] border-accent bg-sidebar-active text-white'
                          : 'border-l-[2.5px] border-transparent text-sidebar-text hover:bg-sidebar-hover hover:text-white',
                        'focus-visible:ring-2 focus-visible:ring-white',
                      )}
                    >
                      <Icon size={15} className={cn(active ? 'opacity-100' : 'opacity-80', 'flex-shrink-0')} />

                      {!isCollapsedDesktop && <span className="truncate">{label}</span>}

                      {isCollapsedDesktop && (
                        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-[#132f43] px-2 py-1 text-[11px] text-white shadow-card-hover opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 lg:block">
                          {label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {isAdmin && (
            <div className="mt-2">
              {!isCollapsedDesktop && (
                <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#8BA4BC]">
                  Admin
                </p>
              )}

              <Link
                href="/admin/permissions"
                onClick={closeMobileOnNavigate}
                title={isCollapsedDesktop ? 'Permissions' : undefined}
                className={cn(
                  'group relative flex items-center rounded-md text-[12px] font-medium outline-none transition-colors',
                  isCollapsedDesktop ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-3 py-2',
                  pathname.startsWith('/admin')
                    ? 'border-l-[2.5px] border-accent bg-sidebar-active text-white'
                    : 'border-l-[2.5px] border-transparent text-sidebar-text hover:bg-sidebar-hover hover:text-white',
                  'focus-visible:ring-2 focus-visible:ring-white',
                )}
              >
                <ShieldCheck size={15} className="flex-shrink-0 opacity-80" />
                {!isCollapsedDesktop && <span className="truncate">Permissions</span>}
                {isCollapsedDesktop && (
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-[#132f43] px-2 py-1 text-[11px] text-white shadow-card-hover opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 lg:block">
                    Permissions
                  </span>
                )}
              </Link>
            </div>
          )}
        </nav>

        <div className={cn('border-t border-white/10 p-3', isCollapsedDesktop ? 'flex justify-center' : 'flex items-center gap-2.5')}>
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-primary-light font-mono text-[10px] font-bold text-white">
            {initials}
          </div>
          {!isCollapsedDesktop && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-white">{identity}</p>
              <p className="truncate text-[10px] capitalize text-sidebar-text">{roleLabel}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
