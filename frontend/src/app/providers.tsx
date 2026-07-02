'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ColorThemeProvider } from '@/theme/theme-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: (failureCount, error) => {
              const status = (error as { response?: { status?: number } })?.response?.status;
              return status === 401 ? false : failureCount < 1;
            },
          },
        },
      }),
  );

  useEffect(() => {
    const cancelProtectedQueries = () => {
      void queryClient.cancelQueries();
      queryClient.clear();
    };
    window.addEventListener('stockini:session-expired', cancelProtectedQueries);
    return () => window.removeEventListener('stockini:session-expired', cancelProtectedQueries);
  }, [queryClient]);

  return (
    <ColorThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ColorThemeProvider>
  );
}
