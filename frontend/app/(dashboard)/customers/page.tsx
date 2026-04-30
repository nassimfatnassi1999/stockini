'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHead, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/DataTable'
import { getInitials } from '@/lib/utils'

// ── Mock data ─────────────────────────────────────────────────────────────────

interface Customer {
  id: number
  name: string
  phone: string
  email: string
  address: string
  orders: number
  totalPurchases: number
  debt: number
  lastVisit: string
  active: boolean
}

const CUSTOMERS: Customer[] = [
  { id: 1,  name: 'Garage Mabrouk',       phone: '+216 98 123 456', email: 'mabrouk.garage@gmail.com',   address: 'Av. Habib Bourguiba, Tunis',      orders: 48, totalPurchases: 42300.000, debt: 3200.000, lastVisit: '30/04/2026', active: true  },
  { id: 2,  name: 'Auto Top SARL',         phone: '+216 71 234 567', email: 'contact@autotop.tn',          address: 'Zone Industrielle, Sfax',         orders: 62, totalPurchases: 68500.000, debt: 4750.000, lastVisit: '30/04/2026', active: true  },
  { id: 3,  name: 'Sami Mrad',             phone: '+216 55 345 678', email: 'sami.mrad@hotmail.com',       address: '12 Rue Ibn Khaldoun, Sousse',     orders: 14, totalPurchases: 4200.000,  debt: 0,        lastVisit: '30/04/2026', active: true  },
  { id: 4,  name: 'Khaled Azizi',          phone: '+216 22 456 789', email: 'khaled.azizi@gmail.com',      address: 'Cité Olympique, Tunis',           orders: 9,  totalPurchases: 3150.000,  debt: 0,        lastVisit: '29/04/2026', active: true  },
  { id: 5,  name: 'Garage Centrale',       phone: '+216 73 567 890', email: 'garagecentrale@live.fr',      address: 'Route de Gafsa, Kairouan',        orders: 31, totalPurchases: 24100.000, debt: 1120.000, lastVisit: '29/04/2026', active: true  },
  { id: 6,  name: 'Mohamed Trabelsi',      phone: '+216 92 678 901', email: 'm.trabelsi@yahoo.fr',         address: 'Mégrine, Ben Arous',             orders: 7,  totalPurchases: 1850.000,  debt: 0,        lastVisit: '29/04/2026', active: true  },
  { id: 7,  name: 'Rania Kchouk',          phone: '+216 27 789 012', email: 'rania.kchouk@gmail.com',      address: 'La Marsa, Tunis',                orders: 5,  totalPurchases: 980.000,   debt: 0,        lastVisit: '28/04/2026', active: true  },
  { id: 8,  name: 'Garage Slim & Fils',    phone: '+216 74 890 123', email: 'slim.fils.garage@gmail.com',  address: 'Route Nationale 1, Gabès',       orders: 23, totalPurchases: 18700.000, debt: 0,        lastVisit: '26/04/2026', active: true  },
  { id: 9,  name: 'Nabil Benzarti',        phone: '+216 52 901 234', email: 'nabil.benzarti@gmail.com',    address: 'Ennasr 2, Ariana',               orders: 4,  totalPurchases: 2200.000,  debt: 0,        lastVisit: '27/04/2026', active: false },
  { id: 10, name: 'TechAuto Bizerte',      phone: '+216 72 012 345', email: 'techauto.bizerte@gmail.com',  address: 'Port de Bizerte, Bizerte',        orders: 18, totalPurchases: 12400.000, debt: 0,        lastVisit: '24/04/2026', active: true  },
  { id: 11, name: 'Youssef Hamdi',         phone: '+216 95 123 456', email: 'youssef.hamdi@yahoo.fr',      address: 'Nabeul Centre, Nabeul',           orders: 6,  totalPurchases: 1760.000,  debt: 380.000,  lastVisit: '22/04/2026', active: true  },
  { id: 12, name: 'Garage Express Ariana', phone: '+216 71 234 890', email: 'express.ariana@live.com',     address: 'Riadh Andoulsia, Ariana',         orders: 29, totalPurchases: 21500.000, debt: 0,        lastVisit: '20/04/2026', active: true  },
]

const AVATAR_COLORS = [
  { bg: 'var(--accent-dim)', text: 'var(--accent2)' },
  { bg: 'var(--teal-dim)',   text: 'var(--teal)'    },
  { bg: 'var(--amber-dim)',  text: 'var(--amber)'   },
  { bg: 'var(--purple-dim)', text: 'var(--purple)'  },
  { bg: 'var(--green-dim)',  text: 'var(--green)'   },
  { bg: 'var(--red-dim)',    text: 'var(--red)'     },
]

const totalDebt    = CUSTOMERS.reduce((a, c) => a + c.debt, 0)
const activeCount  = CUSTOMERS.filter(c => c.active).length
const monthSales   = CUSTOMERS.filter(c => c.lastVisit.endsWith('04/2026')).reduce((a, c) => a + c.totalPurchases * 0.1, 0)

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)

  const filtered = CUSTOMERS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <Topbar
        title="Clients"
        breadcrumb="Gestion clientèle"
        action={
          <Button variant="primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouveau client
          </Button>
        }
      />

      <div className="content">

        {/* Stats */}
        <div className="stats-grid">
          <StatCard
            variant="blue"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
            value={CUSTOMERS.length.toString()}
            label="Total clients"
            trend="+12 ce mois"
            trendType="up"
          />
          <StatCard
            variant="green"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
            value={activeCount.toString()}
            label="Clients actifs"
            trend="Ce mois-ci"
            trendType="up"
          />
          <StatCard
            variant="red"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            value={`${totalDebt.toFixed(0)} DT`}
            label="Dette totale clients"
            trend="Recouvrement actif"
            trendType="down"
          />
          <StatCard
            variant="teal"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>}
            value={`${(monthSales / 1000).toFixed(1)}k DT`}
            label="Ventes ce mois"
            trend="+9% vs mois passé"
            trendType="up"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHead>
            <CardTitle>Liste des clients</CardTitle>
            <div className="search-bar" style={{ width: 260 }}>
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Nom, téléphone, email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button variant="ghost">
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
                  <th>Nom</th>
                  <th>Téléphone</th>
                  <th>Email</th>
                  <th>Adresse</th>
                  <th style={{ textAlign: 'center' }}>Commandes</th>
                  <th style={{ textAlign: 'right' }}>Total achats</th>
                  <th style={{ textAlign: 'right' }}>Dette</th>
                  <th>Dernière visite</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const av = AVATAR_COLORS[i % AVATAR_COLORS.length]
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: av.bg, color: av.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {getInitials(c.name)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500 }}>{c.name}</div>
                            <span className={`badge badge-${c.active ? 'green' : 'red'}`} style={{ fontSize: 9 }}>
                              {c.active ? 'Actif' : 'Inactif'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{c.phone}</td>
                      <td style={{ color: 'var(--text2)', fontSize: 12 }}>{c.email}</td>
                      <td style={{ color: 'var(--text3)', fontSize: 11 }}>{c.address}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{c.orders}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
                        {c.totalPurchases.toFixed(3)} DT
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {c.debt > 0
                          ? <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>{c.debt.toFixed(3)} DT</span>
                          : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                        }
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.lastVisit}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Voir">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
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
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{filtered.length} client{filtered.length > 1 ? 's' : ''}</span>
            <Pagination page={page} total={filtered.length} pageSize={10} onPage={setPage} />
          </div>
        </Card>

      </div>
    </>
  )
}
