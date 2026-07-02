'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAuthenticated, setAuthSession, setLastRoute, type AuthUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { AppSidebar } from '@/components/shared/AppSidebar';
import { AppTopbar } from '@/components/shared/AppTopbar';
import { Toaster } from '@/components/shared/Toaster';
import { BreadcrumbProvider } from '@/components/shared/breadcrumb-context';
import { SidebarProvider } from '@/components/shared/sidebar-context';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      window.location.href = '/login';
      return;
    }
    let active = true;
    api.get<AuthUser>('/auth/me')
      .then(({ data }) => {
        if (!active) return;
        setAuthSession({ accessToken: '', user: data });
        setAuthChecked(true);
      })
      .catch(() => {
        // The shared API client refreshes once when possible and otherwise
        // performs the single, deduplicated redirect to /login.
      });
    return () => { active = false; };
  }, []);

  // Persist the current route so we can restore it after login/refresh
  useEffect(() => {
    if (authChecked && pathname) setLastRoute(pathname);
  }, [authChecked, pathname]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-text-secondary">
        Vérification de la session...
      </div>
    );
  }

  return (
    <SidebarProvider>
      <BreadcrumbProvider>
        <div className="relative flex h-screen overflow-hidden bg-surface">
          <AppSidebar />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AppTopbar />

            <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 lg:p-6">
              {children}
            </main>
          </div>
          <Toaster />
        </div>
      </BreadcrumbProvider>
    </SidebarProvider>
  );
}
