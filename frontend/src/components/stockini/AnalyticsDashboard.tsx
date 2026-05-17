'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  format, isWithinInterval, parseISO,
  eachDayOfInterval, getDay, subDays,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Package, TrendingUp, AlertTriangle, Users, ShoppingCart,
  Boxes, DollarSign, Activity, BarChart2, ArrowUpRight,
  ArrowDownRight, RefreshCw, Layers, Target, Zap, Truck,
  TrendingDown,
} from 'lucide-react';
import { stockiniApi } from '@/lib/stockini/api';
import { money } from '@/lib/stockini/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Sale, Purchase, Product, StockMovement } from '@/lib/stockini/types';

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = 'day' | 'week' | 'month' | 'year' | 'custom';
interface DateRange { start: Date; end: Date; }

// ─── Constants ────────────────────────────────────────────────────────────────
const C = [
  '#E67E22', '#2563EB', '#10B981', '#8B5CF6',
  '#14B8A6', '#F59E0B', '#EC4899', '#6366F1', '#EF4444', '#06B6D4',
];

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

// ─── Reusable KPI Card ────────────────────────────────────────────────────────
type KpiColor = 'default' | 'green' | 'orange' | 'red' | 'blue' | 'purple' | 'teal';

function KpiCard({
  icon: Icon, label, value, sub, trend, color = 'default',
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; trend?: number; color?: KpiColor;
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
          <p className="truncate text-xl font-bold leading-tight text-text-primary">{value}</p>
          <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
          {sub && <p className="mt-1 text-[11px] text-text-muted">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
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

// ─── Custom chart tooltip ─────────────────────────────────────────────────────
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

// ─── Client-only wrapper (avoids recharts SSR mismatch) ───────────────────────
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="flex h-full items-center justify-center text-xs text-text-muted">Chargement…</div>;
  return <>{children}</>;
}

// ─── Stock badge ──────────────────────────────────────────────────────────────
function StockBadge({ p }: { p: Product }) {
  if (p.quantity <= 0)
    return <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Rupture</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Stock bas</span>;
}

// ─── Build time-series buckets ────────────────────────────────────────────────
function buildSeries(
  period: Period,
  range: DateRange,
  filteredSales: Sale[],
  filteredPurchases: Purchase[],
) {
  if (period === 'year') {
    return MONTH_LABELS.map((lbl, i) => {
      const mStart = new Date(range.start.getFullYear(), i, 1);
      const mEnd   = endOfMonth(mStart);
      const mRange = { start: mStart, end: mEnd };
      const sv = filteredSales.filter(s => inRange(s.createdAt, mRange)).reduce((a, s) => a + n(s.total), 0);
      const pv = filteredPurchases.filter(p => inRange(p.createdAt, mRange)).reduce((a, p) => a + n(p.total), 0);
      return { label: lbl, Ventes: Math.round(sv), Achats: Math.round(pv) };
    });
  }
  const days = eachDayOfInterval({ start: range.start, end: range.end }).slice(0, 92);
  return days.map(day => {
    const ds  = dayStr(day);
    const lbl = period === 'week'
      ? format(day, 'EEE', { locale: fr })
      : period === 'day'
        ? format(day, 'dd/MM')
        : format(day, 'dd/MM');
    const sv = filteredSales.filter(s => dayStr(parseISO(s.createdAt)) === ds).reduce((a, s) => a + n(s.total), 0);
    const pv = filteredPurchases.filter(p => dayStr(parseISO(p.createdAt)) === ds).reduce((a, p) => a + n(p.total), 0);
    return { label: lbl, Ventes: Math.round(sv), Achats: Math.round(pv) };
  });
}

function buildStockSeries(
  period: Period,
  range: DateRange,
  filteredMovements: StockMovement[],
) {
  if (period === 'year') {
    return MONTH_LABELS.map((lbl, i) => {
      const mStart = new Date(range.start.getFullYear(), i, 1);
      const mEnd   = endOfMonth(mStart);
      const mRange = { start: mStart, end: mEnd };
      const mMovs  = filteredMovements.filter(m => inRange(m.createdAt, mRange));
      return {
        label: lbl,
        Entrées: mMovs.filter(m => m.type === 'ENTRY').reduce((a, m) => a + m.quantity, 0),
        Sorties: mMovs.filter(m => m.type === 'EXIT').reduce((a, m) => a + m.quantity, 0),
      };
    });
  }
  const days = eachDayOfInterval({ start: range.start, end: range.end }).slice(0, 92);
  return days.map(day => {
    const ds  = dayStr(day);
    const lbl = period === 'week'
      ? format(day, 'EEE', { locale: fr })
      : format(day, 'dd/MM');
    const dayMovs = filteredMovements.filter(m => dayStr(parseISO(m.createdAt)) === ds);
    return {
      label: lbl,
      Entrées: dayMovs.filter(m => m.type === 'ENTRY').reduce((a, m) => a + m.quantity, 0),
      Sorties: dayMovs.filter(m => m.type === 'EXIT').reduce((a, m) => a + m.quantity, 0),
    };
  });
}

// ─── Main Dashboard Component ─────────────────────────────────────────────────
export function AnalyticsDashboard() {
  const [period, setPeriod]       = useState<Period>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');

  const customRange = useMemo<DateRange | undefined>(() => {
    if (customStart && customEnd) {
      try {
        return { start: parseISO(customStart), end: endOfDay(parseISO(customEnd)) };
      } catch { return undefined; }
    }
    return undefined;
  }, [customStart, customEnd]);

  const range     = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);
  const prevRange = useMemo(() => getPrevRange(range), [range]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: dashboard }           = useQuery({ queryKey: ['db-dash'],      queryFn: stockiniApi.dashboard,  staleTime: 60_000 });
  const { data: stockVal }            = useQuery({ queryKey: ['db-stockval'],   queryFn: stockiniApi.stockValue, staleTime: 60_000 });
  const { data: topSelling }          = useQuery({ queryKey: ['db-topsell'],    queryFn: stockiniApi.topSelling, staleTime: 60_000 });
  const { data: products = [] }       = useQuery({ queryKey: ['db-products'],   queryFn: () => stockiniApi.products(), staleTime: 60_000 });
  const { data: salesResp }           = useQuery({ queryKey: ['db-sales'],      queryFn: () => stockiniApi.sales(),     staleTime: 30_000 });
  const { data: purchasesResp }       = useQuery({ queryKey: ['db-purchases'],  queryFn: () => stockiniApi.purchases(), staleTime: 30_000 });
  const sales:     Sale[]     = Array.isArray(salesResp?.data)     ? salesResp.data     : [];
  const purchases: Purchase[] = Array.isArray(purchasesResp?.data) ? purchasesResp.data : [];
  const { data: customers = [] }      = useQuery({ queryKey: ['db-customers'],  queryFn: stockiniApi.customers,  staleTime: 60_000 });
  const { data: alerts = [] }         = useQuery({ queryKey: ['db-alerts'],     queryFn: stockiniApi.alerts,     staleTime: 30_000 });
  const { data: movementsResp }        = useQuery({ queryKey: ['db-movements'],  queryFn: () => stockiniApi.movements({ limit: 100 }), staleTime: 30_000 });
  const movements = Array.isArray(movementsResp?.data) ? movementsResp.data : [];

  // ── Filtered slices ───────────────────────────────────────────────────────
  const activeSales    = useMemo(() => sales.filter(s => s.status !== 'CANCELLED'), [sales]);
  const filteredSales  = useMemo(() => activeSales.filter(s => inRange(s.createdAt, range)),     [activeSales, range]);
  const prevSales      = useMemo(() => activeSales.filter(s => inRange(s.createdAt, prevRange)), [activeSales, prevRange]);

  const activePurch    = useMemo(() => purchases.filter(p => p.status !== 'CANCELLED'), [purchases]);
  const filteredPurch  = useMemo(() => activePurch.filter(p => inRange(p.createdAt, range)),     [activePurch, range]);
  const prevPurch      = useMemo(() => activePurch.filter(p => inRange(p.createdAt, prevRange)), [activePurch, prevRange]);

  const filteredMovs   = useMemo(() => movements.filter(m => inRange(m.createdAt, range)), [movements, range]);

  // ── Scalar KPIs ───────────────────────────────────────────────────────────
  const salesTotal     = useMemo(() => filteredSales.reduce((a, s) => a + n(s.total), 0), [filteredSales]);
  const prevSalesTotal = useMemo(() => prevSales.reduce((a, s) => a + n(s.total), 0),     [prevSales]);
  const salesPaid      = useMemo(() => filteredSales.reduce((a, s) => a + n(s.paidAmount), 0),     [filteredSales]);
  const salesUnpaid    = useMemo(() => filteredSales.reduce((a, s) => a + n(s.remainingAmount), 0), [filteredSales]);
  const avgBasket      = filteredSales.length > 0 ? salesTotal / filteredSales.length : 0;

  const purchTotal     = useMemo(() => filteredPurch.reduce((a, p) => a + n(p.total), 0), [filteredPurch]);
  const prevPurchTotal = useMemo(() => prevPurch.reduce((a, p) => a + n(p.total), 0),     [prevPurch]);
  const purchUnpaid    = useMemo(() => filteredPurch.reduce((a, p) => a + n(p.remainingAmount), 0), [filteredPurch]);
  const activeSuppIds  = useMemo(() => new Set(filteredPurch.map(p => p.supplier?.id).filter(Boolean)), [filteredPurch]);

  // ── Financial summary KPIs ────────────────────────────────────────────────
  const purchPaid      = purchTotal - purchUnpaid;
  const benefice       = salesTotal - purchTotal;
  const margeRate      = salesTotal > 0 ? ((benefice / salesTotal) * 100).toFixed(1) : '0.0';
  const stockPurchaseValue = n(stockVal?.purchaseValue);
  const stockSaleValue     = n(stockVal?.saleValue);

  // ── Top clients by revenue ────────────────────────────────────────────────
  const topClientsData = useMemo(() => {
    const map: Record<string, { name: string; CA: number; unpaid: number }> = {};
    filteredSales.forEach(s => {
      const sAny     = s as unknown as Record<string, unknown>;
      const customer = sAny.customer as { id?: string; name?: string } | null;
      const id       = customer?.id ?? String(sAny.customerId ?? 'anon');
      const name     = String(customer?.name ?? sAny.customerName ?? 'Client divers').substring(0, 22);
      if (!map[id]) map[id] = { name, CA: 0, unpaid: 0 };
      map[id].CA     += n(s.total);
      map[id].unpaid += n(s.remainingAmount);
    });
    return Object.values(map).sort((a, b) => b.CA - a.CA).slice(0, 8).reverse();
  }, [filteredSales]);

  // ── Top fournisseurs by spend ─────────────────────────────────────────────
  const topSuppliersData = useMemo(() => {
    const map: Record<string, { name: string; total: number; unpaid: number }> = {};
    filteredPurch.forEach(p => {
      const pAny = p as unknown as Record<string, unknown>;
      const sup  = pAny.supplier as { id?: string; name?: string } | null;
      const id   = sup?.id ?? 'anon';
      const name = String(sup?.name ?? 'Fournisseur divers').substring(0, 22);
      if (!map[id]) map[id] = { name, total: 0, unpaid: 0 };
      map[id].total  += n(p.total);
      map[id].unpaid += n(p.remainingAmount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 8).reverse();
  }, [filteredPurch]);

  const activeProds    = useMemo(() => products.filter(p => p.isActive),            [products]);
  const ruptureProds   = useMemo(() => products.filter(p => p.quantity <= 0),       [products]);
  const lowProds       = useMemo(() => products.filter(p => p.quantity > 0 && p.quantity <= p.minStock), [products]);
  const criticalProds  = useMemo(() => [...ruptureProds, ...lowProds].sort((a, b) => a.quantity - b.quantity).slice(0, 12), [ruptureProds, lowProds]);

  const totalQtyStock  = useMemo(() => products.reduce((a, p) => a + p.quantity, 0), [products]);
  const stockEntries   = useMemo(() => filteredMovs.filter(m => m.type === 'ENTRY').reduce((a, m) => a + m.quantity, 0), [filteredMovs]);
  const stockExits     = useMemo(() => filteredMovs.filter(m => m.type === 'EXIT').reduce((a, m) => a + m.quantity, 0),  [filteredMovs]);

  const activeCustomers = useMemo(() => customers.filter(c => !c.deletedAt), [customers]);
  const garageCount     = useMemo(() => activeCustomers.filter(c => c.type === 'GARAGE').length,    [activeCustomers]);
  const companyCount    = useMemo(() => activeCustomers.filter(c => c.type === 'COMPANY').length,   [activeCustomers]);
  const unreadAlerts    = useMemo(() => alerts.filter(a => !a.isRead).length, [alerts]);
  const lowStockAlerts  = useMemo(() => alerts.filter(a => a.type === 'LOW_STOCK' || a.type === 'OUT_OF_STOCK').length, [alerts]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const seriesData = useMemo(
    () => buildSeries(period, range, filteredSales, filteredPurch),
    [period, range, filteredSales, filteredPurch],
  );

  const stockSeriesData = useMemo(
    () => buildStockSeries(period, range, filteredMovs),
    [period, range, filteredMovs],
  );

  const topProductsData = useMemo(() => {
    if (!topSelling) return [];
    const arr: unknown[] = Array.isArray(topSelling) ? topSelling : ((topSelling as { data?: unknown[] }).data ?? []);
    return arr.slice(0, 10).map((item) => {
      const it = item as Record<string, unknown>;
      return {
        name: String(it.productName ?? it.name ?? (it.product as { name?: string } | null)?.name ?? 'Inconnu').substring(0, 28),
        Quantité: Number(it.totalQuantity ?? it.quantitySold ?? it.quantity ?? 0),
        Montant:  Math.round(Number(it.totalRevenue ?? it.revenue ?? it.total ?? 0)),
      };
    }).reverse();
  }, [topSelling]);

  const categoryData = useMemo(() => {
    const byCategory: Record<string, number> = {};

    if (topSelling) {
      const arr: unknown[] = Array.isArray(topSelling) ? topSelling : ((topSelling as { data?: unknown[] }).data ?? []);
      arr.forEach(item => {
        const it = item as Record<string, unknown>;
        const cat = String(it.category ?? it.categoryName ?? (it.product as { category?: { name?: string } } | null)?.category?.name ?? 'Autre');
        byCategory[cat] = (byCategory[cat] ?? 0) + Number(it.totalRevenue ?? it.revenue ?? 0);
      });
      if (Object.keys(byCategory).length > 1) {
        return Object.entries(byCategory).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
      }
    }

    // Fallback: stock value by category
    products.forEach(p => {
      const cat = p.category?.name ?? 'Autre';
      byCategory[cat] = (byCategory[cat] ?? 0) + n(p.salePrice) * p.quantity;
    });
    return Object.entries(byCategory).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [topSelling, products]);

  const weeklyData = useMemo(() => {
    const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const totals = [0, 0, 0, 0, 0, 0, 0];
    filteredSales.forEach(s => {
      try {
        const dow = (getDay(parseISO(s.createdAt)) + 6) % 7;
        counts[dow]++;
        totals[dow] += n(s.total);
      } catch { /* noop */ }
    });
    return DOW.map((lbl, i) => ({ label: lbl, Ventes: counts[i], Montant: Math.round(totals[i]) }));
  }, [filteredSales]);

  // Estimated margin from sales vs purchases in the same period
  const beneficeData = useMemo(() => {
    return seriesData.map(row => ({
      ...row,
      Bénéfice: Math.max(0, row.Ventes - row.Achats),
    }));
  }, [seriesData]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">

      {/* ── Top bar: title + period filter ─────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="app-page-title">Rapports — Analyse complète</h1>
          <p className="app-page-subtitle">Vue financière et opérationnelle détaillée — Stockini</p>
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
              <input
                type="date" value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="text-xs focus:outline-none"
              />
              <span className="text-text-muted">→</span>
              <input
                type="date" value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="text-xs focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          KPI SECTION 0 — SYNTHÈSE FINANCIÈRE
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={DollarSign} title="Synthèse financière" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <KpiCard icon={DollarSign}    label="Chiffre d'affaires"    value={money(salesTotal)}          trend={trendPct(salesTotal, prevSalesTotal)}  color="orange" />
          <KpiCard icon={TrendingUp}    label="Encaissements clients"  value={money(salesPaid)}           color="green" />
          <KpiCard icon={AlertTriangle} label="Impayé clients"         value={money(salesUnpaid)}                                                       color="red" />
          <KpiCard icon={TrendingUp}    label="Bénéfice estimé"        value={money(benefice)}            sub={`Marge : ${margeRate}%`}                 color={benefice >= 0 ? 'green' : 'red'} />
          <KpiCard icon={ShoppingCart}  label="Total achats"           value={money(purchTotal)}          trend={trendPct(purchTotal, prevPurchTotal)}  color="blue" />
          <KpiCard icon={Truck}         label="Dépenses fournisseurs"  value={money(purchPaid)}           sub={purchTotal > 0 ? `${((purchPaid / purchTotal) * 100).toFixed(0)}% réglé` : undefined} color="teal" />
          <KpiCard icon={AlertTriangle} label="Impayé fournisseurs"    value={money(purchUnpaid)}                                                       color="orange" />
          <KpiCard icon={Boxes}         label="Valeur stock (achat)"   value={money(stockPurchaseValue)}  sub={`Vente : ${money(stockSaleValue)}`}      color="purple" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          KPI SECTION 1 — VENTES
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={DollarSign} title="Ventes" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard icon={DollarSign}   label="CA période"      value={money(salesTotal)}        trend={trendPct(salesTotal, prevSalesTotal)}          color="orange" />
          <KpiCard icon={TrendingUp}   label="Nb ventes"       value={filteredSales.length}      trend={trendPct(filteredSales.length, prevSales.length)} color="blue" />
          <KpiCard icon={Activity}     label="Panier moyen"    value={money(avgBasket)}                                                                color="purple" />
          <KpiCard icon={DollarSign}   label="Encaissé"        value={money(salesPaid)}                                                                color="green" />
          <KpiCard icon={AlertTriangle} label="Impayé clients" value={money(salesUnpaid)}                                                              color="red" />
          <KpiCard icon={RefreshCw}    label="Annulées"        value={sales.filter(s => s.status === 'CANCELLED' && inRange(s.createdAt, range)).length} color="default" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          KPI SECTION 2 — PRODUITS & STOCK
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={Package} title="Produits & Stock" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard icon={Package}      label="Total produits"   value={products.length}              color="blue" />
          <KpiCard icon={Package}      label="Produits actifs"  value={activeProds.length}           color="green" />
          <KpiCard icon={AlertTriangle} label="Ruptures stock"  value={ruptureProds.length}          color="red" />
          <KpiCard icon={AlertTriangle} label="Sous seuil"      value={lowProds.length}              color="orange" />
          <KpiCard icon={Boxes}        label="Qtté en stock"    value={totalQtyStock.toLocaleString()} color="teal" />
          <KpiCard icon={Boxes}        label="Valeur vente"     value={money(stockVal?.saleValue ?? 0)} color="purple" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          KPI SECTION 3 — ACHATS
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={ShoppingCart} title="Achats" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <KpiCard icon={ShoppingCart} label="Total achats"     value={money(purchTotal)}          trend={trendPct(purchTotal, prevPurchTotal)} color="blue" />
          <KpiCard icon={Layers}       label="Nb commandes"     value={filteredPurch.length}        trend={trendPct(filteredPurch.length, prevPurch.length)} color="purple" />
          <KpiCard icon={Truck}        label="Fournisseurs actifs" value={activeSuppIds.size}       color="teal" />
          <KpiCard icon={AlertTriangle} label="Impayé fournisseurs" value={money(purchUnpaid)}     color="orange" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          KPI SECTION 4 — CLIENTS & ALERTES
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={Users} title="Clients & Alertes" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <KpiCard icon={Users}        label="Total clients"    value={activeCustomers.length}      color="blue" />
          <KpiCard icon={Users}        label="Garages"          value={garageCount}                 color="green" />
          <KpiCard icon={Users}        label="Entreprises"      value={companyCount}                color="purple" />
          <KpiCard icon={AlertTriangle} label="Alertes stock"   value={lowStockAlerts} sub={`${unreadAlerts} non lues`} color="red" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          KPI SECTION 5 — MOUVEMENTS STOCK (période)
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={Boxes} title="Mouvements stock (période)" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <KpiCard icon={TrendingUp}   label="Entrées stock"    value={stockEntries.toLocaleString()} color="green" />
          <KpiCard icon={TrendingDown} label="Sorties stock"    value={stockExits.toLocaleString()}   color="red" />
          <KpiCard icon={RefreshCw}    label="Mouvements total" value={filteredMovs.length}           color="blue" />
          <KpiCard icon={Target}       label="Valeur achat stock" value={money(stockVal?.purchaseValue ?? 0)} color="teal" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          CHARTS — ROW 1: Sales evolution + Stock movements
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={BarChart2} title="Graphiques analytiques" />

        <div className="grid gap-4 xl:grid-cols-2">

          {/* Chart 1 — Évolution des ventes */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp size={14} className="text-accent" /> Évolution des ventes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={seriesData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gVentes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#E67E22" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#E67E22" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                    <Area
                      type="monotone" dataKey="Ventes" name="Ventes"
                      stroke="#E67E22" fill="url(#gVentes)" strokeWidth={2.5}
                      dot={false} activeDot={{ r: 4, fill: '#E67E22', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>

          {/* Chart 2 — Mouvements stock */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Boxes size={14} className="text-accent" /> Mouvements de stock
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stockSeriesData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="Entrées" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="Sorties" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>
        </div>

        {/* ─── ROW 2: Top products + Category donut ─────────────────────── */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">

          {/* Chart 3 — Top produits */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target size={14} className="text-accent" /> Top 10 produits vendus
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {topProductsData.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune donnée disponible</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topProductsData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
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

          {/* Chart 4 — Répartition par catégorie */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity size={14} className="text-accent" /> Répartition par famille
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {categoryData.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune donnée disponible</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChart>
                        <Pie
                          data={categoryData} cx="50%" cy="50%"
                          innerRadius={58} outerRadius={95}
                          paddingAngle={2} dataKey="value"
                          stroke="none"
                        >
                          {categoryData.map((_, i) => (
                            <Cell key={i} fill={C[i % C.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => money(Number(v ?? 0))} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
                      {categoryData.map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: C[i % C.length] }} />
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

        {/* ─── ROW 3: Achats vs Ventes + Activité hebdomadaire ─────────────── */}
        <div className="mt-4 grid gap-4 xl:grid-cols-2">

          {/* Chart 7 — Achats vs Ventes (+ bénéfice) */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart2 size={14} className="text-accent" /> Achats vs Ventes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={beneficeData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="Ventes"   stroke="#E67E22" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Achats"   stroke="#2563EB" strokeWidth={2}   dot={false} activeDot={{ r: 4 }} strokeDasharray="5 3" />
                    <Line type="monotone" dataKey="Bénéfice" stroke="#10B981" strokeWidth={2}   dot={false} activeDot={{ r: 4 }} strokeDasharray="3 2" />
                  </LineChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>

          {/* Chart 6 — Activité hebdomadaire */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap size={14} className="text-accent" /> Activité par jour de semaine
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={weeklyData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTip fmt={(v, name) => name === 'Montant' ? money(v) : String(v)} />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="Ventes" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="Montant" fill="#E67E22" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </ClientOnly>
            </CardContent>
          </Card>
        </div>

        {/* ─── ROW 4: Critical stock table ──────────────────────────────────── */}
        <div className="mt-4">
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle size={14} className="text-red-500" /> Alertes stock critique
                </CardTitle>
                <div className="flex gap-2">
                  <Badge className="border-red-200 bg-red-50 text-red-700 text-[11px]">
                    {ruptureProds.length} rupture{ruptureProds.length !== 1 ? 's' : ''}
                  </Badge>
                  <Badge className="border-amber-200 bg-amber-50 text-amber-700 text-[11px]">
                    {lowProds.length} sous seuil
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {criticalProds.length === 0 ? (
                <p className="py-10 text-center text-sm text-text-muted">
                  Aucun produit en stock critique — tout est OK ✓
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {['Référence', 'Désignation', 'Famille', 'Qté', 'Seuil', 'Statut'].map(h => (
                          <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold text-text-secondary ${h === 'Qté' || h === 'Seuil' ? 'text-right' : h === 'Statut' ? 'text-center' : 'text-left'}`}>
                            {h}
                          </th>
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
                          <td className="px-4 py-2.5 text-center">
                            <StockBadge p={p} />
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

        {/* ─── ROW 5: Top Clients + Top Fournisseurs ────────────────────── */}
        <div className="mt-4 grid gap-4 xl:grid-cols-2">

          {/* Top clients par CA */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users size={14} className="text-accent" /> Top clients par chiffre d'affaires
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {topClientsData.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune donnée disponible</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={topClientsData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: '#5A6A7E' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                      <Bar dataKey="CA" name="CA" fill="#E67E22" radius={[0, 4, 4, 0]} maxBarSize={18} />
                      <Bar dataKey="unpaid" name="Impayé" fill="#EF4444" radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ClientOnly>
            </CardContent>
          </Card>

          {/* Top fournisseurs par dépenses */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Truck size={14} className="text-accent" /> Top fournisseurs par dépenses
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ClientOnly>
                {topSuppliersData.length === 0 ? (
                  <p className="py-10 text-center text-xs text-text-muted">Aucune donnée disponible</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={topSuppliersData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 10, fill: '#9AAFC5' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: '#5A6A7E' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip fmt={(v) => money(v)} />} />
                      <Bar dataKey="total" name="Total achats" fill="#2563EB" radius={[0, 4, 4, 0]} maxBarSize={18} />
                      <Bar dataKey="unpaid" name="Impayé" fill="#F59E0B" radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ClientOnly>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
