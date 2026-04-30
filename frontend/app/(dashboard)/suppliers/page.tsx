'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHead, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/DataTable'
import { getInitials } from '@/lib/utils'

// ── Mock data ─────────────────────────────────────────────────────────────────

interface Supplier {
  id: number
  name: string
  contact: string
  phone: string
  email: string
  products: number
  orders: number
  avgDelay: number
  debt: number
  status: 'Actif' | 'Inactif' | 'En négociation'
}

const SUPPLIERS: Supplier[] = [
  { id: 1, name: 'Auto Parts SARL',     contact: 'Hatem Cherif',    phone: '+216 71 234 567', email: 'hatem@autoparts.tn',       products: 142, orders: 24, avgDelay: 3,  debt: 4200.000, status: 'Actif'          },
  { id: 2, name: 'Maghreb Pièces',       contact: 'Karim Oueslati',  phone: '+216 73 345 678', email: 'k.oueslati@maghrebp.com',   products: 89,  orders: 18, avgDelay: 5,  debt: 2850.000, status: 'Actif'          },
  { id: 3, name: 'TunisiAuto',           contact: 'Sofiane Maaref',  phone: '+216 22 456 789', email: 'contact@tunisiauto.tn',     products: 217, orders: 31, avgDelay: 2,  debt: 0,        status: 'Actif'          },
  { id: 4, name: 'SpareHub Tunis',       contact: 'Leila Jendoubi',  phone: '+216 55 567 890', email: 'leila@sparehub.tn',         products: 64,  orders: 12, avgDelay: 7,  debt: 1500.000, status: 'Actif'          },
  { id: 5, name: 'Euro Parts TN',        contact: 'Bruno Ferrari',   phone: '+33 4 56 78 90 12', email: 'bferrari@europarts.fr',   products: 312, orders: 8,  avgDelay: 14, debt: 5650.000, status: 'Actif'          },
  { id: 6, name: 'Bosch Tunisie',        contact: 'Mehdi Sghaier',   phone: '+216 71 789 012', email: 'm.sghaier@bosch-tn.com',    products: 188, orders: 42, avgDelay: 4,  debt: 0,        status: 'Actif'          },
  { id: 7, name: 'Continental Africa',   contact: 'Aymen Boughzala', phone: '+216 74 890 123', email: 'a.boughzala@continental.tn',products: 48,  orders: 6,  avgDelay: 21, debt: 0,        status: 'En négociation' },
  { id: 8, name: 'Valeo Distribution',   contact: 'Pierre Leclerc',  phone: '+33 1 23 45 67 89', email: 'p.leclerc@valeo.com',     products: 275, orders: 15, avgDelay: 10, debt: 0,        status: 'Inactif'        },
  { id: 9, name: 'Parts Express TN',     contact: 'Zied Chaabane',   phone: '+216 52 901 234', email: 'zied@partsexpress.tn',      products: 101, orders: 9,  avgDelay: 4,  debt: 1800.000, status: 'Actif'          },
]

const statusVariant: Record<string, 'green' | 'amber' | 'red'> = {
  'Actif':          'green',
  'En négociation': 'amber',
  'Inactif':        'red',
}

const AVATAR_COLORS = [
  { bg: 'var(--accent-dim)', text: 'var(--accent2)' },
  { bg: 'var(--teal-dim)',   text: 'var(--teal)'    },
  { bg: 'var(--amber-dim)',  text: 'var(--amber)'   },
  { bg: 'var(--purple-dim)', text: 'var(--purple)'  },
  { bg: 'var(--green-dim)',  text: 'var(--green)'   },
]

const totalDebt    = SUPPLIERS.reduce((a, s) => a + s.debt, 0)
const activeOrders = SUPPLIERS.filter(s => s.status === 'Actif').length

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)

  const filtered = SUPPLIERS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.contact.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <Topbar
        title="Fournisseurs"
        breadcrumb="Gestion fournisseurs"
        action={
          <Button variant="primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nouveau fournisseur
          </Button>
        }
      />

      <div className="content">

        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <StatCard
            variant="blue"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-4 0v2" /></svg>}
            value={SUPPLIERS.length.toString()}
            label="Total fournisseurs"
            trend="Partenaires actifs"
            trendType="up"
          />
          <StatCard
            variant="teal"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>}
            value={activeOrders.toString()}
            label="Fournisseurs actifs"
            trend="En cours de collaboration"
            trendType="up"
          />
          <StatCard
            variant="red"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            value={`${(totalDebt / 1000).toFixed(1)}k DT`}
            label="Dette totale fournisseurs"
            trend="Échéances à vérifier"
            trendType="down"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHead>
            <CardTitle>Liste des fournisseurs</CardTitle>
            <div className="search-bar" style={{ width: 260 }}>
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Nom, contact, email…"
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
                  <th>Contact</th>
                  <th>Téléphone</th>
                  <th>Email</th>
                  <th style={{ textAlign: 'center' }}>Produits</th>
                  <th style={{ textAlign: 'center' }}>Commandes</th>
                  <th style={{ textAlign: 'center' }}>Délai moy.</th>
                  <th style={{ textAlign: 'right' }}>Dette</th>
                  <th style={{ textAlign: 'center' }}>Statut</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const av = AVATAR_COLORS[i % AVATAR_COLORS.length]
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 'var(--r)', background: av.bg, color: av.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {getInitials(s.name)}
                          </div>
                          <span style={{ fontWeight: 500 }}>{s.name}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 12 }}>{s.contact}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{s.phone}</td>
                      <td style={{ color: 'var(--text3)', fontSize: 11 }}>{s.email}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }}>{s.products}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }}>{s.orders}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: s.avgDelay <= 5 ? 'var(--green)' : s.avgDelay <= 14 ? 'var(--amber)' : 'var(--red)',
                        }}>
                          {s.avgDelay} j
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {s.debt > 0
                          ? <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>{s.debt.toFixed(3)} DT</span>
                          : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                        }
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Badge variant={statusVariant[s.status]}>{s.status}</Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Modifier">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Commander">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
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
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{filtered.length} fournisseur{filtered.length > 1 ? 's' : ''}</span>
            <Pagination page={page} total={filtered.length} pageSize={10} onPage={setPage} />
          </div>
        </Card>

      </div>
    </>
  )
}
