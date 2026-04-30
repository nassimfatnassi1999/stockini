'use client'

import { useMemo, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { DashboardShellContext } from '@/components/layout/DashboardShellContext'
import { cn } from '@/lib/utils'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [compact, setCompact] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const value = useMemo(
    () => ({
      compact,
      mobileOpen,
      toggleCompact: () => setCompact((current) => !current),
      toggleMobile: () => setMobileOpen((current) => !current),
      closeMobile: () => setMobileOpen(false),
    }),
    [compact, mobileOpen]
  )

  return (
    <DashboardShellContext.Provider value={value}>
      <div className={cn('dashboard-shell', compact && 'sidebar-compact', mobileOpen && 'sidebar-mobile-open')}>
        <Sidebar />
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fermer la navigation"
          onClick={value.closeMobile}
        />
        <main className="main">{children}</main>
      </div>
    </DashboardShellContext.Provider>
  )
}
