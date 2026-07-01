'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAuthenticated, setLastRoute } from '@/lib/auth';
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
    setAuthChecked(true);
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
