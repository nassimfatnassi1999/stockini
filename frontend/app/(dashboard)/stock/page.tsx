'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHead, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StockBadge } from '@/components/ui/Badge'
import { QtyBar } from '@/components/ui/QtyBar'
import { RefCode } from '@/components/ui/RefCode'
import { Pagination } from '@/components/ui/DataTable'

// ── Mock data ─────────────────────────────────────────────────────────────────

const INVENTORY = [
  { id: 1,  ref: 'FR-0842', name: 'Plaquettes de frein avant',  category: 'Freinage',     location: 'B-3',  qty: 48,  min: 10, unitCost: 22.500 },
  { id: 2,  ref: 'FT-1120', name: 'Filtre à huile moteur',       category: 'Filtres',      location: 'A-7',  qty: 6,   min: 10, unitCost: 6.000  },
  { id: 3,  ref: 'BAT-220', name: 'Batterie 12V 60Ah',           category: 'Batteries',    location: 'D-1',  qty: 22,  min: 5,  unitCost: 110.000 },
  { id: 4,  ref: 'AM-0055', name: 'Amortisseur avant gauche',    category: 'Suspension',   location: 'C-2',  qty: 0,   min: 5,  unitCost: 85.000 },
  { id: 5,  ref: 'BOU-331', name: "Bougie d'allumage NGK",        category: 'Moteur',       location: 'A-2',  qty: 130, min: 20, unitCost: 4.500  },
  { id: 6,  ref: 'EL-441',  name: 'Alternateur 90A',             category: 'Électricité',  location: 'E-4',  qty: 3,   min: 5,  unitCost: 195.000 },
  { id: 7,  ref: 'PNE-019', name: 'Pneu 195/65 R15',             category: 'Pneus',        location: 'F-1',  qty: 16,  min: 8,  unitCost: 130.000 },
  { id: 8,  ref: 'FC-088',  name: 'Filtre à carburant',          category: 'Filtres',      location: 'A-8',  qty: 34,  min: 10, unitCost: 8.000  },
  { id: 9,  ref: 'EMB-201', name: 'Kit embrayage complet',       category: 'Moteur',       location: 'C-5',  qty: 7,   min: 3,  unitCost: 145.000 },
  { id: 10, ref: 'SUS-044', name: 'Rotule de direction',         category: 'Suspension',   location: 'C-3',  qty: 19,  min: 8,  unitCost: 18.000 },
  { id: 11, ref: 'EL-302',  name: 'Démarreur 1.4kW',            category: 'Électricité',  location: 'E-2',  qty: 2,   min: 4,  unitCost: 120.000 },
  { id: 12, ref: 'FH-055',  name: 'Filtre habitacle',            category: 'Filtres',      location: 'A-9',  qty: 55,  min: 15, unitCost: 5.500  },
  { id: 13, ref: 'COU-112', name: 'Courroie de distribution',    category: 'Moteur',       location: 'B-1',  qty: 14,  min: 6,  unitCost: 48.000 },
  { id: 14, ref: 'POL-033', name: 'Pompe à eau',                 category: 'Refroidissement', location: 'B-5', qty: 9, min: 4, unitCost: 65.000 },
  { id: 15, ref: 'RAD-055', name: 'Radiateur de refroidissement',category: 'Refroidissement', location: 'D-3', qty: 0, min: 3, unitCost: 210.000 },
]

const totalValue = INVENTORY.reduce((a, p) => a + p.qty * p.unitCost, 0)
const underMin   = INVENTORY.filter(p => p.qty > 0 && p.qty <= p.min).length
const ruptures   = INVENTORY.filter(p => p.qty === 0).length

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StockPage() {
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)

  const filtered = INVENTORY.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.ref.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <Topbar
        title="Inventaire"
        breadcrumb="État du stock"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
              </svg>
              PDF
            </Button>
            <Button variant="ghost">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Excel
            </Button>
          </div>
        }
      />

      <div className="content">

        {/* Stats */}
        <div className="stats-grid">
          <StatCard
            variant="blue"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>}
            value={INVENTORY.length.toString()}
            label="Total articles"
            trend="Catalogue actif"
            trendType="up"
          />
          <StatCard
            variant="green"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            value={`${(totalValue / 1000).toFixed(1)}k DT`}
            label="Valeur totale"
            trend="+3.8% ce mois"
            trendType="up"
          />
          <StatCard
            variant="amber"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
            value={underMin.toString()}
            label="Articles sous seuil"
            trend="Réappro. urgent"
            trendType="down"
          />
          <StatCard
            variant="red"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>}
            value={ruptures.toString()}
            label="Ruptures de stock"
            trend="Action requise"
            trendType="down"
          />
        </div>

        {/* Table */}
        <Card>
          <CardHead>
            <CardTitle>État détaillé des stocks</CardTitle>
            <div className="search-bar" style={{ width: 260 }}>
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Rechercher…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button variant="ghost">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filtrer
            </Button>
          </CardHead>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th>Catégorie</th>
                  <th>Emplacement</th>
                  <th>Quantité</th>
                  <th>Seuil min.</th>
                  <th>Valeur stock</th>
                  <th style={{ textAlign: 'center' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td><RefCode code={item.ref} /></td>
                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                    <td><span className="tag">{item.category}</span></td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--teal)' }}>{item.location}</span>
                    </td>
                    <td><QtyBar quantity={item.qty} minStock={item.min} /></td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{item.min}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {(item.qty * item.unitCost).toFixed(3)} DT
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <StockBadge quantity={item.qty} minStock={item.min} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {filtered.length} articles affichés
            </span>
            <Pagination page={page} total={filtered.length} pageSize={10} onPage={setPage} />
          </div>
        </Card>

      </div>
    </>
  )
}
