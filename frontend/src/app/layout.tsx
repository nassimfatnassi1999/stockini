import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Stockini',
  description: 'Gestion de stock, ventes, achats, paiements et alertes',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen bg-surface text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
