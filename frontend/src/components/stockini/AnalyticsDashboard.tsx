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
  Boxes, DollarSign, Activity, BarChart2,
  RefreshCw, Layers, Target, Zap, Truck,
  TrendingDown, Loader2, AlertCircle, Download,
  SlidersHorizontal, X, CalendarDays,
} from 'lucide-react';
import { stockiniApi } from '@/lib/stockini/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SlideOver } from '@/components/ui/SlideOver';
import { SearchableFilterCombobox } from '@/components/reports/SearchableFilterCombobox';
import type { ReportFilterOption, ReportOverviewQuery, ReportPeriod, ReportOverview } from '@/lib/stockini/types';
import { KpiCard } from './shared/KpiCard';
import { formatKpiPeriod } from '@/lib/kpi-definitions';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  '#E67E22', '#2563EB', '#10B981', '#8B5CF6',
  '#14B8A6', '#F59E0B', '#EC4899', '#6366F1', '#EF4444', '#06B6D4',
];

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'today',  label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: 'last7', label: '7 jours' },
  { value: 'week',   label: 'Cette semaine' },
  { value: 'last30', label: '30 jours' },
  { value: 'month',  label: 'Ce mois' },
  { value: 'quarter', label: 'Ce trimestre' },
  { value: 'year',   label: 'Cette année' },
  { value: 'custom', label: 'Personnalisé' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compactMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

const reportMoney = new Intl.NumberFormat('fr-TN', {
  style: 'currency', currency: 'TND', minimumFractionDigits: 3, maximumFractionDigits: 3,
}).format;

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

type AdvancedFilters = Pick<ReportOverviewQuery, 'customerId' | 'productId' | 'categoryId' | 'sellerId' | 'documentType' | 'paymentStatus'>;
type FilterKey = keyof AdvancedFilters;
const EMPTY_FILTERS: AdvancedFilters = {};

const DOCUMENT_OPTIONS: ReportFilterOption[] = [
  { id: 'FACTURE', label: 'Factures' },
  { id: 'BON_LIVRAISON', label: 'Bons de livraison' },
];
const PAYMENT_OPTIONS: ReportFilterOption[] = [
  { id: 'PAID', label: 'Payé' }, { id: 'PARTIAL', label: 'Partiel' }, { id: 'UNPAID', label: 'Impayé' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  const [customDraftStart, setCustomDraftStart] = useState('');
  const [customDraftEnd, setCustomDraftEnd] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const [appliedOptions, setAppliedOptions] = useState<Partial<Record<FilterKey, ReportFilterOption>>>({});
  const [draftOptions, setDraftOptions] = useState<Partial<Record<FilterKey, ReportFilterOption>>>({});
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [sellerSearch, setSellerSearch] = useState('');
  const debouncedCustomerSearch = useDebouncedValue(customerSearch);
  const debouncedProductSearch = useDebouncedValue(productSearch);
  const debouncedSellerSearch = useDebouncedValue(sellerSearch);

  const optionQuery = (kind: 'products' | 'clients' | 'categories' | 'sellers', search: string, enabled: boolean, categoryId?: string) => ({
    queryKey: [`report-${kind}`, search, categoryId ?? ''],
    queryFn: ({ signal }: { signal: AbortSignal }) => stockiniApi.reportFilterOptions(kind, { search, categoryId, limit: kind === 'categories' ? 50 : 20 }, signal),
    enabled,
    staleTime: 300_000,
  });
  const clientsQuery = useQuery(optionQuery('clients', debouncedCustomerSearch, filtersOpen && debouncedCustomerSearch.trim().length >= 2));
  const productsQuery = useQuery(optionQuery('products', debouncedProductSearch, filtersOpen && debouncedProductSearch.trim().length >= 2, draftFilters.categoryId));
  const categoriesQuery = useQuery(optionQuery('categories', categorySearch, filtersOpen));
  const sellersQuery = useQuery(optionQuery('sellers', debouncedSellerSearch, filtersOpen && debouncedSellerSearch.trim().length >= 2));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const savedPeriod = params.get('period') as ReportPeriod | null;
    if (savedPeriod && PERIOD_OPTIONS.some((option) => option.value === savedPeriod)) setPeriod(savedPeriod);
    const restoredStart = params.get('dateFrom') ?? '';
    const restoredEnd = params.get('dateTo') ?? '';
    setCustomStart(restoredStart); setCustomEnd(restoredEnd);
    setCustomDraftStart(restoredStart); setCustomDraftEnd(restoredEnd);
    const restored: AdvancedFilters = {
      ...(params.get('customerId') && { customerId: params.get('customerId')! }),
      ...(params.get('productId') && { productId: params.get('productId')! }),
      ...(params.get('categoryId') && { categoryId: params.get('categoryId')! }),
      ...(params.get('sellerId') && { sellerId: params.get('sellerId')! }),
      ...(params.get('documentType') && { documentType: params.get('documentType') as AdvancedFilters['documentType'] }),
      ...(params.get('paymentStatus') && { paymentStatus: params.get('paymentStatus') as AdvancedFilters['paymentStatus'] }),
    };
    setAppliedFilters(restored); setDraftFilters(restored); setInitialized(true);
  }, []);

  const query = useMemo(() => {
    if (period === 'custom' && customStart && customEnd) {
      return { period, dateFrom: customStart, dateTo: customEnd, ...appliedFilters };
    }
    if (period !== 'custom') return { period, ...appliedFilters };
    return undefined;
  }, [period, customStart, customEnd, appliedFilters]);

  useEffect(() => {
    if (!query || !initialized) return;
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => value && params.set(key, String(value)));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [initialized, query]);

  const {
    data: overview,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery<ReportOverview>({
    queryKey: ['reports-overview', query],
    queryFn: () => stockiniApi.reportsOverview(query),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
    enabled: initialized && (period !== 'custom' || (!!customStart && !!customEnd)),
  });

  const exportCsv = () => {
    if (!overview || isFetching) return;
    const rows: Array<[string, string | number]> = [
      ['Indicateur', 'Valeur'],
      ['Chiffre d’affaires net HT', overview.financier.caNet],
      ['Bénéfice brut réel', overview.financier.beneficeBrut],
      ['Coût des produits vendus', overview.financier.coutProduitsVendus],
      ['Taux de marque sur vente (%)', overview.financier.tauxMarque],
      ['Taux de marge sur coût (%)', overview.financier.tauxMargeSurCout],
      ['Montant encaissé', overview.financier.encaissementsClients],
      ['Reste à encaisser', overview.financier.impayesClients],
      ['Remises accordées', overview.financier.remisesAccordees],
      ['Avoirs HT', overview.ventes.avoirs.total],
      ['Nombre de ventes', overview.ventes.count],
      ['Quantité vendue', overview.ventes.quantiteVendue],
      ['Panier moyen', overview.ventes.panierMoyen],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `rapport-stockini-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeFilterEntries = (Object.entries(appliedFilters) as Array<[FilterKey, string]>).filter(([, value]) => Boolean(value));
  const activeFilterCount = activeFilterEntries.length;
  const labels: Record<FilterKey, string> = { customerId: 'Client', productId: 'Produit', categoryId: 'Catégorie', sellerId: 'Vendeur', documentType: 'Document', paymentStatus: 'Paiement' };
  const optionsWithSelected = (key: FilterKey, options: ReportFilterOption[] = []) => {
    const selected = draftOptions[key];
    return selected && !options.some((option) => option.id === selected.id) ? [selected, ...options] : options;
  };
  const updateDraft = (key: FilterKey, value?: string, option?: ReportFilterOption) => {
    setDraftFilters((current) => {
      const next = { ...current, [key]: value || undefined };
      if (key === 'categoryId' && current.categoryId !== value) delete next.productId;
      return next;
    });
    setDraftOptions((current) => {
      const next = { ...current, [key]: option };
      if (key === 'categoryId') delete next.productId;
      return next;
    });
  };
  const clearAllAdvancedFilters = () => {
    setAppliedFilters(EMPTY_FILTERS); setDraftFilters(EMPTY_FILTERS); setAppliedOptions({}); setDraftOptions({});
  };
  const applyDraftFilters = () => { setAppliedFilters(draftFilters); setAppliedOptions(draftOptions); setFiltersOpen(false); };
  const closeFilters = () => { setDraftFilters(appliedFilters); setDraftOptions(appliedOptions); setFiltersOpen(false); };

  const comboboxProps = {
    getOptionValue: (item: ReportFilterOption) => item.id,
    getOptionLabel: (item: ReportFilterOption) => item.label,
    getOptionSecondaryLabel: (item: ReportFilterOption) => item.secondaryLabel,
  };

  const filtersPanel = (
    <SlideOver open={filtersOpen} onClose={closeFilters} title="Filtres du rapport" subtitle="Les données ne seront actualisées qu'après validation" width={720}
      footer={<><Button type="button" variant="ghost" onClick={() => { setDraftFilters(EMPTY_FILTERS); setDraftOptions({}); }}>Réinitialiser</Button><Button type="button" variant="outline" onClick={closeFilters}>Fermer</Button><Button type="button" onClick={applyDraftFilters}>Appliquer les filtres</Button></>}>
      <div className="grid gap-5 sm:grid-cols-2">
        <SearchableFilterCombobox label="Client" placeholder="Tous les clients" searchPlaceholder="Nom, téléphone, MF ou référence…" minSearchLength={2}
          value={draftFilters.customerId} options={optionsWithSelected('customerId', clientsQuery.data)} isLoading={clientsQuery.isFetching} error={clientsQuery.isError}
          onSearch={setCustomerSearch} onRetry={() => clientsQuery.refetch()} onChange={(value, option) => updateDraft('customerId', value, option)} {...comboboxProps} />
        <SearchableFilterCombobox label="Catégorie" placeholder="Toutes les catégories" searchPlaceholder="Rechercher une catégorie…"
          value={draftFilters.categoryId} options={optionsWithSelected('categoryId', categoriesQuery.data)} isLoading={categoriesQuery.isFetching} error={categoriesQuery.isError}
          onSearch={setCategorySearch} onRetry={() => categoriesQuery.refetch()} onChange={(value, option) => updateDraft('categoryId', value, option)} {...comboboxProps} />
        <SearchableFilterCombobox label="Produit" placeholder="Tous les produits" searchPlaceholder="Nom, référence, code ou code-barres…" minSearchLength={2}
          value={draftFilters.productId} options={optionsWithSelected('productId', productsQuery.data)} isLoading={productsQuery.isFetching} error={productsQuery.isError}
          onSearch={setProductSearch} onRetry={() => productsQuery.refetch()} onChange={(value, option) => updateDraft('productId', value, option)} {...comboboxProps} />
        <SearchableFilterCombobox label="Vendeur" placeholder="Tous les vendeurs" searchPlaceholder="Nom, email ou téléphone…" minSearchLength={2}
          value={draftFilters.sellerId} options={optionsWithSelected('sellerId', sellersQuery.data)} isLoading={sellersQuery.isFetching} error={sellersQuery.isError}
          onSearch={setSellerSearch} onRetry={() => sellersQuery.refetch()} onChange={(value, option) => updateDraft('sellerId', value, option)} {...comboboxProps} />
        <SearchableFilterCombobox label="Type de document" placeholder="Tous les documents" searchPlaceholder="Rechercher…"
          value={draftFilters.documentType} options={DOCUMENT_OPTIONS} onChange={(value, option) => updateDraft('documentType', value, option)} {...comboboxProps} />
        <SearchableFilterCombobox label="Statut de paiement" placeholder="Tous les paiements" searchPlaceholder="Rechercher…"
          value={draftFilters.paymentStatus} options={PAYMENT_OPTIONS} onChange={(value, option) => updateDraft('paymentStatus', value, option)} {...comboboxProps} />
      </div>
    </SlideOver>
  );

  // ── Period selector ───────────────────────────────────────────────────────
  const periodBar = (
    <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
      <div className="hidden max-w-full overflow-x-auto rounded-xl border border-border bg-white p-1 shadow-sm md:flex">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            aria-pressed={period === opt.value}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              period === opt.value
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-secondary hover:bg-muted hover:text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label className="relative min-w-0 flex-1 md:hidden">
        <span className="sr-only">Période du rapport</span>
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <select value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)} className="h-10 w-full appearance-none rounded-lg border border-border bg-white pl-9 pr-8 text-sm font-medium focus:ring-2 focus:ring-app-ring">
          {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      {period === 'custom' && (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 shadow-sm xl:w-auto">
          <input
            type="date"
            aria-label="Date de début" value={customDraftStart}
            onChange={(e) => setCustomDraftStart(e.target.value)}
            className="min-w-0 flex-1 text-xs focus:outline-none"
          />
          <span className="text-text-muted">→</span>
          <input
            type="date"
            aria-label="Date de fin" value={customDraftEnd}
            onChange={(e) => setCustomDraftEnd(e.target.value)}
            className="min-w-0 flex-1 text-xs focus:outline-none"
          />
          <Button size="sm" disabled={!customDraftStart || !customDraftEnd || customDraftStart > customDraftEnd} onClick={() => { setCustomStart(customDraftStart); setCustomEnd(customDraftEnd); }}>Appliquer</Button>
        </div>
      )}
      <Button type="button" variant={activeFilterCount ? 'secondary' : 'outline'} size="sm" onClick={() => { setDraftFilters(appliedFilters); setDraftOptions(appliedOptions); setFiltersOpen(true); }} className="flex-1 md:flex-none">
        <SlidersHorizontal /> Filtres {activeFilterCount > 0 && <Badge className="ml-1 bg-app-primary text-white">{activeFilterCount}</Badge>}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!overview || isFetching} className="flex-1 md:flex-none"><Download /> Exporter CSV</Button>
    </div>
  );

  const header = (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="shrink-0">
        <h1 className="app-page-title">Rapports financiers</h1>
        <p className="app-page-subtitle">Analyse détaillée des ventes, coûts et bénéfices</p>
      </div>
      {periodBar}
    </div>
  );

  if (!initialized || isLoading) return <div className="space-y-6 pb-10">{header}<LoadingState /></div>;
  if (isError || !overview) return (
    <div className="space-y-6 pb-10">{header}<ErrorState onRetry={() => refetch()} /></div>
  );

  const { financier, ventes, achats, stock, clients, topProduitsBenefice, produitsFaibleMarge, topClients, topFournisseurs, series } = overview;
  const selectedPeriodLabel = formatKpiPeriod(
    PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? period,
    overview.range,
  );
  const kpiContext = { period: selectedPeriodLabel, filtersActive: activeFilterCount > 0, variant: 'report' as const };

  // ── Chart data ─────────────────────────────────────────────────────────────
  const seriesChart = series.map((s) => ({
    label:      s.label,
    CA:         Math.round(s.ca),
    Achats:     Math.round(s.achats),
    'Marge brute': Math.round(s.margeBrute),
    'Coût vendu': Math.round(s.coutVendu),
    Bénéfice:   Math.round(s.benefice),
    Encaissements: Math.round(s.encaissements),
    Dépenses:   Math.round(s.depenses),
  }));

  const topProduitsChart = [...topProduitsBenefice].reverse().map((item) => ({
    name:      (item.product?.name ?? 'Inconnu').substring(0, 28),
    Quantité:  item.quantitySold,
    CA: item.revenue,
    Bénéfice: item.profit,
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
      {filtersPanel}
      {activeFilterCount > 0 && <div aria-label="Filtres actifs" className="flex flex-wrap items-center gap-2">
        {activeFilterEntries.map(([key, value]) => <Badge key={key} variant="secondary" className="gap-1.5 rounded-full border border-border bg-white py-1.5 pl-3 pr-1.5 text-xs font-medium text-text-secondary">
          {labels[key]} : {appliedOptions[key]?.label ?? (key === 'documentType' ? DOCUMENT_OPTIONS.find((item) => item.id === value)?.label : key === 'paymentStatus' ? PAYMENT_OPTIONS.find((item) => item.id === value)?.label : 'Sélection')}
          <button type="button" aria-label={`Supprimer le filtre ${labels[key]}`} onClick={() => { const next = { ...appliedFilters }; delete next[key]; const nextOptions = { ...appliedOptions }; delete nextOptions[key]; setAppliedFilters(next); setDraftFilters(next); setAppliedOptions(nextOptions); setDraftOptions(nextOptions); }} className="rounded-full p-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-app-ring"><X className="h-3 w-3" /></button>
        </Badge>)}
        <button type="button" onClick={clearAllAdvancedFilters} className="text-xs font-semibold text-app-primary hover:underline">Effacer tous les filtres</button>
      </div>}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            {...kpiContext}
            metric="netRevenue"
            icon={DollarSign}
            label="CA net HT hors timbre"
            value={reportMoney(financier.caNet)}
            trend={financier.caTrend}
            color="orange"
          />
          <KpiCard
            {...kpiContext}
            metric="customerCollections"
            icon={TrendingUp}
            label="Encaissements clients"
            value={reportMoney(financier.encaissementsClients)}
            color="green"
          />
          <KpiCard
            {...kpiContext}
            metric="customerReceivables"
            icon={AlertTriangle}
            label="Impayés clients"
            value={reportMoney(financier.impayesClients)}
            color="red"
          />
          <KpiCard
            {...kpiContext}
            metric="grossProfit"
            icon={TrendingUp}
            label="Bénéfice brut réel"
            value={reportMoney(financier.beneficeBrut)}
            sub={`Taux de marque sur vente : ${financier.tauxMarque}%`}
            color={financier.beneficeBrut >= 0 ? 'green' : 'red'}
          />
          <KpiCard
            {...kpiContext}
            metric="costOfGoodsSold"
            icon={ShoppingCart}
            label="Coût des produits vendus"
            value={reportMoney(financier.coutProduitsVendus)}
            sub={`Taux de marge sur coût : ${financier.tauxMargeSurCout}%`}
            color="blue"
          />
          <KpiCard
            {...kpiContext}
            metric="supplierPayments"
            icon={Truck}
            label="Paiements fournisseurs"
            value={reportMoney(financier.paiementsFournisseurs)}
            sub={
              financier.totalAchats > 0
                ? `${Math.round((financier.paiementsFournisseurs / financier.totalAchats) * 100)}% réglé`
                : undefined
            }
            color="teal"
          />
          <KpiCard
            {...kpiContext}
            metric="supplierPayables"
            icon={AlertTriangle}
            label="Impayés fournisseurs"
            value={reportMoney(financier.impayesFournisseurs)}
            color="orange"
          />
          <KpiCard
            {...kpiContext}
            metric="discounts"
            icon={Boxes}
            label="Remises accordées"
            value={reportMoney(financier.remisesAccordees)}
            sub="Réduction du CA HT catalogue"
            color="purple"
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2 — TRÉSORERIE
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={DollarSign} title="Trésorerie" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            {...kpiContext}
            metric="physicalCash"
            icon={DollarSign}
            label="Caisse physique"
            value={reportMoney(financier.soldeCaisse)}
            color="green"
          />
          <KpiCard
            {...kpiContext}
            metric="bankBalance"
            icon={DollarSign}
            label="Trésorerie bancaire"
            value={reportMoney(financier.soldeBanque)}
            color="blue"
          />
          <KpiCard
            {...kpiContext}
            metric="globalBalance"
            icon={DollarSign}
            label="Solde global"
            value={reportMoney(financier.soldeGlobal)}
            color="teal"
          />
          <KpiCard
            {...kpiContext}
            metric="periodExpenses"
            icon={TrendingDown}
            label="Dépenses (période)"
            value={reportMoney(financier.depenses)}
            color="red"
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3 — VENTES
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={DollarSign} title="Ventes" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            {...kpiContext}
            metric="netRevenue"
            icon={DollarSign}
            label="CA période"
            value={reportMoney(financier.caNet)}
            trend={financier.caTrend}
            color="orange"
          />
          <KpiCard
            {...kpiContext}
            metric="salesCount"
            icon={TrendingUp}
            label="Nb ventes (BL+FA)"
            value={ventes.count}
            trend={ventes.countTrend}
            color="blue"
          />
          <KpiCard
            {...kpiContext}
            metric="averageBasket"
            icon={Activity}
            label="Panier moyen"
            value={reportMoney(ventes.panierMoyen)}
            color="purple"
          />
          <KpiCard
            {...kpiContext}
            metric="quotesCount"
            icon={DollarSign}
            label="Devis"
            value={ventes.devisCount}
            color="default"
          />
          <KpiCard
            {...kpiContext}
            metric="invoicesCount"
            icon={Layers}
            label="Factures"
            value={ventes.factureCount}
            color="green"
          />
          <KpiCard
            {...kpiContext}
            metric="cancelledSalesCount"
            icon={RefreshCw}
            label="Annulées"
            value={ventes.cancelledCount}
            color="red"
          />
        </div>

        {/* Avoirs */}
        {ventes.avoirs.count > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              {...kpiContext}
              metric="creditNotesCount"
              icon={RefreshCw}
              label="Avoirs émis"
              value={ventes.avoirs.count}
              color="orange"
            />
            <KpiCard
              {...kpiContext}
              metric="creditNotesAmount"
              icon={DollarSign}
              label="Montant avoirs"
              value={reportMoney(ventes.avoirs.total)}
              color="orange"
            />
            <KpiCard
              {...kpiContext}
              metric="refundedAmount"
              icon={DollarSign}
              label="Montant remboursé"
              value={reportMoney(ventes.avoirs.montantRembourse)}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard {...kpiContext} metric="activeProducts" icon={Package} label="Total produits" value={stock.totalProduits} color="blue" />
          <KpiCard {...kpiContext} metric="outOfStockProducts" icon={AlertTriangle} label="Ruptures stock" value={stock.ruptureCount} color="red" />
          <KpiCard {...kpiContext} metric="lowStockProducts" icon={AlertTriangle} label="Sous seuil" value={stock.lowStockCount} color="orange" />
          <KpiCard {...kpiContext} metric="stockQuantity" icon={Boxes} label="Qté en stock" value={stock.totalQuantite.toLocaleString()} color="teal" />
          <KpiCard {...kpiContext} metric="stockEntries" icon={TrendingUp} label="Entrées stock" value={stock.mouvements.entries} color="green" />
          <KpiCard {...kpiContext} metric="stockExits" icon={TrendingDown} label="Sorties stock" value={stock.mouvements.exits} color="red" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5 — ACHATS
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={ShoppingCart} title="Achats" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard {...kpiContext} metric="totalPurchases" icon={ShoppingCart} label="Total achats" value={reportMoney(financier.totalAchats)} trend={financier.achatsTrend} trendPositiveWhen="down" color="blue" />
          <KpiCard {...kpiContext} metric="purchaseCount" icon={Layers} label="Nb commandes" value={achats.count} trend={achats.countTrend} color="purple" />
          <KpiCard {...kpiContext} metric="supplierPayments" icon={Truck} label="Paiements fournisseurs" value={reportMoney(financier.paiementsFournisseurs)} color="teal" />
          <KpiCard {...kpiContext} metric="supplierPayables" icon={AlertTriangle} label="Impayés fournisseurs" value={reportMoney(financier.impayesFournisseurs)} color="orange" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 6 — CLIENTS
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHead icon={Users} title="Clients" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard {...kpiContext} metric="customersCount" icon={Users} label="Total clients" value={clients.total} color="blue" />
          <KpiCard {...kpiContext} metric="customerCollections" icon={DollarSign} label="Encaissements période" value={reportMoney(financier.encaissementsClients)} color="green" />
          <KpiCard {...kpiContext} metric="customerReceivables" icon={AlertTriangle} label="Impayés période" value={reportMoney(financier.impayesClients)} color="red" />
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
                    <Tooltip content={<ChartTip fmt={(v) => reportMoney(v)} />} />
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
                    <Tooltip content={<ChartTip fmt={(v) => reportMoney(v)} />} />
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
                    <Tooltip content={<ChartTip fmt={(v) => reportMoney(v)} />} />
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

          {/* Chart 5 — Top produits par bénéfice */}
          <Card className="shadow-card">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target size={14} className="text-accent" /> Top 10 produits par bénéfice
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
                      <Tooltip content={<ChartTip fmt={(v) => reportMoney(v)} />} />
                      <Bar dataKey="CA" fill="#E67E22" radius={[0, 4, 4, 0]} maxBarSize={18} />
                      <Bar dataKey="Bénéfice" fill="#10B981" radius={[0, 4, 4, 0]} maxBarSize={18} />
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
                        <Tooltip formatter={(v) => reportMoney(Number(v ?? 0))} />
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

        <Card className="mt-4 shadow-card">
          <CardHeader className="p-4"><CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle size={14} className="text-red-500" /> Produits à faible marge ou déficitaires</CardTitle></CardHeader>
          <CardContent className="p-0">
            {produitsFaibleMarge.length === 0 ? <p className="py-8 text-center text-sm text-text-muted">Aucun produit sous le seuil de 10 %.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/30">{['Référence', 'Produit', 'Quantité', 'CA net', 'Coût', 'Bénéfice', 'Taux de marque'].map((h) => <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-text-secondary">{h}</th>)}</tr></thead><tbody>{produitsFaibleMarge.map((item) => <tr key={item.productId} className="border-b last:border-0"><td className="px-4 py-3 font-mono text-xs">{item.product.reference}</td><td className="px-4 py-3 font-medium">{item.product.name}</td><td className="px-4 py-3">{item.quantitySold}</td><td className="px-4 py-3">{reportMoney(item.revenue)}</td><td className="px-4 py-3">{reportMoney(item.cost)}</td><td className={`px-4 py-3 font-semibold ${item.profit < 0 ? 'text-red-600' : ''}`}>{reportMoney(item.profit)}</td><td className="px-4 py-3">{item.markupRate.toFixed(3)} %</td></tr>)}</tbody></table></div>
            )}
          </CardContent>
        </Card>

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
                      <Tooltip content={<ChartTip fmt={(v) => reportMoney(v)} />} />
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
                      <Tooltip content={<ChartTip fmt={(v) => reportMoney(v)} />} />
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
                      <Tooltip content={<ChartTip fmt={(v) => reportMoney(v)} />} />
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
