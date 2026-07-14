'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Banknote, Boxes, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { stockiniApi } from '@/lib/stockini/api';
import { money } from '@/lib/stockini/format';
import { PageHeader } from '../shared/PageHeader';
import { StatCard } from '../shared/StatCard';
import { StateRows } from '../shared/StateRows';
import { StockBadge } from '../shared/StockBadge';

export function StockiniDashboardPage() {
  const dashboard = useQuery({ queryKey: ['stockini-dashboard'], queryFn: stockiniApi.dashboard });
  const stockValue = useQuery({ queryKey: ['stockini-stock-value'], queryFn: stockiniApi.stockValue });
  const products = useQuery({ queryKey: ['stockini-products-preview'], queryFn: () => stockiniApi.products() });
  const alerts = useQuery({ queryKey: ['stockini-alerts-preview'], queryFn: stockiniApi.alerts });

  const lowProducts = useMemo(
    () => (products.data ?? []).filter((product) => product.quantity <= product.minStock).slice(0, 6),
    [products.data],
  );

  return (
    <>
      <PageHeader title="Dashboard Stockini" subtitle="Vue opérationnelle des pièces, ventes, alertes et valeur de stock." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Boxes} label="Produits actifs" value={dashboard.data?.productsCount ?? '-'} />
        <StatCard icon={AlertTriangle} label="Sous seuil" value={dashboard.data?.lowStockCount ?? '-'} tone="accent" />
        <StatCard icon={Users} label="Clients" value={dashboard.data?.customersCount ?? '-'} />
        <StatCard icon={Banknote} label="Ventes" value={money(dashboard.data?.salesTotal)} tone="green" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <Card className="shadow-card">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
            <CardTitle>Stock critique</CardTitle>
            <Badge variant="muted">{money(stockValue.data?.saleValue ?? 0)} valeur vente</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Famille</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <StateRows loading={products.isLoading} error={products.error} empty={lowProducts.length === 0} colSpan={5} />
                {lowProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono font-semibold">{product.reference ?? product.sku}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell className="text-text-secondary">{product.category?.name ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono">{product.quantity}</TableCell>
                    <TableCell><StockBadge product={product} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="p-4">
            <CardTitle>Alertes récentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            {alerts.isLoading && <p className="text-sm text-text-secondary">Chargement...</p>}
            {alerts.error && <p className="text-sm text-red-600">Alertes indisponibles.</p>}
            {(alerts.data ?? []).slice(0, 6).map((alert) => (
              <div key={alert.id} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-text-primary">{alert.title}</p>
                  <Badge className={alert.isRead ? 'bg-muted text-text-secondary' : 'bg-accent text-white'}>
                    {alert.isRead ? 'lu' : 'nouveau'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-text-secondary">{alert.message}</p>
              </div>
            ))}
            {!alerts.isLoading && !alerts.error && (alerts.data ?? []).length === 0 && (
              <p className="text-sm text-text-secondary">Aucune alerte active.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
