'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDashboardShell } from '@/components/layout/DashboardShellContext'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: string | number
  badgeVariant?: 'red' | 'amber' | 'blue'
}

interface NavSection {
  label: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: 'Principal',
    items: [
      {
        href: '/dashboard',
        label: 'Tableau de bord',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        ),
      },
      {
        href: '/products',
        label: 'Pièces détachées',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
        ),
        badge: '1 248',
        badgeVariant: 'blue',
      },
      {
        href: '/stock/movements',
        label: 'Mouvements stock',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        ),
      },
      {
        href: '/stock',
        label: 'Inventaire',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6"/>
            <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Ventes',
    items: [
      {
        href: '/sales/new',
        label: 'Point de vente',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        ),
      },
      {
        href: '/sales',
        label: 'Factures',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        ),
      },
      {
        href: '/customers',
        label: 'Clients',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Achats',
    items: [
      {
        href: '/suppliers',
        label: 'Fournisseurs',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 0 0-4 0v2M12 12v4M10 14h4"/>
          </svg>
        ),
      },
      {
        href: '/purchases',
        label: 'Bons de commande',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Gestion',
    items: [
      {
        href: '/alerts',
        label: 'Alertes',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        ),
        badge: 7,
        badgeVariant: 'red',
      },
      {
        href: '/reports',
        label: 'Rapports',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        ),
      },
      {
        href: '/settings',
        label: 'Paramètres',
        icon: (
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93a10 10 0 0 1 1.66 14.23M5 12H1M23 12h-4M12 1v4M12 19v4"/>
          </svg>
        ),
      },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { compact, mobileOpen, toggleCompact, closeMobile } = useDashboardShell()

  const badgeClass = (variant?: 'red' | 'amber' | 'blue') => {
    if (variant === 'amber') return 'nav-badge amber'
    if (variant === 'blue') return 'nav-badge blue'
    return 'nav-badge'
  }

  return (
    <aside className={cn('sidebar', compact && 'is-compact', mobileOpen && 'is-mobile-open')}>
      {/* Logo */}
      <div className="logo">
        <div className="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        </div>
        <div>
          <div className="logo-text">StockPro</div>
          <div className="logo-sub">Pièces Détachées</div>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={compact ? 'Agrandir la sidebar' : 'Réduire la sidebar'}
          title={compact ? 'Agrandir' : 'Réduire'}
          onClick={toggleCompact}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={compact ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
          </svg>
        </button>
      </div>

      {/* Nav sections */}
      {navSections.map((section) => (
        <div key={section.label} className="nav-section">
          <div className="nav-label">{section.label}</div>
          {section.items.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('nav-item', isActive && 'active')}
                title={compact ? item.label : undefined}
                onClick={closeMobile}
              >
                {item.icon}
                <span className="nav-text">{item.label}</span>
                {item.badge !== undefined && (
                  <span className={badgeClass(item.badgeVariant)}>{item.badge}</span>
                )}
              </Link>
            )
          })}
        </div>
      ))}

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="user-card">
          <div className="avatar">AK</div>
          <div>
            <div className="user-name">Ahmed Karim</div>
            <div className="user-role">Administrateur</div>
          </div>
          <svg style={{ marginLeft: 'auto', width: 14, height: 14, color: 'var(--text3)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
          </svg>
        </div>
      </div>
    </aside>
  )
}
