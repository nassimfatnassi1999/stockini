import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'StockPro — Gestion de Stock Pièces Détachées',
  description: 'Système de gestion de stock pièces détachées',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full" suppressHydrationWarning>
      <body className="min-h-screen overflow-x-hidden bg-[var(--bg)] text-[var(--text1)]">{children}</body>
    </html>
  )
}
