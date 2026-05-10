'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  format, isWithinInterval, parseISO,
  eachDayOfInterval, subDays, getDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ShoppingCart, Truck, Package, AlertTriangle,
  ArrowUpRight, ArrowDownRight, TrendingUp, Bell, Boxes,
} from 'lucide-react';
import { stockiniApi } from '@/lib/stockini/api';
import { money } from '@/lib/stockini/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Sale, Purchase, Product } from '@/lib/stockini/types';

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = 'day' | 'week' | 'month' | 'year' | 'custom';
interface DateRange { start: Date; end: Date; }

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day',    label: "Aujourd'hui" },
  { value: 'week',   label: 'Cette semaine' },
  { value: 'month',  label: 'Ce mois' },
  { value: 'year',   label: 'Cette année' },
  { value: 'custom', label: 'Personnalisé' },
];

const MONTH_LABELS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function n(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'string' ? parseFloat(v) || 0 : v;
}

function compactMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

function getPeriodRange(period: Period, customRange?: DateRange): DateRange {
  const now = new Date();
  switch (period) {
    case 'day':    return { start: startOfDay(now),                           end: endOfDay(now) };
    case 'week':   return { start: startOfWeek(now, { weekStartsOn: 1 }),     end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month':  return { start: startOfMonth(now),                         end: endOfMonth(now) };
    case 'year':   return { start: startOfYear(now),                          end: endOfYear(now) };
    case 'custom': return customRange ?? { start: subDays(now, 30), end: now };
  }
}

function getPrevRange(range: DateRange): DateRange {
  const ms = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - ms - 86_400_000),
    end:   new Date(range.start.getTime() - 1),
  };
}

function inRange(dateStr: string | null | undefined, range: DateRange): boolean {
  if (!dateStr) return false;
  try { return isWithinInterval(parseISO(dateStr), range); }
  catch { return false; }
}

function trendPct(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

function dayStr(d: Date): string { return format(d, 'yyyy-MM-dd'); }

// ─── KPI Card ─────────────────────────────────────────────────────────────────
type KpiColor = 'blue' | 'purple' | 'amber' | 'teal' | 'green' | 'orange' | 'red' | 'slate';

function KpiCard({
  icon: Icon, label, value, sub, trend, color,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; trend?: number; color: KpiColor;
}) {
  const styles: Record<KpiColor, string> = {
    blue:   'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    amber:  'bg-amber-100 text-amber-600',
    teal:   'bg-teal-100 text-teal-600',
    green:  'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    red:    'bg-red-100 text-red-600',
    slate:  'bg-slate-100 text-slate-500',
  };
  return (
    <Card className="shadow-card transition-shadow hover:shadow-card-hover">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={`rounded-xl p-2.5 ${styles[color]}`}>
            <Icon size={18} />
          </div>
          {trend !== undefined && (
            <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {trend >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold leading-tight text-text-primary">{value}</p>
          <p className="mt-0.5 text-xs font-medium text-text-secondary">{label}</p>
          {sub && <p className="mt-1 text-[11px] text-text-muted">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, fmt }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string; fmt?: (v: number, name: string) => string;
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

// ─── Stock badge ──────────────────────────────────────────────────────────────
function StockBadge({ p }: { p: Product }) {
  if (p.quantity <= 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />Rupture
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Stock bas
    </span>
  );
}

// ─── Client-only wrapper ──────────────────────────────────────────────────────
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="flex h-full items-center justify-center text-xs text-text-muted">Chargement…</div>;
  return <>{children}</>;
}

// ─── Build series helpers ─────────────────────────────────────────────────────
function buildSalesSeries(period: Period, range: DateRange, filteredSales: Sale[]) {
  if (period === 'year') {
    return MONTH_LABELS.map((lbl, i) => {
      const mStart = new Date(range.start.getFullYear(), i, 1);
      const mEnd   = endOfMonth(mStart);
      const mRange = { start: mStart, end: mEnd };
      const dayS   = filteredSales.filter(s => inRange(s.createdAt, mRange));
      return { label: lbl, CA: Math.round(dayS.reduce((a, s) => a + n(s.total), 0)), Ventes: dayS.length };
    });
  }
  const days = eachDayOfInterval({ start: range.start, end: range.end }).slice(0, 92);
  return days.map(day => {
    const ds   = dayStr(day);
    const lbl  = period === 'week' ? format(day, 'EEE', { locale: fr }) : format(day, 'dd/MM');
    const dayS = filteredSales.filter(s => dayStr(parseISO(s.createdAt)) === ds);
    return { label: lbl, CA: Math.round(dayS.reduce((a, s) => a + n(s.total), 0)), Ventes: dayS.length };
  });
}

function buildPurchaseSeries(period: Period, range: DateRange, filteredPurch: Purchase[]) {
  if (period === 'year') {
    return MONTH_LABELS.map((lbl, i) => {
      const mStart = new Date(range.start.getFullYear(), i, 1);
      const mEnd   = endOfMonth(mStart);
      const mRange = { start: mStart, end: mEnd };
      return { label: lbl, Achats: filteredPurch.filter(p => inRange(p.createdAt, mRange)).length };
    });
  }
  const days = eachDayOfInterval({ start: range.start, end: range.end }).slice(0, 92);
  return days.map(day => {
    const ds  = dayStr(day);
    const lbl = period === 'week' ? format(day, 'EEE', { locale: fr }) : format(day, 'dd/MM');
    return { label: lbl, Achats: filteredPurch.filter(p => dayStr(parseISO(p.createdAt)) === ds).length };
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SimpleDashboard() {
  const [period, setPeriod]           = useState<Period>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');

  const customRange = useMemo<DateRange | undefined>(() => {
    if (customStart && customEnd) {
      try { return { start: parseISO(customStart), end: endOfDay(parseISO(customEnd)) }; }
      catch { return undefined; }
    }
    return undefined;
  }, [customStart, customEnd]);

  const range     = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);
  const prevRange = useMemo(() => getPrevRange(range), [range]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: sales = [] }     = useQuery({ queryKey: ['op-sales'],     queryFn: stockiniApi.sales,            staleTime: 30_000 });
  const { data: purchases = [] } = useQuery({ queryKey: ['op-purchases'], queryFn: stockiniApi.purchases,        staleTime: 30_000 });
  const { data: products = [] }  = useQuery({ queryKey: ['op-products'],  queryFn: () => stockiniApi.products(), staleTime: 60_000 });
  const { data: alerts = [] }    = useQuery({ queryKey: ['op-alerts'],    queryFn: stockiniApi.alerts,           staleTime: 30_000 });
  const { data: topSelling }     = useQuery({ queryKey: ['op-topsell'],   queryFn: stockiniApi.topSelling,       staleTime: 60_000 });

  // ── Filtered slices ───────────────────────────────────────────────────────
  const activeSales   = useMemo(() => sales.filter(s => s.status !== 'CANCELLED'),    [sales]);
  const filteredSales = useMemo(() => activeSales.filter(s => inRange(s.createdAt, range)),     [activeSales, range]);
  const prevSales     = useMemo(() => activeSales.filter(s => inRange(s.createdAt, prevRange)), [activeSales, prevRange]);

  const activePurch   = useMemo(() => purchases.filter(p => p.status !== 'CANCELLED'), [purchases]);
  const filteredPurch = useMemo(() => activePurch.filter(p => inRange(p.createdAt, range)),     [activePurch, range]);
  const prevPurch     = useMemo(() => activePurch.filter(p => inRange(p.createdAt, prevRange)), [activePurch, prevRange]);

  // ── Operational KPIs ──────────────────────────────────────────────────────
  const pendingOrders  = useMemo(() => filteredSales.filter(s => s.status === 'PENDING' || s.status === 'CONFIRMED'), [filteredSales]);
  const pendingRecept  = useMemo(() => filteredPurch.filter(p => p.status === 'PENDING' || p.status === 'ORDERED'),   [filteredPurch]);

  const ruptureProds   = useMemo(() => products.filter(p => p.quantity <= 0),                               [products]);
  const lowProds       = useMemo(() => products.filter(p => p.quantity > 0 && p.quantity <= p.minStock),    [products]);
  const criticalProds  = useMemo(() => [...ruptureProds, ...lowProds].sort((a, b) => a.quantity - b.quantity).slice(0, 10), [ruptureProds, lowProds]);

  const unreadAlerts   = useMemo(() => alerts.filter(a => !a.isRead).length, [alerts]);
  const stockAlerts    = useMemo(() => alerts.filter(a => a.type === 'LOW_STOCK' || a.type === 'OUT_OF_STOCK').length, [alerts]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const salesSeries = useMemo(() => buildSalesSeries(period, range, filteredSales),   [period, range, filteredSales]);
  const purchSeries = useMemo(() => buildPurchaseSeries(period, range, filteredPurch), [period, range, filteredPurch]);

  const weeklyData = useMemo(() => {
    const DOW    = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    filteredSales.forEach(s => {
      try { const dow = (getDay(parseISO(s.createdAt)) + 6) % 7; counts[dow]++; }
      catch { /* noop */ }
    });
    return DOW.map((lbl, i) => ({ label: lbl, Ventes: counts[i] }));
  }, [filteredSales]);

  const topProductsData = useMemo(() => {
    if (!topSelling) return [];
    const arr: unknown[] = Array.isArray(topSelling) ? topSelling : ((topSelling as { data?: unknown[] }).data ?? []);
    return arr.slice(0, 8).map(item => {
      const it = item as Record<string, unknown>;
      return {
        name:     String(it.productName ?? it.name ?? (it.product as { name?: string } | null)?.name ?? 'Inconnu').substring(0, 25),
        Quantité: Number(it.totalQuantity ?? it.quantitySold ?? it.quantity ?? 0),
      };
    }).reverse();
  }, [topSelling]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="app-page-title">Dashboard</h1>
          <p className="app-page-subtitle">Vue opérationnelle — Stockini</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-white p-1 shadow-sm">
            {PERIOD_OPTIONS.map(opt => (
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
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="text-xs focus:outline-none" />
              <span className="text-text-muted">→</span>
              <input type="date" value={customEnd}   onChange={e => setCustomEnd(e.target.value)}   className="text-xs focus:outline-none" />
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          KPI ROW 1 — Activité commerciale
      ══════════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionDivider label="Activité commerciale" />
        <div className="mt-3 grid gap-4 grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={ShoppingCart}
            label="Ventes (période)"
            value={filteredSales.length}
            trend={trendPct(filteredSales.length, prevSales.length)}
            color="blue"
            sub={`${prevSales.length} période précédente`}
          />
          <KpiCard
            icon={Truck}
            label="Achats / commandes"
            value={filteredPurch.length}
            trend={trendPct(filteredPurch.length, prevPurch.length)}
            color="purple"
            sub={`${prevPurch.length} période précédente`}
          />
          <KpiCard
            icon={ShoppingCart}
            label="Commandes en attente"
            value={pendingOrders.length}
            color="amber"
            sub="Clients non encore livrés"
          />
          <KpiCard
            icon={Truck}
            label="Réceptions en attente"
            value={pendingRecept.length}
            color="teal"
            sub="Commandes fournisseurs"
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          KPI ROW 2 — Stock & Alertes
      ══════════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionDivider label="Stock & Alertes" />
        <div className="mt-3 grid gap-4 grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={Package}
            label="Produits en stock"
            value={products.length}
            color="green"
            sub={`${products.reduce((a, p) => a + p.quantity, 0).toLocaleString()} unités totales`}
          />
          <KpiCard
            icon={AlertTriangle}
            label="Produits sous seuil"
            value={lowProds.length}
            color="orange"
            sub="Stock bas — à réapprovisionner"
          />
          <KpiCard
            icon={Boxes}
            label="Ruptures de stock"
            value={ruptureProds.length}
            color="red"
            sub="Quantité = 0"
          />
          <KpiCard
            icon={Bell}
            label="Alertes stock"
            value={stockAlerts}
            color={unreadAlerts > 0 ? 'red' : 'slate'}
            sub={`${unreadAlerts} non lue${unreadAlerts !== 1 ? 's' : ''}`}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          CHARTS
      ══════════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionDivider label="Graphiques" />

        {/* ── Row 1 : Évolution ventes + Ventes par jour ──────────────────── */}
        <div className="mt-3 grid gap-4 xl:grid-cols-2">

          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp size={14} className="text-accent" /> Évolution des ventes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={salesSeries} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gOpSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#E67E22" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#E67E22" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                    <Area
                      type="monotone" dataKey="CA" name="CA"
                      stroke="#E67E22" fill="url(#gOpSales)" strokeWidth={2.5}
                      dot={false} activeDot={{ r: 4, fill: '#E67E22', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShoppingCart size={14} className="text-accent" /> Ventes par jour de semaine
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={weeklyData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="Ventes" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 2 : Achats par période + Top produits ────────────────────── */}
        <div className="mt-4 grid gap-4 xl:grid-cols-2">

          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Truck size={14} className="text-accent" /> Achats par période
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={purchSeries} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="Achats" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package size={14} className="text-accent" /> Top produits vendus
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {topProductsData.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune donnée disponible</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topProductsData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: '#5A6A7E' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="Quantité" fill="#10B981" radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ClientOnly>
            </CardContent>
          </Card>
        </div>

        {/* ── Row 3 : Produits sous seuil & ruptures ──────────────────────── */}
        <div className="mt-4">
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle size={14} className="text-orange-500" /> Produits sous seuil & ruptures
                </CardTitle>
                <div className="flex gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
                    {ruptureProds.length} rupture{ruptureProds.length !== 1 ? 's' : ''}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    {lowProds.length} sous seuil
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {criticalProds.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-muted">
                  Aucun produit en stock critique — tout est OK ✓
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {['Référence', 'Désignation', 'Famille', 'Qté', 'Seuil', 'Statut'].map(h => (
                          <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold text-text-secondary ${
                            ['Qté', 'Seuil'].includes(h) ? 'text-right' : h === 'Statut' ? 'text-center' : 'text-left'
                          }`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {criticalProds.map((p, i) => (
                        <tr key={p.id} className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="px-4 py-2.5 font-mono text-[11px] font-semibold text-text-primary">{p.reference ?? p.sku}</td>
                          <td className="px-4 py-2.5 text-xs text-text-primary">{p.name}</td>
                          <td className="px-4 py-2.5 text-xs text-text-secondary">{p.category?.name ?? '—'}</td>
                          <td className={`px-4 py-2.5 text-right font-mono text-xs font-bold ${p.quantity <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                            {p.quantity}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-text-secondary">{p.minStock}</td>
                          <td className="px-4 py-2.5 text-center"><StockBadge p={p} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
