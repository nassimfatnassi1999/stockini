'use client'

import { createContext, useContext } from 'react'

export interface DashboardShellContextValue {
  compact: boolean
  mobileOpen: boolean
  toggleCompact: () => void
  toggleMobile: () => void
  closeMobile: () => void
}

export const DashboardShellContext = createContext<DashboardShellContextValue | null>(null)

export function useDashboardShell() {
  const context = useContext(DashboardShellContext)

  if (!context) {
    return {
      compact: false,
      mobileOpen: false,
      toggleCompact: () => undefined,
      toggleMobile: () => undefined,
      closeMobile: () => undefined,
    }
  }

  return context
}
