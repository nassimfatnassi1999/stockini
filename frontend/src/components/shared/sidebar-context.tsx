'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'crm.sidebar.collapsed';
const DESKTOP_BREAKPOINT_PX = 1024;

interface SidebarContextValue {
  collapsed: boolean;
  isMobile: boolean;
  isHydrated: boolean;
  mobileOpen: boolean;
  closeMobile: () => void;
  openMobile: () => void;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  toggleMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);

    const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    if (storedValue === 'true') {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${DESKTOP_BREAKPOINT_PX - 1}px)`);

    const updateIsMobile = () => {
      const nextIsMobile = mediaQuery.matches;
      setIsMobile(nextIsMobile);

      if (!nextIsMobile) {
        setMobileOpen(false);
      }
    };

    updateIsMobile();
    mediaQuery.addEventListener('change', updateIsMobile);

    return () => mediaQuery.removeEventListener('change', updateIsMobile);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed, isHydrated]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobile, mobileOpen]);

  const value = useMemo<SidebarContextValue>(() => ({
    collapsed,
    isHydrated,
    isMobile,
    mobileOpen,
    closeMobile: () => setMobileOpen(false),
    openMobile: () => setMobileOpen(true),
    setCollapsed,
    toggleCollapsed: () => setCollapsed((prev) => !prev),
    toggleMobile: () => setMobileOpen((prev) => !prev),
  }), [collapsed, isHydrated, isMobile, mobileOpen]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used inside SidebarProvider');
  }
  return context;
}
