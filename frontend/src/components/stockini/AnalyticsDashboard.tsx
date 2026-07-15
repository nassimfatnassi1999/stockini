'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  Package, TrendingUp, AlertTriangle, Users, ShoppingCart,
  Boxes, DollarSign, Activity, BarChart2, ArrowUpRight,
  ArrowDownRight, RefreshCw, Layers, Target, Zap, Truck,
  TrendingDown, Loader2, AlertCircle,
} from 'lucide-react';
import { stockiniApi } from '@/lib/stockini/api';
import { money } from '@/lib/stockini/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ReportPeriod, ReportOverview } from '@/lib/stockini/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  '#E67E22', '#2563EB', '#10B981', '#8B5CF6',
  '#14B8A6', '#F59E0B', '#EC4899', '#6366F1', '#EF4444', '#06B6D4',
];

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'today',  label: "Aujourd'hui" },
  { value: 'week',   label: 'Cette semaine' },
  { value: 'month',  label: 'Ce mois' },
  { value: 'year',   label: 'Cette année' },
  { value: 'custom', label: 'Personnalisé' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compactMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type KpiColor = 'default' | 'green' | 'orange' | 'red' | 'blue' | 'purple' | 'teal';

function KpiCard({
  icon: Icon, label, value, sub, trend, color = 'default',
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; trend?: number | null; color?: KpiColor;
}) {
  const iconBg: Record<KpiColor, string> = {
    default: 'bg-slate-100 text-slate-500',
    green:   'bg-emerald-100 text-emerald-600',
    orange:  'bg-orange-100 text-orange-600',
    red:     'bg-red-100 text-red-600',
    blue:    'bg-blue-100 text-blue-600',
    purple:  'bg-purple-100 text-purple-600',
    teal:    'bg-teal-100 text-teal-600',
  };
  return (
    <Card className="shadow-card transition-shadow hover:shadow-card-hover">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={`rounded-xl p-2.5 ${iconBg[color]}`}>
            <Icon size={18} />
          </div>
          {trend != null && (
            <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {trend >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <div className="mt-4">
          <p className="truncate text-xl font-bold leading-tight text-text-primary">{value}</p>
          <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
          {sub && <p className="mt-1 text-[11px] text-text-muted">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHead({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="rounded-lg bg-accent/10 p-1.5">
        <Icon size={14} className="text-accent" />
      </div>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">{title}</h2>
    </div>
  );
}

function ChartTip({ active, payload, label, fmt }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  fmt?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-lg">
      <p className="mb-2 text-[11px] font-semibold text-text-secondary">{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
          <span className="text-[11px] text-text-secondary">{e.name}:</span>
          <span className="text-[11px] font-semibold text-text-primary">
            {fmt ? fmt(e.value, e.name) : e.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-muted">
        Chargement…
      </div>
    );
  }
  return <>{children}</>;
}

// ─── Loading / Error states ───────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <Loader2 size={32} className="animate-spin text-accent" />
      <p className="text-sm text-text-secondary">Chargement des données…</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <AlertCircle size={32} className="text-red-500" />
      <p className="text-sm text-text-secondary">Impossible de charger les rapports.</p>
      <button
        onClick={onRetry}
        className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-medium text-text-primary shadow-sm hover:bg-muted"
      >
        Réessayer
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const [period, setPeriod]     = useState<ReportPeriod>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');

  const query = useMemo(() => {
    if (period === 'custom' && customStart && customEnd) {
      return { period, dateFrom: customStart, dateTo: customEnd };
    }
    if (period !== 'custom') return { period };
    return undefined;
  }, [period, customStart, customEnd]);

  const {
    data: overview,
    isLoading,
    isError,
    refetch,
  } = useQuery<ReportOverview>({
    queryKey: ['reports-overview', query],
    queryFn: () => stockiniApi.reportsOverview(query),
    staleTime: 60_000,
    enabled: period !== 'custom' || (!!customStart && !!customEnd),
  });

  // ── Period selector ───────────────────────────────────────────────────────
  const periodBar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-xl border border-border bg-white p-1 shadow-sm">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              period === opt.value
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-secondary hover:bg-muted hover:text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-1.5 shadow-sm">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="text-xs focus:outline-none"
          />
          <span className="text-text-muted">→</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="text-xs focus:outline-none"
          />
        </div>
      )}
    </div>
  );

  const header = (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="app-page-title">Rapports — Analyse complète</h1>
        <p className="app-page-subtitle">
          Vue financière et opérationnelle détaillée — Stockini
        </p>
      </div>
      {periodBar}
    </div>
  );

  if (isLoading) return <div className="space-y-6 pb-10">{header}<LoadingState /></div>;
  if (isError || !overview) return (
    <div className="space-y-6 pb-10">{header}<ErrorState onRetry={() => refetch()} /></div>
  );

  const { financier, ventes, achats, stock, clients, topProduits, topClients, topFournisseurs, series } = overview;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const seriesChart = series.map((s) => ({
    label:      s.label,
    CA:         Math.round(s.ca),
    Achats:     Math.round(s.achats),
    'Marge brute': Math.round(s.margeBrute),
    Bénéfice:   Math.round(s.benefice),
    Encaissements: Math.round(s.encaissements),
    Dépenses:   Math.round(s.depenses),
  }));

  const topProduitsChart = [...topProduits].reverse().map((item) => ({
    name:      (item.product?.name ?? 'Inconnu').substring(0, 28),
    Quantité:  item.quantitySold,
    Montant:   Math.round(item.revenue),
  }));

  const topClientsChart = [...topClients].reverse().map((item) => ({
    name:   (item.customer?.name ?? 'Client divers').substring(0, 22),
    CA:     Math.round(item.ca),
    Impayé: Math.round(item.impaye),
  }));

  const topFournisseursChart = [...topFournisseurs].reverse().map((item) => ({
    name:        (item.supplier?.name ?? 'Fournisseur').substring(0, 22),
    'Total achats': Math.round(item.totalAchats),
    Impayé:      Math.round(item.impaye),
  }));

  const categoryChart = stock.parCategorie.map((c) => ({
    name: c.name,
    value: Math.round(c.saleValue),
  }));

  const statutVentesChart = [
    { name: 'Payé',      value: ventes.parStatutPaiement.paye,    fill: '#10B981' },
    { name: 'Partiel',   value: ventes.parStatutPaiement.partiel, fill: '#F59E0B' },
    { name: 'Impayé',    value: ventes.parStatutPaiement.impaye,  fill: '#EF4444' },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6 pb-10">
      {header}
      {!financier.dataQuality.complete && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Marge historique partielle : {financier.dataQuality.unknownCostLines} ligne(s) sans coût reconstructible.
          {financier.dataQuality.estimatedCostLines > 0 && ` ${financier.dataQuality.estimatedCostLines} coût(s) ont été reconstruits et signalés comme estimés.`}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — SYNTHÈSE FINANCIÈRE
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={DollarSign} title="Synthèse financière" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <KpiCard
            icon={DollarSign}
            label="CA net HT hors timbre"
            value={money(financier.caNet)}
            trend={financier.caTrend}
            color="orange"
          />
          <KpiCard
            icon={TrendingUp}
            label="Encaissements clients"
            value={money(financier.encaissementsClients)}
            color="green"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Impayés clients"
            value={money(financier.impayesClients)}
            color="red"
          />
          <KpiCard
            icon={TrendingUp}
            label="Bénéfice réel"
            value={money(financier.beneficeEstime)}
            sub={`Marge brute : ${money(financier.margeBruteReelle)} (${financier.margePercent}%)`}
            color={financier.beneficeEstime >= 0 ? 'green' : 'red'}
          />
          <KpiCard
            icon={ShoppingCart}
            label="Total achats"
            value={money(financier.totalAchats)}
            trend={financier.achatsTrend}
            color="blue"
          />
          <KpiCard
            icon={Truck}
            label="Paiements fournisseurs"
            value={money(financier.paiementsFournisseurs)}
            sub={
              financier.totalAchats > 0
                ? `${Math.round((financier.paiementsFournisseurs / financier.totalAchats) * 100)}% réglé`
                : undefined
            }
            color="teal"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Impayés fournisseurs"
            value={money(financier.impayesFournisseurs)}
            color="orange"
          />
          <KpiCard
            icon={Boxes}
            label="Valeur stock (achat)"
            value={money(stock.valeurAchat)}
            sub={`Vente : ${money(stock.valeurVente)}`}
            color="purple"
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2 — TRÉSORERIE
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={DollarSign} title="Trésorerie" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <KpiCard
            icon={DollarSign}
            label="Caisse physique"
            value={money(financier.soldeCaisse)}
            color="green"
          />
          <KpiCard
            icon={DollarSign}
            label="Trésorerie bancaire"
            value={money(financier.soldeBanque)}
            color="blue"
          />
          <KpiCard
            icon={DollarSign}
            label="Solde global"
            value={money(financier.soldeGlobal)}
            color="teal"
          />
          <KpiCard
            icon={TrendingDown}
            label="Dépenses (période)"
            value={money(financier.depenses)}
            color="red"
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3 — VENTES
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={DollarSign} title="Ventes" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            icon={DollarSign}
            label="CA période"
            value={money(financier.caNet)}
            trend={financier.caTrend}
            color="orange"
          />
          <KpiCard
            icon={TrendingUp}
            label="Nb ventes (BL+FA)"
            value={ventes.count}
            trend={ventes.countTrend}
            color="blue"
          />
          <KpiCard
            icon={Activity}
            label="Panier moyen"
            value={money(ventes.panierMoyen)}
            color="purple"
          />
          <KpiCard
            icon={DollarSign}
            label="Devis"
            value={ventes.devisCount}
            color="default"
          />
          <KpiCard
            icon={Layers}
            label="Factures"
            value={ventes.factureCount}
            color="green"
          />
          <KpiCard
            icon={RefreshCw}
            label="Annulées"
            value={ventes.cancelledCount}
            color="red"
          />
        </div>

        {/* Avoirs */}
        {ventes.avoirs.count > 0 && (
          <div className="mt-3 grid gap-3 grid-cols-2 md:grid-cols-3">
            <KpiCard
              icon={RefreshCw}
              label="Avoirs émis"
              value={ventes.avoirs.count}
              color="orange"
            />
            <KpiCard
              icon={DollarSign}
              label="Montant avoirs"
              value={money(ventes.avoirs.total)}
              color="orange"
            />
            <KpiCard
              icon={DollarSign}
              label="Montant remboursé"
              value={money(ventes.avoirs.montantRembourse)}
              color="orange"
            />
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 4 — STOCK
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={Package} title="Produits & Stock" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard icon={Package}       label="Total produits"   value={stock.totalProduits}  color="blue" />
          <KpiCard icon={AlertTriangle} label="Ruptures stock"   value={stock.ruptureCount}   color="red" />
          <KpiCard icon={AlertTriangle} label="Sous seuil"       value={stock.lowStockCount}  color="orange" />
          <KpiCard icon={Boxes}         label="Qté en stock"     value={stock.totalQuantite.toLocaleString()} color="teal" />
          <KpiCard icon={TrendingUp}    label="Entrées stock"    value={stock.mouvements.entries} color="green" />
          <KpiCard icon={TrendingDown}  label="Sorties stock"    value={stock.mouvements.exits}   color="red" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5 — ACHATS
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={ShoppingCart} title="Achats" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <KpiCard icon={ShoppingCart}  label="Total achats"        value={money(financier.totalAchats)}       trend={financier.achatsTrend} color="blue" />
          <KpiCard icon={Layers}        label="Nb commandes"         value={achats.count}                       trend={achats.countTrend}     color="purple" />
          <KpiCard icon={Truck}         label="Paiements fournisseurs" value={money(financier.paiementsFournisseurs)} color="teal" />
          <KpiCard icon={AlertTriangle} label="Impayés fournisseurs" value={money(financier.impayesFournisseurs)}  color="orange" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 6 — CLIENTS
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={Users} title="Clients" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          <KpiCard icon={Users}         label="Total clients"        value={clients.total}                        color="blue" />
          <KpiCard icon={DollarSign}    label="Encaissements période" value={money(financier.encaissementsClients)} color="green" />
          <KpiCard icon={AlertTriangle} label="Impayés période"       value={money(financier.impayesClients)}       color="red" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          CHARTS
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={BarChart2} title="Graphiques analytiques" />

        {/* ─── ROW 1: CA + Achats vs Ventes ──────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Chart 1 — Évolution du CA */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp size={14} className="text-accent" /> Évolution CA
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={seriesChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gCA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#E67E22" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#E67E22" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                    <Area
                      type="monotone" dataKey="CA" name="CA"
                      stroke="#E67E22" fill="url(#gCA)" strokeWidth={2.5}
                      dot={false} activeDot={{ r: 4, fill: '#E67E22', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>

          {/* Chart 2 — CA, marge brute et bénéfice */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart2 size={14} className="text-accent" /> CA net HT, marge brute et bénéfice
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={seriesChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="CA"       stroke="#E67E22" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Marge brute" stroke="#2563EB" strokeWidth={2} dot={false} strokeDasharray="5 3" activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Bénéfice" stroke="#10B981" strokeWidth={2}   dot={false} strokeDasharray="3 2" activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>
        </div>

        {/* ─── ROW 2: Encaissements vs Dépenses + Répartition statuts ────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">

          {/* Chart 3 — Encaissements vs Dépenses */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity size={14} className="text-accent" /> Encaissements vs Dépenses
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={seriesChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="Encaissements" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="Dépenses"      fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>

          {/* Chart 4 — Répartition ventes par statut paiement */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity size={14} className="text-accent" /> Statuts de paiement (ventes)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {statutVentesChart.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune vente sur la période</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChart>
                        <Pie
                          data={statutVentesChart} cx="50%" cy="50%"
                          innerRadius={58} outerRadius={95}
                          paddingAngle={2} dataKey="value" stroke="none"
                        >
                          {statutVentesChart.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => String(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                      {statutVentesChart.map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: item.fill }} />
                          <span className="text-[11px] text-text-secondary">
                            {item.name}: {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </ClientOnly>
            </CardContent>
          </Card>
        </div>

        {/* ─── ROW 3: Top produits + Catégories stock ──────────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">

          {/* Chart 5 — Top produits vendus */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target size={14} className="text-accent" /> Top 10 produits vendus (période)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {topProduitsChart.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune vente sur la période</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topProduitsChart} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 10, fill: '#5A6A7E' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="Quantité" fill="#E67E22" radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ClientOnly>
            </CardContent>
          </Card>

          {/* Chart 6 — Valeur stock par catégorie */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity size={14} className="text-accent" /> Stock par famille
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {categoryChart.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune donnée</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChart>
                        <Pie
                          data={categoryChart} cx="50%" cy="50%"
                          innerRadius={58} outerRadius={95}
                          paddingAngle={2} dataKey="value" stroke="none"
                        >
                          {categoryChart.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => money(Number(v ?? 0))} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
                      {categoryChart.map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-[11px] text-text-secondary">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </ClientOnly>
            </CardContent>
          </Card>
        </div>

        {/* ─── ROW 4: Top clients + Top fournisseurs ────────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">

          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users size={14} className="text-accent" /> Top clients par CA
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {topClientsChart.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune donnée</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={topClientsChart} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: '#5A6A7E' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                      <Bar dataKey="CA"     name="CA"     fill="#E67E22" radius={[0, 4, 4, 0]} maxBarSize={18} />
                      <Bar dataKey="Impayé" name="Impayé" fill="#EF4444" radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ClientOnly>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Truck size={14} className="text-accent" /> Top fournisseurs par achats
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {topFournisseursChart.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune donnée</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={topFournisseursChart} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: '#5A6A7E' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                      <Bar dataKey="Total achats" fill="#2563EB" radius={[0, 4, 4, 0]} maxBarSize={18} />
                      <Bar dataKey="Impayé"       fill="#F59E0B" radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ClientOnly>
            </CardContent>
          </Card>
        </div>

        {/* ─── ROW 5: Stock critique ────────────────────────────────────────── */}
        <div className="mt-4">
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle size={14} className="text-red-500" /> Alertes stock critique
                </CardTitle>
                <div className="flex gap-2">
                  <Badge className="border-red-200 bg-red-50 text-red-700 text-[11px]">
                    {stock.ruptureCount} rupture{stock.ruptureCount !== 1 ? 's' : ''}
                  </Badge>
                  <Badge className="border-amber-200 bg-amber-50 text-amber-700 text-[11px]">
                    {stock.lowStockCount} sous seuil
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {stock.produitsCritiques.length === 0 ? (
                <p className="py-10 text-center text-sm text-text-muted">
                  Aucun produit en stock critique — tout est OK ✓
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {['Référence', 'Désignation', 'Famille', 'Qté', 'Seuil', 'Statut'].map((h) => (
                          <th
                            key={h}
                            className={`px-4 py-2.5 text-[11px] font-semibold text-text-secondary ${
                              h === 'Qté' || h === 'Seuil'
                                ? 'text-right'
                                : h === 'Statut'
                                  ? 'text-center'
                                  : 'text-left'
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stock.produitsCritiques.map((p, i) => (
                        <tr
                          key={p.id}
                          className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${
                            i % 2 === 1 ? 'bg-muted/10' : ''
                          }`}
                        >
                          <td className="px-4 py-2.5 font-mono text-[11px] font-semibold text-text-primary">
                            {p.reference ?? p.sku}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-text-primary">{p.name}</td>
                          <td className="px-4 py-2.5 text-xs text-text-secondary">{p.category ?? '—'}</td>
                          <td
                            className={`px-4 py-2.5 text-right font-mono text-xs font-bold ${
                              p.quantity <= 0 ? 'text-red-600' : 'text-amber-600'
                            }`}
                          >
                            {p.quantity}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-text-secondary">
                            {p.minStock}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {p.statut === 'rupture' ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                Rupture
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Stock bas
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── ROW 6: Activité par jour de semaine ──────────────────────────── */}
        {period === 'year' || period === 'month' ? null : (
          <div className="mt-4">
            <Card className="shadow-card">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Zap size={14} className="text-accent" /> Détail CA + Achats par période
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <ClientOnly>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={seriesChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={52} />
                      <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="CA"     fill="#E67E22" radius={[4, 4, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="Achats" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </ClientOnly>
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
