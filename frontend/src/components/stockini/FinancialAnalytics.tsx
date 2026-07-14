'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';
type Summary = { salesCount: number; quantitySold: number; grossRevenueHT: number; discountsHT: number; creditNotesHT: number; netRevenueHT: number; vatCollected: number; fiscalStampCollected: number; revenueTTC: number; cogsHT: number; returnedCogsHT: number; grossMarginHT: number; operatingExpenses: number; netProfit: number; grossMarginRate: number; markupOnRevenue: number; averageOrderValueHT: number; averageProfitPerSale: number; customerPayments: number; customerOutstanding: number; supplierOutstanding: number };
type Comparison = { absolute: number; percent: number | null };
type AnalyticsData = { summary: Summary; sales: Array<Record<string, any>>; products: Array<Record<string, any>>; customers: Array<Record<string, any>>; timeline: Array<Record<string, any>>; dataQuality: { hasWarnings: boolean; warnings: string[]; estimatedCostLines: number } };
type DashboardData = { summary: Summary; comparisons: Record<string, Comparison>; cash: { physicalCash: number; bankAndChecks: number; global: number }; dataQuality: AnalyticsData['dataQuality'] };

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: "Aujourd'hui" }, { value: 'yesterday', label: 'Hier' }, { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' }, { value: 'year', label: 'Cette année' }, { value: 'custom', label: 'Personnalisée' },
];
const money = (v: unknown) => `${Number(v ?? 0).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;

export function PeriodSelector({ period, from, to, onPeriod, onFrom, onTo }: { period: Period; from: string; to: string; onPeriod: (p: Period) => void; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-2">
    {PERIODS.map((p) => <button key={p.value} onClick={() => onPeriod(p.value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${period === p.value ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p.label}</button>)}
    {period === 'custom' && <><input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="rounded border px-2 py-1 text-xs"/><input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="rounded border px-2 py-1 text-xs"/></>}
  </div>;
}

function ComparisonBadge({ value }: { value?: Comparison }) {
  if (!value || value.percent === null) return <span className="text-[10px] text-slate-400">Comparaison non disponible</span>;
  const positive = value.absolute > 0; const Icon = positive ? ArrowUpRight : value.absolute < 0 ? ArrowDownRight : Minus;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${positive ? 'text-emerald-600' : value.absolute < 0 ? 'text-red-600' : 'text-slate-500'}`}><Icon size={11}/>{value.percent.toFixed(2)} % ({money(value.absolute)})</span>;
}

export function FinancialKpiCard({ title, value, description, formula, comparison, count = false }: { title: string; value: number; description: string; formula: string; comparison?: Comparison; count?: boolean }) {
  return <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold text-slate-600">{title}</p><span title={formula}><Info size={14} className="text-slate-400"/></span></div>
    <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{count ? value.toLocaleString('fr-TN') : money(value)}</p>
    <p className="mt-1 min-h-8 text-[10px] leading-4 text-slate-400">{description}</p><ComparisonBadge value={comparison}/>
  </div>;
}

export function DataQualityWarning({ quality }: { quality: AnalyticsData['dataQuality'] }) {
  if (!quality.hasWarnings) return null;
  return <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><summary className="flex cursor-pointer items-center gap-2 font-semibold"><AlertTriangle size={15}/>Qualité des données : {quality.warnings.length} anomalie(s), dont {quality.estimatedCostLines} coût(s) estimé(s)</summary><ul className="mt-2 list-disc space-y-1 pl-5">{quality.warnings.slice(0, 30).map((w) => <li key={w}>{w}</li>)}</ul></details>;
}

function FinancialTable({ columns, rows }: { columns: Array<{ key: string; label: string; money?: boolean; percent?: boolean }>; rows: Array<Record<string, any>> }) {
  return <div className="overflow-x-auto rounded-xl border border-border bg-white"><table className="w-full min-w-[900px] text-xs"><thead className="bg-slate-50"><tr>{columns.map((c) => <th key={c.key} className="px-3 py-2 text-left font-semibold text-slate-500">{c.label}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} className="p-8 text-center text-slate-400">Aucune donnée sur cette période</td></tr> : rows.map((row, i) => <tr key={String(row.id ?? row.productId ?? row.client ?? i)} className="border-t hover:bg-slate-50">{columns.map((c) => <td key={c.key} className={`px-3 py-2 tabular-nums ${c.key.includes('margin') && Number(row[c.key]) < 0 ? 'font-semibold text-red-600' : ''}`}>{c.money ? money(row[c.key]) : c.percent ? `${Number(row[c.key]).toFixed(2)} %` : String(row[c.key] ?? '—')}</td>)}</tr>)}</tbody></table></div>;
}

export function FinancialAnalytics({ detailed = false }: { detailed?: boolean }) {
  const [period, setPeriod] = useState<Period>('month'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const params = useMemo(() => ({ period, ...(period === 'custom' && from && to ? { dateFrom: from, dateTo: to } : {}) }), [period, from, to]);
  const enabled = period !== 'custom' || Boolean(from && to);
  const dashboard = useQuery({ queryKey: ['financial-dashboard', params], enabled, queryFn: () => api.get<DashboardData>('/financial-analytics/dashboard', { params }).then((r) => r.data) });
  const detail = useQuery({ queryKey: ['financial-summary', params], enabled: enabled && detailed, queryFn: () => api.get<AnalyticsData>('/financial-analytics/summary', { params }).then((r) => r.data) });
  if (dashboard.isLoading || (detailed && detail.isLoading)) return <div className="grid grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100"/>)}</div>;
  if (dashboard.isError || !dashboard.data) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Impossible de charger les indicateurs financiers.</div>;
  const d = dashboard.data; const s = d.summary; const q = detail.data?.dataQuality ?? d.dataQuality;
  const cards = [
    ['Ventes réalisées', s.salesCount, 'Documents commerciaux comptabilisés, sans double comptage.', 'Nombre de factures validées + BL validés non transformés', 'salesCount', true],
    ["Chiffre d'affaires HT", s.netRevenueHT, 'Ventes nettes HT après remises et avoirs.', 'Σ lignes nettes HT − avoirs HT', 'netRevenueHT'],
    ['Marge commerciale HT', s.grossMarginHT, 'Marge hors TVA et hors timbre.', 'CA net HT − COGS ajusté', 'grossMarginHT'],
    ['Profit net réel', s.netProfit, 'Résultat commercial après dépenses opérationnelles.', 'Marge commerciale HT − dépenses opérationnelles', 'netProfit'],
    ['Encaissements clients', s.customerPayments, 'Paiements réellement reçus pendant la période.', 'Σ paiements clients datés dans la période', 'customerPayments'],
    ['Coût des produits vendus', s.cogsHT, 'Coût historique des quantités vendues, retours déduits.', 'Σ quantité × coût snapshot − coût des retours', 'cogsHT'],
    ['Remises accordées', s.discountsHT, 'Réduction HT accordée sur les lignes.', 'Σ (prix brut HT − prix net HT)', 'discountsHT'],
    ['Avoirs émis', s.creditNotesHT, 'Avoirs non annulés émis pendant la période.', 'Σ montants HT des avoirs', 'creditNotesHT'],
  ] as const;
  return <div className="space-y-4"><PeriodSelector period={period} from={from} to={to} onPeriod={setPeriod} onFrom={setFrom} onTo={setTo}/><DataQualityWarning quality={q}/>
    <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-blue-900 p-6 text-white"><p className="text-xs uppercase tracking-widest text-blue-200">Profit net réel — période</p><p className="mt-2 text-4xl font-bold">{money(s.netProfit)}</p><div className="mt-4 flex flex-wrap gap-6 text-xs text-slate-200"><span>Marge commerciale : {money(s.grossMarginHT)}</span><span>Dépenses : {money(s.operatingExpenses)}</span><span>Taux de marque : {s.markupOnRevenue.toFixed(2)} %</span></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([title, value, description, formula, key, count]) => <FinancialKpiCard key={title} title={title} value={value} description={description} formula={formula} comparison={d.comparisons[key]} count={count}/>)}</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FinancialKpiCard title="Impayés clients" value={s.customerOutstanding} description="Reste dû sur les factures actives." formula="Total à payer − paiements − avoirs imputés"/><FinancialKpiCard title="Dettes fournisseurs" value={s.supplierOutstanding} description="Reste dû sur les achats actifs." formula="Total achats à payer − paiements fournisseurs"/><FinancialKpiCard title="Solde caisse physique" value={d.cash.physicalCash} description="Position actuelle, distincte du profit." formula="Solde initial + entrées − sorties caisse"/><FinancialKpiCard title="Banque et chèques" value={d.cash.bankAndChecks} description="Position actuelle des comptes non-caisse." formula="Solde initial + entrées − sorties banque/chèques"/></div>
    {detailed && detail.data && <DetailedAnalytics data={detail.data}/>}</div>;
}

function DetailedAnalytics({ data }: { data: AnalyticsData }) {
  return <div className="space-y-6"><section><h2 className="mb-2 text-sm font-bold">Évolution : CA HT, marge et profit net</h2><div className="h-72 rounded-xl border bg-white p-3"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.timeline}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip formatter={(v) => money(v)}/><Legend/><Line dataKey="revenueHT" name="CA HT" stroke="#2563eb" dot={false}/><Line dataKey="marginHT" name="Marge HT" stroke="#10b981" dot={false}/><Line dataKey="netProfit" name="Profit net" stroke="#7c3aed" dot={false}/></LineChart></ResponsiveContainer></div></section>
    <section><h2 className="mb-2 text-sm font-bold">Profit par vente</h2><FinancialTable rows={data.sales} columns={[{key:'date',label:'Date'},{key:'reference',label:'Référence'},{key:'client',label:'Client'},{key:'articles',label:'Articles'},{key:'revenueHT',label:'CA net HT',money:true},{key:'cogsHT',label:'Coût HT',money:true},{key:'marginHT',label:'Marge HT',money:true},{key:'marginRate',label:'Taux marge',percent:true},{key:'collected',label:'Encaissé',money:true},{key:'outstanding',label:'Reste',money:true}]}/></section>
    <section><h2 className="mb-2 text-sm font-bold">Profit par produit</h2><FinancialTable rows={data.products} columns={[{key:'reference',label:'Référence'},{key:'name',label:'Produit'},{key:'category',label:'Catégorie'},{key:'brand',label:'Marque'},{key:'quantitySold',label:'Qté'},{key:'revenueHT',label:'CA HT',money:true},{key:'cogsHT',label:'Coût HT',money:true},{key:'marginHT',label:'Marge HT',money:true},{key:'unitMargin',label:'Marge/unité',money:true},{key:'marginRate',label:'Taux marge',percent:true},{key:'profitability',label:'Rentabilité'}]}/></section>
    <section><h2 className="mb-2 text-sm font-bold">Profit par client</h2><FinancialTable rows={data.customers} columns={[{key:'client',label:'Client'},{key:'salesCount',label:'Ventes'},{key:'revenueHT',label:'CA HT',money:true},{key:'marginHT',label:'Marge HT',money:true},{key:'collected',label:'Encaissé',money:true},{key:'outstanding',label:'Impayé',money:true},{key:'averageOrder',label:'Ticket moyen',money:true},{key:'lastSale',label:'Dernière vente'}]}/></section></div>;
}
