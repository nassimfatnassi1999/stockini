'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHead, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { RefCode } from '@/components/ui/RefCode'
import { Pagination } from '@/components/ui/DataTable'
import { getInitials } from '@/lib/utils'

// ── Mock data ─────────────────────────────────────────────────────────────────

type InvoiceStatus = 'Payée' | 'En attente' | 'Annulée'

interface Invoice {
  id: number
  number: string
  customer: string
  date: string
  items: number
  total: number
  status: InvoiceStatus
}

const INVOICES: Invoice[] = [
  { id: 1,  number: 'F-2026-0348', customer: 'Garage Mabrouk',     date: '30/04/2026', items: 5,  total: 2340.000, status: 'Payée' },
  { id: 2,  number: 'F-2026-0347', customer: 'Sami Mrad',          date: '30/04/2026', items: 2,  total: 180.000,  status: 'Payée' },
  { id: 3,  number: 'F-2026-0346', customer: 'Auto Top SARL',       date: '30/04/2026', items: 8,  total: 4750.000, status: 'En attente' },
  { id: 4,  number: 'F-2026-0345', customer: 'Khaled Azizi',        date: '29/04/2026', items: 3,  total: 640.000,  status: 'Payée' },
  { id: 5,  number: 'F-2026-0344', customer: 'Garage Centrale',     date: '29/04/2026', items: 4,  total: 1120.000, status: 'En attente' },
  { id: 6,  number: 'F-2026-0343', customer: 'Mohamed Trabelsi',    date: '29/04/2026', items: 2,  total: 385.000,  status: 'Payée' },
  { id: 7,  number: 'F-2026-0342', customer: 'Garage Mabrouk',      date: '28/04/2026', items: 6,  total: 3200.000, status: 'En attente' },
  { id: 8,  number: 'F-2026-0341', customer: 'Rania Kchouk',        date: '28/04/2026', items: 1,  total: 210.000,  status: 'Payée' },
  { id: 9,  number: 'F-2026-0340', customer: 'Auto Top SARL',       date: '27/04/2026', items: 10, total: 6840.000, status: 'Payée' },
  { id: 10, number: 'F-2026-0339', customer: 'Nabil Benzarti',      date: '27/04/2026', items: 3,  total: 760.000,  status: 'Annulée' },
  { id: 11, number: 'F-2026-0338', customer: 'Garage Slim & Fils',  date: '26/04/2026', items: 7,  total: 2890.000, status: 'Payée' },
  { id: 12, number: 'F-2026-0337', customer: 'Sami Mrad',           date: '26/04/2026', items: 2,  total: 450.000,  status: 'En attente' },
]

const statusVariant: Record<InvoiceStatus, 'green' | 'amber' | 'red'> = {
  'Payée':      'green',
  'En attente': 'amber',
  'Annulée':    'red',
}

const AVATAR_COLORS = [
  { bg: 'var(--accent-dim)',  text: 'var(--accent2)' },
  { bg: 'var(--teal-dim)',    text: 'var(--teal)' },
  { bg: 'var(--amber-dim)',   text: 'var(--amber)' },
  { bg: 'var(--purple-dim)',  text: 'var(--purple)' },
  { bg: 'var(--green-dim)',   text: 'var(--green)' },
]

const todayTotal   = INVOICES.filter(i => i.date === '30/04/2026' && i.status !== 'Annulée').reduce((a, i) => a + i.total, 0)
const monthTotal   = INVOICES.filter(i => i.status !== 'Annulée').reduce((a, i) => a + i.total, 0)
const pendingCount = INVOICES.filter(i => i.status === 'En attente').length
const unpaidTotal  = INVOICES.filter(i => i.status === 'En attente').reduce((a, i) => a + i.total, 0)

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const [activeTab, setActiveTab] = useState('Toutes')
  const [page, setPage] = useState(1)

  const filtered = INVOICES.filter(inv => {
    if (activeTab === 'En attente') return inv.status === 'En attente'
    if (activeTab === 'Payées')     return inv.status === 'Payée'
    if (activeTab === 'Annulées')   return inv.status === 'Annulée'
    return true
  })

  return (
    <>
      <Topbar
        title="Factures & Ventes"
        breadcrumb="Gestion des ventes"
        action={
          <Link href="/sales/new" className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouvelle vente
          </Link>
        }
      />

      <div className="content">

        {/* Stats */}
        <div className="stats-grid">
          <StatCard
            variant="teal"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>}
            value={`${todayTotal.toFixed(3)} DT`}
            label="Ventes du jour"
            trend="3 transactions"
            trendType="up"
          />
          <StatCard
            variant="green"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>}
            value={`${(monthTotal / 1000).toFixed(1)}k DT`}
            label="Ventes du mois"
            trend="+12% vs mois passé"
            trendType="up"
          />
          <StatCard
            variant="amber"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
            value={pendingCount.toString()}
            label="Factures en attente"
            trend="Relances à faire"
            trendType="down"
          />
          <StatCard
            variant="red"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            value={`${unpaidTotal.toFixed(0)} DT`}
            label="Montant impayé"
            trend="Recouvrement urgent"
            trendType="down"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHead>
            <CardTitle>Liste des factures</CardTitle>
            <Tabs tabs={['Toutes', 'En attente', 'Payées', 'Annulées']} active={activeTab} onChange={t => { setActiveTab(t); setPage(1) }} />
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
                  <th>N° Facture</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'center' }}>Articles</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Statut</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, i) => {
                  const av = AVATAR_COLORS[i % AVATAR_COLORS.length]
                  return (
                    <tr key={inv.id}>
                      <td><RefCode code={inv.number} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: av.bg, color: av.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                            {getInitials(inv.customer)}
                          </div>
                          <span style={{ fontWeight: 500 }}>{inv.customer}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 12 }}>{inv.date}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 12 }}>{inv.items} article{inv.items > 1 ? 's' : ''}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>
                        {inv.total.toFixed(3)} DT
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Voir PDF">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                            </svg>
                          </button>
                          <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Modifier">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{filtered.length} facture{filtered.length > 1 ? 's' : ''}</span>
            <Pagination page={page} total={filtered.length} pageSize={10} onPage={setPage} />
          </div>
        </Card>

      </div>
    </>
  )
}
