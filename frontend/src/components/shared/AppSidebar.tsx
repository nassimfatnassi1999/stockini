'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Database,
  FileText,
  LayoutDashboard,
  Lock,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wallet,
  Building2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  getCurrentUserDisplayName,
  getCurrentUserEmail,
  getCurrentUserRole,
} from '@/lib/auth';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/shared/sidebar-context';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  permission: string;
  badge?: string;
  cashierOnly?: boolean;
}

interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'account',
    title: 'Compte',
    items: [
      { label: 'Profil', href: '/profil', icon: UserRound, permission: 'dashboard.view', cashierOnly: true },
    ],
  },
  {
    id: 'operations',
    title: 'Opérations',
    items: [
      { label: 'Dashboard',    href: '/dashboard',    icon: LayoutDashboard, permission: 'dashboard.view' },
      { label: 'Clients',      href: '/clients',      icon: Users,           permission: 'clients.view' },
      { label: 'Fournisseurs', href: '/fournisseurs', icon: Building2,       permission: 'suppliers.view' },
      { label: 'Produits',     href: '/produits',     icon: Package,         permission: 'products.view' },
      { label: 'Stock',        href: '/stock',        icon: Boxes,           permission: 'stock.view' },
      { label: 'Ventes',       href: '/ventes',       icon: ShoppingCart,    permission: 'sales.view' },
      { label: 'Achats',       href: '/achats',       icon: Truck,           permission: 'purchases.view' },
      { label: 'Documents',    href: '/documents',    icon: FileText,        permission: 'documents.view' },
      { label: 'Paiements',    href: '/paiements',    icon: CreditCard,      permission: 'payments.view' },
      { label: 'Caisse',       href: '/caisse',       icon: Wallet,          permission: 'caisse.view' },
    ],
  },
  {
    id: 'pilotage',
    title: 'Pilotage',
    items: [
      { label: 'Rapports',     href: '/rapports',    icon: BarChart3,   permission: 'reports.view' },
      { label: 'Dépenses',     href: '/depenses',    icon: Receipt,     permission: 'expenses.read' },
      { label: 'Alertes',      href: '/alertes',     icon: Bell,        permission: 'alerts.view' },
      { label: 'Audit Logs',   href: '/audit-logs',  icon: ShieldCheck, permission: 'audit_logs.view' },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    items: [
      { label: 'Utilisateurs', href: '/admin/users',       icon: UserCog,  permission: 'users.view' },
      { label: 'Permissions',  href: '/admin/permissions', icon: Lock,     permission: 'permissions.view' },
      { label: 'Paramètres',   href: '/settings',          icon: Settings, permission: 'settings.view' },
      { label: 'Corbeille',    href: '/corbeille',         icon: Trash2,   permission: 'trash.view' },
      { label: 'Base données', href: '/admin/database',    icon: Database, permission: 'database.view' },
    ],
  },
  {
    id: 'ressources',
    title: 'Ressources',
    items: [
      { label: 'Documentation', href: '/documentation', icon: BookOpen, permission: 'documentation.view' },
    ],
  },
];

const COLLAPSED_SECTIONS_KEY = 'crm.sidebar.sections';

function getInitials(name: string): string {
  return name
    .split(/[\s_]+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function loadCollapsedSections(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsedSections(collapsed: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...collapsed]));
}

export function AppSidebar() {
  const pathname = usePathname();
  const { closeMobile, collapsed, isMobile, mobileOpen, toggleCollapsed } = useSidebar();
  const { can } = usePermissions();

  const [mounted, setMounted] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const sectionRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
    setDisplayName(getCurrentUserDisplayName());
    setEmail(getCurrentUserEmail());
    setRole(getCurrentUserRole());

    const loaded = loadCollapsedSections();
    sectionRef.current = loaded;
    setCollapsedSections(new Set(loaded));
  }, []);

  const identity = displayName ?? email ?? 'Utilisateur';
  const initials = getInitials(identity);
  const roleLabels: Record<string, string> = {
    ADMIN: 'Administrateur',
    SUPER_ADMIN: 'Gérant · Admin',
    STOCK_MANAGER: 'Responsable stock',
    SELLER: 'Vendeur',
    PURCHASE_MANAGER: 'Responsable achats',
    CASHIER: 'Caissier',
  };
  const roleLabel = roleLabels[role ?? ''] ?? (role?.replace(/_/g, ' ') ?? 'Utilisateur');
  const isCollapsedDesktop = !isMobile && collapsed;

  const closeMobileOnNavigate = () => {
    if (isMobile) closeMobile();
  };

  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function toggleSection(sectionId: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      saveCollapsedSections(next);
      return next;
    });
  }

  function renderNavLink(item: NavItem) {
    const { href, icon: Icon, label } = item;
    const active = isActive(href);
    return (
      <Link
        key={`${href}-${label}`}
        href={href}
        onClick={closeMobileOnNavigate}
        title={isCollapsedDesktop ? label : undefined}
        className={cn(
          'group relative flex h-10 w-full items-center rounded-lg text-sm font-medium leading-5 outline-none transition-colors duration-150',
          isCollapsedDesktop ? 'justify-center px-2' : 'gap-3 px-3',
          active
            ? 'border-l-[2.5px] border-app-primary bg-sidebar-active text-white shadow-[inset_0_0_0_1px_rgb(var(--color-primary-rgb)/0.15)]'
            : 'border-l-[2.5px] border-transparent text-sidebar-text hover:bg-sidebar-hover hover:text-white',
          'focus-visible:ring-2 focus-visible:ring-white',
        )}
      >
        <Icon
          size={19}
          className={cn(
            'h-[19px] w-[19px] shrink-0 transition-opacity',
            active ? 'opacity-100' : 'opacity-65 group-hover:opacity-90',
          )}
        />
        {!isCollapsedDesktop && <span className="min-w-0 truncate">{label}</span>}
        {isCollapsedDesktop && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-app-sidebar-active px-2.5 py-1.5 text-xs text-white shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 lg:block">
            {label}
          </span>
        )}
      </Link>
    );
  }

  function renderSection(section: NavSection) {
    const cashierHrefs = new Set(['/dashboard', '/paiements', '/caisse', '/clients', '/documents', '/profil']);
    const isCashier = role?.toUpperCase() === 'CASHIER';
    const visibleItems = section.items.filter((item) =>
      can(item.permission)
      && (!item.cashierOnly || isCashier)
      && (!isCashier || cashierHrefs.has(item.href)),
    );
    if (!visibleItems.length) return null;

    const isSectionCollapsed = collapsedSections.has(section.id) && !isCollapsedDesktop;

    const sectionColors: Record<string, string> = {
      operations:     'text-[var(--color-sidebar-section-ops)]',
      pilotage:       'text-[var(--color-sidebar-section-pilotage)]',
      administration: 'text-[var(--color-sidebar-section-admin)]',
    };

    return (
      <div key={section.id} className="mt-1">
        {!isCollapsedDesktop ? (
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            className={cn(
              'group flex h-9 w-full items-center justify-between rounded-md px-3',
              'text-[10px] font-bold uppercase tracking-[0.12em] outline-none',
              'transition-colors hover:text-white focus-visible:ring-1 focus-visible:ring-white',
              sectionColors[section.id] ?? 'text-app-sidebar-text',
            )}
          >
            <span>{section.title}</span>
            {isSectionCollapsed
              ? <ChevronRight size={13} className="opacity-60" />
              : <ChevronDown size={13} className="opacity-60" />
            }
          </button>
        ) : (
          <div className="mx-3 my-2 h-px bg-white/10" />
        )}

        {!isSectionCollapsed && (
          <div className="flex flex-col gap-1">
            {visibleItems.map((item) => renderNavLink(item))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Mobile overlay */}
      <button
        type="button"
        aria-label="Fermer le menu"
        aria-hidden={!isMobile || !mobileOpen}
        onClick={closeMobile}
        className={cn(
          'fixed inset-0 z-30 bg-black/50 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-dvh w-[var(--sidebar-mobile-width)] max-w-[calc(100vw-24px)] shrink-0 flex-col overflow-hidden',
          'border-r border-white/[0.07] bg-sidebar-bg shadow-card transition-[width,transform] duration-300 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:static lg:z-20 lg:max-w-none lg:translate-x-0 lg:shadow-none',
          isCollapsedDesktop
            ? 'lg:w-[var(--sidebar-collapsed-width)]'
            : 'lg:w-[var(--sidebar-width)]',
        )}
        aria-label="Navigation principale"
      >
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center border-b border-white/[0.07] px-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              title={isMobile ? 'Stockini' : 'Réduire/Développer la barre'}
              aria-label={isMobile ? 'Logo Stockini' : 'Réduire ou développer la barre latérale'}
              onClick={() => {
                if (!isMobile) toggleCollapsed();
              }}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                'bg-sidebar-active font-mono text-sm font-bold text-white',
                'transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white',
                'select-none cursor-pointer',
              )}
            >
              ST
            </button>
            {!isCollapsedDesktop && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight text-white">Stockini</p>
                <p className="truncate text-xs text-sidebar-text">ERP / Gestion stock</p>
              </div>
            )}
          </div>

          {isMobile && (
            <button
              type="button"
              aria-label="Fermer la barre latérale"
              onClick={closeMobile}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sidebar-text outline-none transition-colors hover:bg-sidebar-hover hover:text-white focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Navigation — le wrapper .nav-sections-slot est toujours rendu (SSR + client)
            pour garantir l'identité structurelle avant hydration. */}
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          <div className="nav-sections-slot">
            {mounted ? NAV_SECTIONS.map((section) => renderSection(section)) : null}
          </div>
        </nav>

        {/* User footer */}
        <div
          className={cn(
            'shrink-0 border-t border-white/[0.07] p-3',
            isCollapsedDesktop ? 'flex justify-center' : 'flex min-h-16 items-center gap-3',
          )}
        >
          <div
            title={isCollapsedDesktop ? `${identity} — ${roleLabel}` : undefined}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              'bg-sidebar-active font-mono text-xs font-bold text-white',
              'select-none',
            )}
          >
            {initials}
          </div>
          {!isCollapsedDesktop && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-5 text-white">{identity}</p>
              <p className="truncate text-xs capitalize leading-4 text-sidebar-text">{roleLabel}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
