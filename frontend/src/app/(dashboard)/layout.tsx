'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isAuthenticated } from '@/lib/auth';
import { AppSidebar } from '@/components/shared/AppSidebar';
import { AppTopbar } from '@/components/shared/AppTopbar';
import { Toaster } from '@/components/shared/Toaster';
import { BreadcrumbProvider } from '@/components/shared/breadcrumb-context';
import { SidebarProvider } from '@/components/shared/sidebar-context';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Vérification côté client comme filet de sécurité supplémentaire.
    // La protection principale est dans middleware.ts (server-side).
    if (!isAuthenticated()) router.push('/login');
  }, [router]);

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
