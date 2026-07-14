'use client';

import { useMemo, useState } from 'react';
import type { ElementType } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Boxes,
  CircleDollarSign,
  CreditCard,
  Percent,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
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
import type { ReportOverviewQuery, ReportPeriod } from '@/lib/stockini/types';
import { PageHeader } from '../shared/PageHeader';

const PERIOD_OPTIONS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'year', label: 'Cette année' },
  { value: 'custom', label: 'Personnalisé' },
];

function percent(value?: number | null) {
  if (value == null) return '-';
  return `${value.toFixed(2)} %`;
}

function KpiCard({
  icon: Icon,
  title,
  value,
  description,
  formula,
  trend,
}: {
  icon: ElementType;
  title: string;
  value: string | number;
  description: string;
  formula: string;
  trend?: number | null;
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Icon size={18} />
          </div>
          {trend != null && (
            <Badge className={trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}>
              {trend >= 0 ? '+' : ''}
              {trend} %
            </Badge>
          )}
        </div>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted" title={formula}>
          {title}
        </p>
        <p className="mt-1 truncate font-mono text-xl font-bold text-text-primary">{value}</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">{description}</p>
      </CardContent>
    </Card>
  );
}

export function StockiniDashboardPage() {
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const query = useMemo<ReportOverviewQuery | undefined>(() => {
    if (period === 'custom') {
      return dateFrom && dateTo ? { period, dateFrom, dateTo } : undefined;
    }
    return { period };
  }, [dateFrom, dateTo, period]);

  const overview = useQuery({
    queryKey: ['stockini-financial-dashboard', query],
    queryFn: () => stockiniApi.reportsOverview(query),
    enabled: period !== 'custom' || Boolean(dateFrom && dateTo),
    staleTime: 60_000,
  });

  const data = overview.data;
  const financial = data?.financier;
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label.toLowerCase() ?? 'période';

  return (
    <>
      <PageHeader
        title="Dashboard financier"
        subtitle="Profit réel, chiffre d'affaires, encaissements et marge commerciale sans mélange avec la trésorerie."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border bg-white p-1 shadow-sm">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                period === option.value
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-secondary hover:bg-muted hover:text-text-primary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-1.5 shadow-sm">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="text-xs outline-none"
            />
            <span className="text-text-muted">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="text-xs outline-none"
            />
          </div>
        )}
      </div>

      {overview.isLoading && (
        <Card className="shadow-card">
          <CardContent className="p-6 text-sm text-text-secondary">Chargement des KPI financiers...</CardContent>
        </Card>
      )}

      {overview.error && (
        <Card className="shadow-card">
          <CardContent className="p-6 text-sm text-red-600">Impossible de charger les indicateurs financiers.</CardContent>
        </Card>
      )}

      {financial && (
        <div className="space-y-4">
          <Card className="border-accent/30 bg-accent/5 shadow-card">
            <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                  Profit net réel - {periodLabel}
                </p>
                <p className="mt-2 font-mono text-3xl font-bold text-text-primary">
                  {money(financial.netProfit)}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  Marge commerciale: {money(financial.grossMarginHT)} · Dépenses: {money(financial.operatingExpenses)} · Taux de profit net: {percent(financial.netProfitRate)}
                </p>
              </div>
              {financial.hasEstimatedCosts && (
                <Badge className="bg-amber-50 text-amber-700">
                  {financial.estimatedCostLines} vente(s) avec coût estimé
                </Badge>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={ShoppingCart}
              title="Ventes réalisées"
              value={financial.salesCount}
              description={`${financial.quantitySold} article(s) vendu(s).`}
              formula="Nombre de FACTURE/BON_LIVRAISON validés, hors brouillons, annulés et documents transformés déjà comptés."
              trend={financial.caTrend}
            />
            <KpiCard
              icon={ReceiptText}
              title="Chiffre d'affaires HT"
              value={money(financial.netRevenueHT)}
              description="Ventes nettes HT après remises et avoirs."
              formula="CA net HT = lignes vendues HT - avoirs HT."
              trend={financial.caTrend}
            />
            <KpiCard
              icon={Percent}
              title="Marge commerciale HT"
              value={money(financial.grossMarginHT)}
              description={`Taux de marge: ${percent(financial.grossMarginRate)}.`}
              formula="Marge commerciale HT = CA net HT - COGS ajusté."
            />
            <KpiCard
              icon={CircleDollarSign}
              title="Profit net réel"
              value={money(financial.netProfit)}
              description={`Profit moyen par vente: ${money(financial.averageProfitPerSale)}.`}
              formula="Profit net = CA net HT - COGS ajusté - dépenses opérationnelles."
            />
            <KpiCard
              icon={CreditCard}
              title="Encaissements clients"
              value={money(financial.customerPayments)}
              description="Paiements réellement reçus pendant la période."
              formula="Somme des paiements clients encaissés, par date de paiement."
            />
            <KpiCard
              icon={Boxes}
              title="Coût des produits vendus"
              value={money(financial.cogsHT)}
              description="Coût des articles réellement sortis en vente."
              formula="COGS = quantité vendue × coût d'achat HT snapshot, ajusté des retours."
            />
            <KpiCard
              icon={TrendingUp}
              title="Remises accordées"
              value={money(financial.discountsHT)}
              description={`Avoirs HT: ${money(financial.creditNotesHT)}.`}
              formula="Remises HT = prix brut ligne HT - net ligne HT."
            />
            <KpiCard
              icon={Banknote}
              title="Impayés clients"
              value={money(financial.customerOutstanding)}
              description={`Dettes fournisseurs: ${money(financial.supplierOutstanding)}.`}
              formula="Impayés clients = total à payer - paiements - avoirs imputés."
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader className="p-4">
                <CardTitle>Profit par vente</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Référence</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">CA HT</TableHead>
                      <TableHead className="text-right">Coût HT</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.profitParVente ?? []).slice(0, 8).map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-mono font-semibold">{sale.reference}</TableCell>
                        <TableCell>{sale.client}</TableCell>
                        <TableCell className="text-right font-mono">{money(sale.netRevenueHT)}</TableCell>
                        <TableCell className="text-right font-mono">{money(sale.cogsHT)}</TableCell>
                        <TableCell className="text-right font-mono">{money(sale.netProfit)}</TableCell>
                      </TableRow>
                    ))}
                    {(data.profitParVente ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-text-secondary">
                          Aucune vente comptabilisée sur cette période.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="p-4">
                <CardTitle>Produits les plus rentables</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Qté</TableHead>
                      <TableHead className="text-right">Marge HT</TableHead>
                      <TableHead>Rentabilité</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.profitParProduit ?? []).slice(0, 8).map((item) => (
                      <TableRow key={item.product.id}>
                        <TableCell>
                          <span className="font-semibold">{item.product.reference}</span>
                          <span className="block text-xs text-text-secondary">{item.product.name}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{item.quantitySold}</TableCell>
                        <TableCell className="text-right font-mono">{money(item.grossMarginHT)}</TableCell>
                        <TableCell>
                          <Badge variant="muted">{item.profitability.replaceAll('_', ' ')}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(data.profitParProduit ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-sm text-text-secondary">
                          Aucun produit vendu sur cette période.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
