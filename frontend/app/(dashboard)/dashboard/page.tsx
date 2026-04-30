'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHead, CardTitle } from '@/components/ui/Card'
import { AlertsPanel } from '@/components/ui/AlertsPanel'
import { SalesList } from '@/components/ui/SalesList'
import { QtyBar } from '@/components/ui/QtyBar'
import { RefCode } from '@/components/ui/RefCode'
import { StockBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FilterChips } from '@/components/ui/FilterChips'
import { Tabs } from '@/components/ui/Tabs'
import { Pagination } from '@/components/ui/DataTable'
import { MiniStat } from '@/components/ui/MiniStat'
import Link from 'next/link'

// ── Static data (will come from API) ──────────────────────────────────────────

const FILTER_OPTIONS = ['Tous les articles', 'Moteur', 'Freinage', 'Suspension', 'Électricité', 'Filtres', 'Batteries']

const STOCK_ITEMS = [
  { id: 1, ref: 'FR-0842', name: 'Plaquettes de frein avant', sub: 'Toyota Yaris 2018–2023', category: 'Freinage', quantity: 48, minStock: 10, price: '38,500 DT' },
  { id: 2, ref: 'FT-1120', name: 'Filtre à huile moteur', sub: 'Volkswagen Golf / Peugeot 308', category: 'Filtres', quantity: 6, minStock: 10, price: '12,000 DT' },
  { id: 3, ref: 'BAT-220', name: 'Batterie 12V 60Ah', sub: 'Universelle — Bosch Silver', category: 'Batteries', quantity: 22, minStock: 5, price: '185,000 DT' },
  { id: 4, ref: 'AM-0055', name: 'Amortisseur avant gauche', sub: 'Renault Logan 2015–2022', category: 'Suspension', quantity: 0, minStock: 5, price: '142,000 DT' },
  { id: 5, ref: 'BOU-331', name: "Bougie d'allumage NGK", sub: 'Multimarque — Essence', category: 'Moteur', quantity: 130, minStock: 20, price: '9,500 DT' },
  { id: 6, ref: 'EL-441', name: 'Alternateur 90A', sub: 'Peugeot 206 / 207 — 1.4 HDi', category: 'Électricité', quantity: 3, minStock: 5, price: '320,000 DT' },
  { id: 7, ref: 'PNE-019', name: 'Pneu 195/65 R15', sub: 'Continental — EcoContact 6', category: 'Pneus', quantity: 16, minStock: 8, price: '210,000 DT' },
]

const ALERTS = [
  { id: 1, message: 'Rupture — Amortisseur avant gauche (AM-0055)', time: 'Il y a 2 heures', color: 'red' as const },
  { id: 2, message: 'Stock bas — Filtre à huile (FT-1120) · 6 restants', time: 'Il y a 4 heures', color: 'amber' as const },
  { id: 3, message: 'Stock bas — Alternateur 90A (EL-441) · 3 restants', time: 'Il y a 5 heures', color: 'amber' as const },
  { id: 4, message: 'Facture #F-2024-0342 non payée — Client Garage Mabrouk', time: 'Depuis 8 jours', color: 'red' as const },
  { id: 5, message: 'Commande fournisseur BC-0112 en retard de 3 jours', time: 'Fournisseur : Auto Parts SARL', color: 'purple' as const },
  { id: 6, message: "Prix d'achat supérieur au prix de vente — REF-0091", time: 'Vérifier la marge', color: 'amber' as const },
  { id: 7, message: 'Stock dormant — 23 articles sans mouvement depuis 90j', time: 'Voir la liste complète', color: 'text3' as const },
]

const DAILY_SALES = [
  { id: 1, customerName: 'Garage Mabrouk', invoiceNumber: 'Facture #F-2024-0348', time: '10:34', amount: '2 340 DT', avatarColor: 'var(--accent-dim)', avatarTextColor: 'var(--accent2)' },
  { id: 2, customerName: 'Sami Mrad', invoiceNumber: 'Facture #F-2024-0347', time: '09:18', amount: '180 DT', avatarColor: 'var(--teal-dim)', avatarTextColor: 'var(--teal)' },
  { id: 3, customerName: 'Auto Top SARL', invoiceNumber: 'Facture #F-2024-0346', time: '08:55', amount: '4 750 DT', avatarColor: 'var(--amber-dim)', avatarTextColor: 'var(--amber)' },
  { id: 4, customerName: 'Khaled Azizi', invoiceNumber: 'Facture #F-2024-0345', time: '08:12', amount: '640 DT', avatarColor: 'var(--purple-dim)', avatarTextColor: 'var(--purple)' },
]

const TOP_PARTS = [
  { label: 'Filtre à huile', value: 312, pct: 100, color: 'var(--accent)' },
  { label: 'Plaquettes frein', value: 255, pct: 82, color: 'var(--accent)' },
  { label: 'Bougie allumage', value: 218, pct: 70, color: 'var(--teal)' },
  { label: 'Batterie 60Ah', value: 174, pct: 56, color: 'var(--teal)' },
  { label: 'Filtre habitacle', value: 149, pct: 48, color: 'var(--purple)' },
  { label: 'Courroie distrib.', value: 124, pct: 40, color: 'var(--purple)' },
  { label: 'Amortisseur ar.', value: 106, pct: 34, color: 'var(--amber)' },
  { label: 'Pneu 195/65 R15', value: 81, pct: 26, color: 'var(--amber)' },
  { label: 'Kit embrayage', value: 59, pct: 19, color: 'var(--red)' },
  { label: "Pompe à eau", value: 40, pct: 13, color: 'var(--red)' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [activeFilter, setActiveFilter] = useState('Tous les articles')
  const [activeTab, setActiveTab] = useState('Tous')
  const [page, setPage] = useState(1)

  return (
    <>
      <Topbar title="Tableau de bord" breadcrumb="Aperçu général" />

      <div className="content">

        {/* ── Row 1: 4 stat cards ── */}
        <div className="stats-grid">
          <StatCard
            variant="blue"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
            value="1 248"
            label="Articles en stock"
            trend="+23 ce mois"
            trendType="up"
          />
          <StatCard
            variant="green"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
            value="84 730 DT"
            label="Valeur totale du stock"
            trend="+5.2% vs mois passé"
            trendType="up"
          />
          <StatCard
            variant="amber"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            value="34"
            label="Articles sous seuil min."
            trend="Réapprovisionnement urgent"
            trendType="down"
          />
          <StatCard
            variant="red"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>}
            value="12"
            label="Ruptures de stock"
            trend="Action requise"
            trendType="down"
          />
        </div>

        {/* ── Row 2: 3 stat cards ── */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 22 }}>
          <StatCard
            variant="teal"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>}
            value="18 450 DT"
            label="Ventes du jour"
            trend="127 transactions"
            trendType="up"
          />
          <StatCard
            variant="purple"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>}
            value="31 200 DT"
            label="Achats du mois"
            trend="8 commandes"
            trendType="up"
          />
          <StatCard
            variant="blue"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}
            value="342"
            label="Clients actifs"
            trend="+12 nouveaux"
            trendType="up"
          />
        </div>

        {/* ── Main grid: table + right panel ── */}
        <div className="main-grid">

          {/* Stock table */}
          <Card>
            <CardHead>
              <CardTitle>Pièces détachées — Stock actuel</CardTitle>
              <Tabs tabs={['Tous', 'Bas', 'Rupture']} active={activeTab} onChange={setActiveTab} />
              <Button variant="ghost" style={{ marginLeft: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
                Filtrer
              </Button>
              <Link href="/products/new">
                <Button style={{ marginLeft: 4 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Ajouter
                </Button>
              </Link>
            </CardHead>

            <FilterChips options={FILTER_OPTIONS} active={activeFilter} onChange={setActiveFilter} />

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Désignation</th>
                    <th>Catégorie</th>
                    <th>Quantité</th>
                    <th>Prix vente</th>
                    <th style={{ textAlign: 'right' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {STOCK_ITEMS.map((item) => (
                    <tr key={item.id}>
                      <td><RefCode code={item.ref} /></td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{item.name}</div>
                        <div className="td-muted">{item.sub}</div>
                      </td>
                      <td><span className="tag">{item.category}</span></td>
                      <td><QtyBar quantity={item.quantity} minStock={item.minStock} /></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{item.price}</td>
                      <td style={{ textAlign: 'right' }}>
                        <StockBadge quantity={item.quantity} minStock={item.minStock} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Affichage 1–7 sur 1 248 articles</span>
              <Pagination page={page} total={1248} pageSize={7} onPage={setPage} />
            </div>
          </Card>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <AlertsPanel alerts={ALERTS} count={7} />
            <SalesList sales={DAILY_SALES} totalAmount="18 450 DT" />
          </div>
        </div>

        {/* ── Bottom grid ── */}
        <div className="bottom-grid">

          {/* Top 10 chart */}
          <Card>
            <CardHead>
              <CardTitle>Top 10 — Pièces les plus vendues</CardTitle>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>Ce mois</span>
            </CardHead>
            <div className="chart-area">
              {TOP_PARTS.map((p) => (
                <div key={p.label} className="chart-row">
                  <div className="chart-label">{p.label}</div>
                  <div className="chart-bar-wrap">
                    <div className="chart-bar" style={{ width: `${p.pct}%`, background: p.color }}>
                      <span className="chart-bar-val">{p.value}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick reports */}
          <Card>
            <CardHead><CardTitle>Rapports rapides</CardTitle></CardHead>
            <div>
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
                iconVariant="green"
                label="Bénéfice brut (mois)"
                value={<span style={{ color: 'var(--green)' }}>24 180 DT</span>}
                right={<span style={{ color: 'var(--green)' }}>+18%</span>}
              />
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
                iconVariant="blue"
                label="Chiffre d'affaires (mois)"
                value="142 300 DT"
                right={<span style={{ color: 'var(--accent2)' }}>+9%</span>}
              />
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}
                iconVariant="amber"
                label="Dettes clients"
                value={<span style={{ color: 'var(--amber)' }}>8 450 DT</span>}
                right={<span style={{ color: 'var(--text3)' }}>12 clients</span>}
              />
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>}
                iconVariant="red"
                label="Dettes fournisseurs"
                value={<span style={{ color: 'var(--red)' }}>14 200 DT</span>}
                right={<span style={{ color: 'var(--text3)' }}>5 fourn.</span>}
              />
              <MiniStat
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                iconVariant="purple"
                label="Mouvements stock (mois)"
                value="1 842"
                right={<span style={{ color: 'var(--text3)' }}>entrées + sorties</span>}
              />
              <div className="mini-stat">
                <div className="mini-icon si-teal">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </div>
                <div>
                  <div className="mini-label">Exports</div>
                  <div className="mini-val">PDF · Excel · CSV</div>
                </div>
                <Button variant="ghost" style={{ height: 26, padding: '0 10px', fontSize: 10, marginLeft: 'auto' }}>
                  Générer
                </Button>
              </div>
            </div>
          </Card>

          {/* Quick actions + System status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
              <CardHead><CardTitle>Actions rapides</CardTitle></CardHead>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { href: '/sales/new', label: 'Nouvelle vente / caisse', variant: 'primary' as const, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> },
                  { href: '/products/new', label: 'Ajouter une pièce', variant: 'ghost' as const, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> },
                  { href: '/stock/movements', label: 'Entrée / Sortie stock', variant: 'ghost' as const, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
                  { href: '/purchases/new', label: 'Créer bon de commande', variant: 'ghost' as const, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
                ].map((action) => (
                  <Link key={action.href} href={action.href}>
                    <Button variant={action.variant} fullWidth style={{ height: 40, gap: 10 }}>
                      <span style={{ width: 15, height: 15, flexShrink: 0 }}>{action.icon}</span>
                      {action.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </Card>

            <Card>
              <CardHead><CardTitle>Statut du système</CardTitle></CardHead>
              <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Base de données', status: 'Connectée', color: 'var(--green)' },
                  { label: 'Sauvegarde auto', status: 'Il y a 12 min', color: 'var(--text3)' },
                  { label: 'Caisse active', status: 'En ligne', color: 'var(--green)' },
                  { label: 'Lecteur code-barres', status: 'Inactif', color: 'var(--amber)', dot: 'var(--amber)' },
                ].map((s) => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot ?? 'var(--green)', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--text2)' }}>{s.label}</span>
                    <span style={{ color: s.color, fontSize: 11, fontWeight: 500 }}>{s.status}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 11, color: 'var(--text3)' }}>
                  Utilisateurs connectés : <span style={{ color: 'var(--text2)', fontWeight: 500 }}>3</span> &nbsp;·&nbsp; Version 1.0.0
                </div>
              </div>
            </Card>
          </div>
        </div>

      </div>
    </>
  )
}
