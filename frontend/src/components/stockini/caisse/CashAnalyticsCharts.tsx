'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface CashAnalytics {
  cashflow: Array<{
    label:   string;
    entrees: number;
    sorties: number;
    netCashFlow: number;
  }>;
  topClients: Array<{ name: string; montant: number }>;
  topFournisseurs: Array<{ name: string; montant: number }>;
}

interface Props {
  analytics: CashAnalytics | undefined;
  isLoading: boolean;
}

const COLORS_CLIENTS    = ['#E67E22', '#F39C12', '#D35400', '#E74C3C', '#C0392B'];
const COLORS_SUPPLIERS  = ['#2980B9', '#3498DB', '#1ABC9C', '#16A085', '#27AE60'];

function fmtDT(n: number) {
  return new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 0 }).format(n) + ' DT';
}

export function CashAnalyticsCharts({ analytics, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[280px] animate-pulse rounded-xl bg-border/40" />
        ))}
      </div>
    );
  }

  if (!analytics) return null;

  const { cashflow, topClients, topFournisseurs } = analytics;

  return (
    <div className="space-y-4">
      {/* Cashflow — entrées vs sorties */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-4 text-[13px] font-semibold text-text-primary">
          Cashflow — Entrées vs Sorties
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={cashflow} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gradEntrees" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="gradSorties" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bd, #e2e8f0)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => fmtDT(v as number)} tick={{ fontSize: 10 }} width={72} />
            <Tooltip
              formatter={(v, name) => [fmtDT(Number(v)), name === 'entrees' ? 'Entrées' : name === 'sorties' ? 'Sorties' : 'Flux net']}
              labelStyle={{ fontSize: 11 }}
              contentStyle={{ fontSize: 11, border: '1px solid var(--bd)', borderRadius: 8 }}
            />
            <Legend formatter={(v) => v === 'entrees' ? 'Entrées' : v === 'sorties' ? 'Sorties' : 'Flux net'} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="entrees" stroke="#10b981" strokeWidth={2} fill="url(#gradEntrees)" dot={false} />
            <Area type="monotone" dataKey="sorties" stroke="#ef4444" strokeWidth={2} fill="url(#gradSorties)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Flux net de trésorerie par période */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-4 text-[13px] font-semibold text-text-primary">
          Évolution du flux net de trésorerie
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={cashflow} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bd, #e2e8f0)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => fmtDT(v as number)} tick={{ fontSize: 10 }} width={72} />
            <Tooltip
              formatter={(v) => [fmtDT(Number(v)), 'Flux net']}
              contentStyle={{ fontSize: 11, border: '1px solid var(--bd)', borderRadius: 8 }}
            />
            <Bar dataKey="netCashFlow" radius={[4, 4, 0, 0]}>
              {cashflow.map((entry, i) => (
                <Cell key={i} fill={entry.netCashFlow >= 0 ? '#E67E22' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Top clients */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-4 text-[13px] font-semibold text-text-primary">Top 5 Clients</h3>
          {topClients.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-text-secondary">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={topClients}
                  dataKey="montant"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                  fontSize={10}
                >
                  {topClients.map((_, i) => (
                    <Cell key={i} fill={COLORS_CLIENTS[i % COLORS_CLIENTS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtDT(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top fournisseurs */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-4 text-[13px] font-semibold text-text-primary">Top 5 Fournisseurs</h3>
          {topFournisseurs.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-text-secondary">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topFournisseurs} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bd, #e2e8f0)" />
                <XAxis type="number" tickFormatter={(v) => fmtDT(v as number)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={(v) => fmtDT(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="montant" radius={[0, 4, 4, 0]}>
                  {topFournisseurs.map((_, i) => (
                    <Cell key={i} fill={COLORS_SUPPLIERS[i % COLORS_SUPPLIERS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
