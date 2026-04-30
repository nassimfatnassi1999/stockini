'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHead, CardTitle, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { RefCode } from '@/components/ui/RefCode'
import { MiniStat } from '@/components/ui/MiniStat'

// ── Mock data ─────────────────────────────────────────────────────────────────

const TOP_PRODUCTS = [
  { label: 'Filtre à huile moteur',   sales: 312, pct: 100, color: 'var(--accent)'  },
  { label: 'Plaquettes frein avant',  sales: 255, pct: 82,  color: 'var(--accent)'  },
  { label: "Bougie d'allumage NGK",   sales: 218, pct: 70,  color: 'var(--teal)'    },
  { label: 'Batterie 60Ah Bosch',     sales: 174, pct: 56,  color: 'var(--teal)'    },
  { label: 'Filtre habitacle',        sales: 149, pct: 48,  color: 'var(--purple)'  },
  { label: 'Courroie distribution',   sales: 124, pct: 40,  color: 'var(--purple)'  },
  { label: 'Amortisseur arrière',     sales: 106, pct: 34,  color: 'var(--amber)'   },
  { label: 'Pneu 195/65 R15',         sales: 81,  pct: 26,  color: 'var(--amber)'   },
  { label: 'Kit embrayage',           sales: 59,  pct: 19,  color: 'var(--red)'     },
  { label: 'Pompe à eau',             sales: 40,  pct: 13,  color: 'var(--red)'     },
]

const CATEGORY_SALES = [
  { category: 'Filtres',      revenue: 38400, pct: 100, color: 'var(--accent)'  },
  { category: 'Freinage',     revenue: 32100, pct: 84,  color: 'var(--green)'   },
  { category: 'Moteur',       revenue: 28500, pct: 74,  color: 'var(--teal)'    },
  { category: 'Batteries',    revenue: 21700, pct: 57,  color: 'var(--purple)'  },
  { category: 'Suspension',   revenue: 16200, pct: 42,  color: 'var(--amber)'   },
  { category: 'Électricité',  revenue: 12900, pct: 34,  color: 'var(--red)'     },
  { category: 'Pneus',        revenue: 9800,  pct: 26,  color: 'var(--accent2)' },
]

const RECENT_ACTIVITY = [
  { id: 1,  type: 'Vente',      ref: 'F-2026-0348', desc: 'Facture — Garage Mabrouk',     date: '30/04/2026 14:22', amount: 2340.000,  sign: 1  },
  { id: 2,  type: 'Vente',      ref: 'F-2026-0347', desc: "Facture — Sami Mrad",          date: '30/04/2026 11:05', amount: 180.000,   sign: 1  },
  { id: 3,  type: 'Achat',      ref: 'BC-2026-0112',desc: 'Commande — Auto Parts SARL',   date: '28/04/2026 09:40', amount: 4200.000,  sign: -1 },
  { id: 4,  type: 'Vente',      ref: 'F-2026-0346', desc: 'Facture — Auto Top SARL',      date: '30/04/2026 09:15', amount: 4750.000,  sign: 1  },
  { id: 5,  type: 'Achat',      ref: 'BC-2026-0111',desc: 'Commande — TunisiAuto',        date: '27/04/2026 10:00', amount: 2350.000,  sign: -1 },
  { id: 6,  type: 'Vente',      ref: 'F-2026-0345', desc: 'Facture — Khaled Azizi',       date: '29/04/2026 08:12', amount: 640.000,   sign: 1  },
  { id: 7,  type: 'Mvt Stock',  ref: 'INV-2026-04', desc: "Ajustement inventaire",        date: '28/04/2026 17:00', amount: 0,         sign: 0  },
  { id: 8,  type: 'Vente',      ref: 'F-2026-0344', desc: 'Facture — Garage Centrale',    date: '29/04/2026 16:55', amount: 1120.000,  sign: 1  },
  { id: 9,  type: 'Achat',      ref: 'BC-2026-0110',desc: 'Réception — Maghreb Pièces',   date: '25/04/2026 15:30', amount: 3180.000,  sign: -1 },
  { id: 10, type: 'Vente',      ref: 'F-2026-0343', desc: 'Facture — Mohamed Trabelsi',   date: '29/04/2026 10:12', amount: 385.000,   sign: 1  },
]

const typeVariant: Record<string, 'green' | 'red' | 'blue' | 'amber'> = {
  'Vente':    'green',
  'Achat':    'red',
  'Mvt Stock':'blue',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [period, setPeriod] = useState('Ce mois')

  return (
    <>
      <Topbar
        title="Rapports & Statistiques"
        breadcrumb="Analyse financière"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="form-select"
              style={{ width: 150, height: 34 }}
              value={period}
              onChange={e => setPeriod(e.target.value)}
            >
              <option>Ce mois</option>
              <option>Mois précédent</option>
              <option>Trimestre</option>
              <option>Année</option>
            </select>
            <Button variant="ghost">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              PDF
            </Button>
            <Button variant="ghost">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Excel
            </Button>
            <Button variant="ghost">CSV</Button>
          </div>
        }
      />

      <div className="content">

        {/* Summary cards */}
        <div className="stats-grid">
          <StatCard
            variant="green"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>}
            value="142 300 DT"
            label="CA mensuel"
            trend="+9.3% vs mois passé"
            trendType="up"
          />
          <StatCard
            variant="teal"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>}
            value="24 180 DT"
            label="Bénéfice brut"
            trend="+18% vs mois passé"
            trendType="up"
          />
          <StatCard
            variant="amber"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>}
            value="8 450 DT"
            label="Dettes clients"
            trend="12 clients concernés"
            trendType="down"
          />
          <StatCard
            variant="red"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-4 0v2" /></svg>}
            value="16 000 DT"
            label="Dettes fournisseurs"
            trend="5 fournisseurs"
            trendType="down"
          />
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>

          {/* Top products bar chart */}
          <Card>
            <CardHead>
              <CardTitle>Top 10 — Pièces les plus vendues</CardTitle>
              <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>{period}</span>
            </CardHead>
            <div className="chart-area">
              {TOP_PRODUCTS.map(p => (
                <div key={p.label} className="chart-row">
                  <div className="chart-label">{p.label}</div>
                  <div className="chart-bar-wrap">
                    <div className="chart-bar" style={{ width: `${p.pct}%`, background: p.color }}>
                      <span className="chart-bar-val">{p.sales}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Sales by category */}
          <Card>
            <CardHead>
              <CardTitle>Ventes par catégorie</CardTitle>
              <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>{period}</span>
            </CardHead>
            <div className="chart-area">
              {CATEGORY_SALES.map(c => (
                <div key={c.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text2)' }}>{c.category}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{c.revenue.toLocaleString()} DT</span>
                  </div>
                  <div className="bar-track" style={{ height: 8, marginBottom: 8 }}>
                    <div className="bar-fill" style={{ width: `${c.pct}%`, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Quick stats + recent activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>

          {/* Mini stats */}
          <Card>
            <CardHead><CardTitle>Indicateurs clés</CardTitle></CardHead>
            <div>
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>}
                iconVariant="blue"
                label="Transactions ce mois"
                value="842"
                right={<span style={{ color: 'var(--text3)' }}>+127 vs N-1</span>}
              />
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>}
                iconVariant="teal"
                label="Mouvements de stock"
                value="1 842"
                right={<span style={{ color: 'var(--text3)' }}>E + S</span>}
              />
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>}
                iconVariant="purple"
                label="Bons de commande émis"
                value="10"
                right={<span style={{ color: 'var(--amber)' }}>3 en cours</span>}
              />
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>}
                iconVariant="amber"
                label="Clients actifs"
                value="342"
                right={<span style={{ color: 'var(--green)' }}>+12 nouveaux</span>}
              />
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
                iconVariant="green"
                label="Marge brute moyenne"
                value={<span style={{ color: 'var(--green)' }}>41.2%</span>}
                right={<span style={{ color: 'var(--green)' }}>+2.1%</span>}
              />
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>}
                iconVariant="red"
                label="Ruptures de stock"
                value={<span style={{ color: 'var(--red)' }}>12</span>}
                right={<span style={{ color: 'var(--red)' }}>Action requise</span>}
              />
            </div>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardHead>
              <CardTitle>Activité récente — 10 dernières opérations</CardTitle>
              <Button variant="ghost" style={{ marginLeft: 'auto', height: 28, padding: '0 10px', fontSize: 11 }}>
                Voir tout
              </Button>
            </CardHead>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Référence</th>
                    <th>Description</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT_ACTIVITY.map(a => (
                    <tr key={a.id}>
                      <td><Badge variant={typeVariant[a.type]}>{a.type}</Badge></td>
                      <td><RefCode code={a.ref} /></td>
                      <td style={{ fontWeight: 500 }}>{a.desc}</td>
                      <td>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{a.date.split(' ')[0]}</div>
                        <div className="td-muted">{a.date.split(' ')[1]}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {a.amount > 0 ? (
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: a.sign === 1 ? 'var(--green)' : 'var(--red)' }}>
                            {a.sign === 1 ? '+' : '-'}{a.amount.toFixed(3)} DT
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Export section */}
        <div style={{ marginTop: 14 }}><Card>
          <CardHead><CardTitle>Exporter les rapports</CardTitle></CardHead>
          <CardBody>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Rapport complet PDF',         icon: 'pdf',   variant: 'primary' as const },
                { label: 'État de stock Excel',          icon: 'excel', variant: 'ghost' as const  },
                { label: 'Journal des ventes CSV',       icon: 'csv',   variant: 'ghost' as const  },
                { label: 'Rapport achats PDF',           icon: 'pdf',   variant: 'ghost' as const  },
                { label: "Bilan clients Excel",          icon: 'excel', variant: 'ghost' as const  },
                { label: 'Rapport fournisseurs CSV',     icon: 'csv',   variant: 'ghost' as const  },
              ].map(e => (
                <Button key={e.label} variant={e.variant} style={{ gap: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {e.label}
                </Button>
              ))}
            </div>
          </CardBody>
        </Card></div>

      </div>
    </>
  )
}
