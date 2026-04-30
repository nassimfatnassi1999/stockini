'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDashboardShell } from '@/components/layout/DashboardShellContext'

interface TopbarProps {
  title: string
  breadcrumb?: string
  action?: React.ReactNode
}

export function Topbar({ title, breadcrumb, action }: TopbarProps) {
  const router = useRouter()
  const { toggleMobile } = useDashboardShell()
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('stockpro-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldUseDark = storedTheme ? storedTheme === 'dark' : prefersDark

    document.documentElement.classList.toggle('dark', shouldUseDark)
    const frame = window.requestAnimationFrame(() => setDarkMode(shouldUseDark))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const toggleTheme = () => {
    const next = !darkMode
    document.documentElement.classList.toggle('dark', next)
    window.localStorage.setItem('stockpro-theme', next ? 'dark' : 'light')
    setDarkMode(next)
  }

  const handleLogout = () => {
    window.localStorage.removeItem('token')
    window.localStorage.removeItem('accessToken')
    window.localStorage.removeItem('refreshToken')
    window.localStorage.removeItem('user')
    window.sessionStorage.clear()
    router.push('/login')
  }

  return (
    <div className="topbar">
      <button type="button" className="icon-btn menu-btn" aria-label="Ouvrir la navigation" onClick={toggleMobile}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      <div className="topbar-title">
        <div className="page-title">{title}</div>
        {breadcrumb && <span className="breadcrumb">/ {breadcrumb}</span>}
      </div>

      <div className="topbar-right">
        {/* Search */}
        <div className="search-bar">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Rechercher une pièce, ref, marque…" />
        </div>

        <button type="button" className="icon-btn search-mobile-btn" aria-label="Rechercher">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>

        {/* Notifications */}
        <Link href="/alerts" className="icon-btn notif-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <div className="notif-dot" />
        </Link>

        <button type="button" className="icon-btn theme-btn" aria-label={darkMode ? 'Mode clair' : 'Mode sombre'} onClick={toggleTheme}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {darkMode ? (
              <>
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
              </>
            ) : (
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            )}
          </svg>
        </button>

        <Link href="/settings" className="profile-btn" aria-label="Profil">
          <span className="avatar avatar-sm">AK</span>
          <span className="profile-meta">
            <span>Ahmed Karim</span>
            <small>Admin</small>
          </span>
        </Link>

        <button type="button" className="btn btn-ghost logout-btn" onClick={handleLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span>Déconnexion</span>
        </button>

        {/* Slot for page-specific action */}
        {action ?? (
          <Link href="/sales/new" className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nouvelle vente
          </Link>
        )}
      </div>
    </div>
  )
}
