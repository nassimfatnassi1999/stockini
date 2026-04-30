'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHead, CardTitle } from '@/components/ui/Card'
import { StockBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FilterChips } from '@/components/ui/FilterChips'
import { QtyBar } from '@/components/ui/QtyBar'
import { RefCode } from '@/components/ui/RefCode'
import { Pagination } from '@/components/ui/DataTable'

// ── Static mock data ──────────────────────────────────────────────────────────

const FILTER_OPTIONS = ['Tous', 'Moteur', 'Freinage', 'Suspension', 'Électricité', 'Filtres', 'Batteries', 'Pneus']

const PRODUCTS = [
  { id: 1, ref: 'FR-0842', barcode: '3701234500001', name: 'Plaquettes de frein avant', sub: 'Toyota Yaris 2018–2023', category: 'Freinage', brand: 'Brembo', stock: 48, minStock: 10, buyPrice: 22.500, sellPrice: 38.500 },
  { id: 2, ref: 'FT-1120', barcode: '3701234500002', name: 'Filtre à huile moteur', sub: 'VW Golf / Peugeot 308', category: 'Filtres', brand: 'Mann', stock: 6, minStock: 10, buyPrice: 6.000, sellPrice: 12.000 },
  { id: 3, ref: 'BAT-220', barcode: '3701234500003', name: 'Batterie 12V 60Ah', sub: 'Universelle — Bosch Silver', category: 'Batteries', brand: 'Bosch', stock: 22, minStock: 5, buyPrice: 110.000, sellPrice: 185.000 },
  { id: 4, ref: 'AM-0055', barcode: '3701234500004', name: 'Amortisseur avant gauche', sub: 'Renault Logan 2015–2022', category: 'Suspension', brand: 'Monroe', stock: 0, minStock: 5, buyPrice: 85.000, sellPrice: 142.000 },
  { id: 5, ref: 'BOU-331', barcode: '3701234500005', name: "Bougie d'allumage NGK", sub: 'Multimarque — Essence', category: 'Moteur', brand: 'NGK', stock: 130, minStock: 20, buyPrice: 4.500, sellPrice: 9.500 },
  { id: 6, ref: 'EL-441', barcode: '3701234500006', name: 'Alternateur 90A', sub: 'Peugeot 206/207 — 1.4 HDi', category: 'Électricité', brand: 'Valeo', stock: 3, minStock: 5, buyPrice: 195.000, sellPrice: 320.000 },
  { id: 7, ref: 'PNE-019', barcode: '3701234500007', name: 'Pneu 195/65 R15', sub: 'Continental — EcoContact 6', category: 'Pneus', brand: 'Continental', stock: 16, minStock: 8, buyPrice: 130.000, sellPrice: 210.000 },
  { id: 8, ref: 'FC-088', barcode: '3701234500008', name: 'Filtre à carburant', sub: 'Diesel — multimarque', category: 'Filtres', brand: 'Bosch', stock: 34, minStock: 10, buyPrice: 8.000, sellPrice: 15.000 },
  { id: 9, ref: 'EMB-201', barcode: '3701234500009', name: 'Kit embrayage complet', sub: 'Clio 4 / Captur 1.2 TCe', category: 'Moteur', brand: 'Sachs', stock: 7, minStock: 3, buyPrice: 145.000, sellPrice: 240.000 },
  { id: 10, ref: 'SUS-044', barcode: '3701234500010', name: 'Rotule de direction', sub: 'Dacia Sandero II 2013+', category: 'Suspension', brand: 'Moog', stock: 19, minStock: 8, buyPrice: 18.000, sellPrice: 32.000 },
  { id: 11, ref: 'EL-302', barcode: '3701234500011', name: 'Démarreur 1.4kW', sub: 'Fiat Punto / Bravo 1.2', category: 'Électricité', brand: 'Bosch', stock: 2, minStock: 4, buyPrice: 120.000, sellPrice: 195.000 },
  { id: 12, ref: 'FH-055', barcode: '3701234500012', name: 'Filtre habitacle', sub: 'Renault Megane III', category: 'Filtres', brand: 'Purflux', stock: 55, minStock: 15, buyPrice: 5.500, sellPrice: 11.000 },
]

const totalValue = PRODUCTS.reduce((acc, p) => acc + p.stock * p.sellPrice, 0)
const lowStock = PRODUCTS.filter(p => p.stock > 0 && p.stock <= p.minStock).length
const outOfStock = PRODUCTS.filter(p => p.stock === 0).length

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [activeFilter, setActiveFilter] = useState('Tous')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = PRODUCTS.filter(p => {
    const matchFilter = activeFilter === 'Tous' || p.category === activeFilter
    const matchSearch = search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.ref.toLowerCase().includes(search.toLowerCase()) ||
      p.brand.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  return (
    <>
      <Topbar
        title="Pièces détachées"
        breadcrumb="Catalogue complet"
        action={
          <Link href="/products/new" className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Ajouter une pièce
          </Link>
        }
      />

      <div className="content">

        {/* Stats row */}
        <div className="stats-grid">
          <StatCard
            variant="blue"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>}
            value={PRODUCTS.length.toString()}
            label="Total pièces"
            trend="+8 ce mois"
            trendType="up"
          />
          <StatCard
            variant="amber"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
            value={lowStock.toString()}
            label="Stock bas"
            trend="Réappro. urgent"
            trendType="down"
          />
          <StatCard
            variant="red"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>}
            value={outOfStock.toString()}
            label="Ruptures de stock"
            trend="Action requise"
            trendType="down"
          />
          <StatCard
            variant="green"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            value={`${(totalValue / 1000).toFixed(0)} DT`}
            label="Valeur totale stock"
            trend="+5.2% vs mois passé"
            trendType="up"
          />
        </div>

        {/* Table card */}
        <Card>
          <CardHead>
            <CardTitle>Catalogue des pièces</CardTitle>
            {/* Inline search */}
            <div className="search-bar" style={{ width: 260 }}>
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Réf, désignation, marque…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button variant="ghost">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <line x1="21" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="3" y2="18" />
              </svg>
              Exporter
            </Button>
          </CardHead>

          <FilterChips options={FILTER_OPTIONS} active={activeFilter} onChange={v => { setActiveFilter(v); setPage(1) }} />

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th>Catégorie</th>
                  <th>Marque</th>
                  <th>Stock</th>
                  <th>Prix achat</th>
                  <th>Prix vente</th>
                  <th style={{ textAlign: 'center' }}>Statut</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td><RefCode code={item.ref} /></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{item.name}</div>
                      <div className="td-muted">{item.sub}</div>
                    </td>
                    <td><span className="tag">{item.category}</span></td>
                    <td style={{ color: 'var(--text2)' }}>{item.brand}</td>
                    <td><QtyBar quantity={item.stock} minStock={item.minStock} /></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>
                      {item.buyPrice.toFixed(3)} DT
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
                      {item.sellPrice.toFixed(3)} DT
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <StockBadge quantity={item.stock} minStock={item.minStock} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Link href={`/products/${item.id}`}>
                          <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Modifier">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </Link>
                        <button className="btn btn-ghost" style={{ width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }} title="Supprimer">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
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
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              Affichage {filtered.length === 0 ? 0 : (page - 1) * 10 + 1}–{Math.min(page * 10, filtered.length)} sur {filtered.length} pièces
            </span>
            <Pagination page={page} total={filtered.length} pageSize={10} onPage={setPage} />
          </div>
        </Card>

      </div>
    </>
  )
}
