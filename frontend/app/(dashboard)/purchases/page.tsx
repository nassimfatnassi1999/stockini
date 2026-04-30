'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHead, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { RefCode } from '@/components/ui/RefCode'
import { Pagination } from '@/components/ui/DataTable'

// ── Mock data ─────────────────────────────────────────────────────────────────

type POStatus = 'En cours' | 'Reçu' | 'Annulé' | 'Partiel'

interface PurchaseOrder {
  id: number
  number: string
  supplier: string
  date: string
  expectedDate: string
  items: number
  total: number
  status: POStatus
}

const ORDERS: PurchaseOrder[] = [
  { id: 1,  number: 'BC-2026-0112', supplier: 'Auto Parts SARL',   date: '28/04/2026', expectedDate: '05/05/2026', items: 15, total: 4200.000,  status: 'En cours' },
  { id: 2,  number: 'BC-2026-0111', supplier: 'TunisiAuto',         date: '27/04/2026', expectedDate: '01/05/2026', items: 8,  total: 2350.000,  status: 'En cours' },
  { id: 3,  number: 'BC-2026-0110', supplier: 'Maghreb Pièces',     date: '25/04/2026', expectedDate: '30/04/2026', items: 12, total: 3180.000,  status: 'Reçu'     },
  { id: 4,  number: 'BC-2026-0109', supplier: 'SpareHub Tunis',     date: '24/04/2026', expectedDate: '29/04/2026', items: 6,  total: 1560.000,  status: 'Reçu'     },
  { id: 5,  number: 'BC-2026-0108', supplier: 'Euro Parts TN',      date: '22/04/2026', expectedDate: '06/05/2026', items: 20, total: 8400.000,  status: 'En cours' },
  { id: 6,  number: 'BC-2026-0107', supplier: 'Bosch Tunisie',      date: '20/04/2026', expectedDate: '25/04/2026', items: 30, total: 12500.000, status: 'Reçu'     },
  { id: 7,  number: 'BC-2026-0106', supplier: 'Auto Parts SARL',    date: '18/04/2026', expectedDate: '23/04/2026', items: 10, total: 2800.000,  status: 'Partiel'  },
  { id: 8,  number: 'BC-2026-0105', supplier: 'Parts Express TN',   date: '15/04/2026', expectedDate: '20/04/2026', items: 5,  total: 950.000,   status: 'Reçu'     },
  { id: 9,  number: 'BC-2026-0104', supplier: 'TunisiAuto',         date: '12/04/2026', expectedDate: '17/04/2026', items: 18, total: 5200.000,  status: 'Annulé'   },
  { id: 10, number: 'BC-2026-0103', supplier: 'Maghreb Pièces',     date: '10/04/2026', expectedDate: '15/04/2026', items: 9,  total: 2100.000,  status: 'Reçu'     },
]

const statusVariant: Record<POStatus, 'amber' | 'green' | 'red' | 'blue'> = {
  'En cours': 'amber',
  'Reçu':     'green',
  'Annulé':   'red',
  'Partiel':  'blue',
}

const TABS = ['Tous', 'En cours', 'Reçus', 'Annulés']

const inProgress      = ORDERS.filter(o => o.status === 'En cours' || o.status === 'Partiel').length
const totalEngaged    = ORDERS.filter(o => o.status === 'En cours').reduce((a, o) => a + o.total, 0)
const expectedCount   = ORDERS.filter(o => o.status === 'En cours').length

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const [activeTab, setActiveTab] = useState('Tous')
  const [page, setPage] = useState(1)

  const filtered = ORDERS.filter(o => {
    if (activeTab === 'En cours') return o.status === 'En cours' || o.status === 'Partiel'
    if (activeTab === 'Reçus')    return o.status === 'Reçu'
    if (activeTab === 'Annulés')  return o.status === 'Annulé'
    return true
  })

  return (
    <>
      <Topbar
        title="Bons de commande"
        breadcrumb="Achats fournisseurs"
        action={
          <Button variant="primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouveau bon de commande
          </Button>
        }
      />

      <div className="content">

        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <StatCard
            variant="amber"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>}
            value={inProgress.toString()}
            label="Commandes en cours"
            trend="Suivi actif"
            trendType="up"
          />
          <StatCard
            variant="blue"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>}
            value={expectedCount.toString()}
            label="Livraisons attendues"
            trend="Cette semaine"
            trendType="up"
          />
          <StatCard
            variant="red"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            value={`${(totalEngaged / 1000).toFixed(1)}k DT`}
            label="Total engagé ce mois"
            trend="Budget achats"
            trendType="down"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHead>
            <CardTitle>Bons de commande</CardTitle>
            <Tabs tabs={TABS} active={activeTab} onChange={t => { setActiveTab(t); setPage(1) }} />
            <Button variant="ghost" style={{ marginLeft: 'auto' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Exporter
            </Button>
          </CardHead>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N° BC</th>
                  <th>Fournisseur</th>
                  <th>Date commande</th>
                  <th>Livraison prévue</th>
                  <th style={{ textAlign: 'center' }}>Nb articles</th>
                  <th style={{ textAlign: 'right' }}>Montant total</th>
                  <th style={{ textAlign: 'center' }}>Statut</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id}>
                    <td><RefCode code={o.number} /></td>
                    <td style={{ fontWeight: 500 }}>{o.supplier}</td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{o.date}</td>
                    <td>
                      <span style={{
                        fontSize: 12,
                        color: o.status === 'En cours' ? 'var(--amber)' : 'var(--text2)',
                        fontWeight: o.status === 'En cours' ? 600 : 400,
                      }}>
                        {o.expectedDate}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }}>{o.items}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>
                      {o.total.toFixed(3)} DT
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Badge variant={statusVariant[o.status]}>{o.status}</Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Voir">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        {o.status === 'En cours' && (
                          <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }} title="Marquer reçu">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </button>
                        )}
                        <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Modifier">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{filtered.length} bon{filtered.length > 1 ? 's' : ''} de commande</span>
            <Pagination page={page} total={filtered.length} pageSize={10} onPage={setPage} />
          </div>
        </Card>

      </div>
    </>
  )
}
