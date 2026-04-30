'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardHead, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { RefCode } from '@/components/ui/RefCode'

// ── Mock data ─────────────────────────────────────────────────────────────────

type AlertLevel  = 'critical' | 'warning' | 'info'
type AlertCategory = 'Ruptures' | 'Stock bas' | 'Financières' | 'Commandes'

interface Alert {
  id: number
  level: AlertLevel
  category: AlertCategory
  title: string
  detail: string
  time: string
  ref?: string
  resolved: boolean
}

const ALERTS: Alert[] = [
  { id: 1,  level: 'critical', category: 'Ruptures',    title: 'Rupture de stock',             detail: 'Amortisseur avant gauche (AM-0055) — 0 unité restante',          time: 'Il y a 2h',    ref: 'AM-0055', resolved: false },
  { id: 2,  level: 'critical', category: 'Ruptures',    title: 'Rupture de stock',             detail: 'Radiateur de refroidissement (RAD-055) — 0 unité restante',       time: 'Il y a 4h',    ref: 'RAD-055', resolved: false },
  { id: 3,  level: 'critical', category: 'Financières', title: 'Facture impayée',              detail: 'Facture F-2026-0342 — Garage Mabrouk — 3 200 DT depuis 8 jours',  time: 'Il y a 8j',    ref: 'F-2026-0342', resolved: false },
  { id: 4,  level: 'critical', category: 'Financières', title: 'Facture impayée',              detail: 'Facture F-2026-0346 — Auto Top SARL — 4 750 DT depuis 2 jours',   time: 'Il y a 2j',    ref: 'F-2026-0346', resolved: false },
  { id: 5,  level: 'warning',  category: 'Stock bas',   title: 'Stock sous seuil minimum',    detail: 'Filtre à huile moteur (FT-1120) — 6 unités · seuil: 10',           time: 'Il y a 4h',    ref: 'FT-1120', resolved: false },
  { id: 6,  level: 'warning',  category: 'Stock bas',   title: 'Stock sous seuil minimum',    detail: 'Alternateur 90A (EL-441) — 3 unités · seuil: 5',                  time: 'Il y a 5h',    ref: 'EL-441',  resolved: false },
  { id: 7,  level: 'warning',  category: 'Stock bas',   title: 'Stock sous seuil minimum',    detail: 'Démarreur 1.4kW (EL-302) — 2 unités · seuil: 4',                  time: 'Il y a 6h',    ref: 'EL-302',  resolved: false },
  { id: 8,  level: 'warning',  category: 'Commandes',   title: 'Livraison en retard',         detail: 'BC-2026-0108 — Euro Parts TN — attendue le 27/04 (+3 jours)',      time: 'Il y a 3j',    ref: 'BC-2026-0108', resolved: false },
  { id: 9,  level: 'warning',  category: 'Financières', title: 'Marge négative',              detail: 'Pièce REF-0091 : prix achat > prix vente — à corriger',            time: 'Il y a 1j',    ref: 'REF-0091', resolved: false },
  { id: 10, level: 'warning',  category: 'Stock bas',   title: 'Stock sous seuil minimum',    detail: 'Kit embrayage (EMB-201) — 7 unités · seuil: 3 ✓ surveiller',       time: 'Il y a 3h',    ref: 'EMB-201', resolved: false },
  { id: 11, level: 'info',     category: 'Stock bas',   title: 'Stock dormant détecté',       detail: '23 articles sans mouvement depuis 90 jours — voir la liste',        time: 'Il y a 1j',    resolved: false },
  { id: 12, level: 'info',     category: 'Commandes',   title: 'Commande prête à envoyer',    detail: 'BC-2026-0113 préparé — en attente de validation pour envoi',        time: 'Il y a 2h',    ref: 'BC-2026-0113', resolved: false },
  { id: 13, level: 'info',     category: 'Commandes',   title: 'Réception prévue demain',     detail: 'BC-2026-0111 — TunisiAuto — 8 articles attendus le 01/05',          time: "Demain",       ref: 'BC-2026-0111', resolved: false },
  { id: 14, level: 'info',     category: 'Financières', title: 'Rappel — Échéance fournisseur', detail: 'Paiement dû à Maghreb Pièces — 2 850 DT — échéance 05/05',       time: 'Dans 5 jours', resolved: false },
  { id: 15, level: 'info',     category: 'Stock bas',   title: 'Inventaire recommandé',       detail: 'Dernier inventaire physique il y a 45 jours',                       time: 'Il y a 45j',   resolved: false },
  { id: 16, level: 'warning',  category: 'Stock bas',   title: 'Stock sous seuil minimum',    detail: 'Courroie distribution (COU-112) — 14 unités · seuil: 6',            time: 'Il y a 10h',   ref: 'COU-112', resolved: false },
]

const TABS = ['Toutes', 'Ruptures', 'Stock bas', 'Financières', 'Commandes']

const LEVEL_COLOR: Record<AlertLevel, string> = {
  critical: 'var(--red)',
  warning:  'var(--amber)',
  info:     'var(--purple)',
}

const LEVEL_BG: Record<AlertLevel, string> = {
  critical: 'var(--red-dim)',
  warning:  'var(--amber-dim)',
  info:     'var(--purple-dim)',
}

const LEVEL_LABEL: Record<AlertLevel, string> = {
  critical: 'Critique',
  warning:  'Avertissement',
  info:     'Information',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [activeTab, setActiveTab]     = useState('Toutes')
  const [alerts, setAlerts]           = useState(ALERTS)

  const resolve = (id: number) => setAlerts(prev => prev.filter(a => a.id !== id))

  const filtered = alerts.filter(a => {
    if (activeTab === 'Toutes') return true
    return a.category === activeTab
  })

  const criticals  = alerts.filter(a => a.level === 'critical').length
  const warnings   = alerts.filter(a => a.level === 'warning').length
  const infos      = alerts.filter(a => a.level === 'info').length

  return (
    <>
      <Topbar
        title="Alertes"
        breadcrumb="Centre de notifications"
        action={
          <Button variant="ghost">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Tout marquer lu
          </Button>
        }
      />

      <div className="content">

        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <StatCard
            variant="red"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
            value={criticals.toString()}
            label="Alertes critiques"
            trend="Action immédiate requise"
            trendType="down"
          />
          <StatCard
            variant="amber"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
            value={warnings.toString()}
            label="Avertissements"
            trend="À surveiller"
            trendType="down"
          />
          <StatCard
            variant="purple"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>}
            value={infos.toString()}
            label="Informations"
            trend="Pour information"
            trendType="up"
          />
        </div>

        {/* Alert list */}
        <Card>
          <CardHead>
            <CardTitle>
              Alertes actives
              <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--red-dim)', color: 'var(--red)', padding: '2px 8px', borderRadius: 20 }}>
                {alerts.length}
              </span>
            </CardTitle>
            <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
          </CardHead>

          <div className="alert-list">
            {filtered.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.3 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p style={{ fontSize: 12 }}>Aucune alerte dans cette catégorie</p>
              </div>
            ) : (
              filtered.map(alert => (
                <div key={alert.id} className="alert-item" style={{ alignItems: 'center' }}>
                  {/* Color dot */}
                  <div
                    className="alert-dot"
                    style={{ background: LEVEL_COLOR[alert.level], flexShrink: 0, marginTop: 0 }}
                  />

                  {/* Level badge */}
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 20,
                    background: LEVEL_BG[alert.level],
                    color: LEVEL_COLOR[alert.level],
                    flexShrink: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    {LEVEL_LABEL[alert.level]}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <div className="alert-msg">{alert.detail}</div>
                    {alert.ref && (
                      <div style={{ marginTop: 3 }}>
                        <RefCode code={alert.ref} />
                      </div>
                    )}
                  </div>

                  {/* Category tag */}
                  <span className="tag" style={{ flexShrink: 0 }}>{alert.category}</span>

                  {/* Time */}
                  <span className="alert-time" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{alert.time}</span>

                  {/* Resolve button */}
                  <Button
                    variant="ghost"
                    style={{ height: 28, padding: '0 10px', fontSize: 11, flexShrink: 0 }}
                    onClick={() => resolve(alert.id)}
                  >
                    Résoudre
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>

      </div>
    </>
  )
}
