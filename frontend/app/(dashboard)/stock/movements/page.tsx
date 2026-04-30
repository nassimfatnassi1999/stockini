'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHead, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { RefCode } from '@/components/ui/RefCode'
import { Pagination } from '@/components/ui/DataTable'

// ── Mock data ─────────────────────────────────────────────────────────────────

type MvtType = 'Entrée' | 'Sortie' | 'Ajustement'

interface Movement {
  id: number
  date: string
  ref: string
  name: string
  type: MvtType
  qty: number
  before: number
  after: number
  docRef: string
  user: string
}

const MOVEMENTS: Movement[] = [
  { id: 1,  date: '30/04/2026 14:22', ref: 'FR-0842', name: 'Plaquettes de frein avant',  type: 'Sortie',      qty: -4,  before: 52,  after: 48,  docRef: 'F-2026-0348', user: 'Malek B.' },
  { id: 2,  date: '30/04/2026 11:05', ref: 'FT-1120', name: 'Filtre à huile moteur',       type: 'Sortie',      qty: -2,  before: 8,   after: 6,   docRef: 'F-2026-0347', user: 'Sami M.' },
  { id: 3,  date: '30/04/2026 09:40', ref: 'BAT-220', name: 'Batterie 12V 60Ah',           type: 'Entrée',      qty: 10,  before: 12,  after: 22,  docRef: 'BC-2026-0112', user: 'Admin' },
  { id: 4,  date: '29/04/2026 16:55', ref: 'BOU-331', name: "Bougie d'allumage NGK",        type: 'Sortie',      qty: -12, before: 142, after: 130, docRef: 'F-2026-0346', user: 'Malek B.' },
  { id: 5,  date: '29/04/2026 15:30', ref: 'PNE-019', name: 'Pneu 195/65 R15',             type: 'Entrée',      qty: 8,   before: 8,   after: 16,  docRef: 'BC-2026-0111', user: 'Admin' },
  { id: 6,  date: '29/04/2026 10:12', ref: 'FC-088',  name: 'Filtre à carburant',          type: 'Sortie',      qty: -3,  before: 37,  after: 34,  docRef: 'F-2026-0345', user: 'Sami M.' },
  { id: 7,  date: '28/04/2026 17:08', ref: 'EL-441',  name: 'Alternateur 90A',             type: 'Ajustement',  qty: -2,  before: 5,   after: 3,   docRef: 'INV-2026-04', user: 'Admin' },
  { id: 8,  date: '28/04/2026 14:45', ref: 'SUS-044', name: 'Rotule de direction',         type: 'Entrée',      qty: 12,  before: 7,   after: 19,  docRef: 'BC-2026-0110', user: 'Admin' },
  { id: 9,  date: '28/04/2026 09:22', ref: 'EMB-201', name: 'Kit embrayage complet',       type: 'Sortie',      qty: -1,  before: 8,   after: 7,   docRef: 'F-2026-0344', user: 'Malek B.' },
  { id: 10, date: '27/04/2026 16:33', ref: 'FH-055',  name: 'Filtre habitacle',            type: 'Entrée',      qty: 25,  before: 30,  after: 55,  docRef: 'BC-2026-0109', user: 'Admin' },
  { id: 11, date: '27/04/2026 11:10', ref: 'COU-112', name: 'Courroie de distribution',    type: 'Sortie',      qty: -2,  before: 16,  after: 14,  docRef: 'F-2026-0343', user: 'Sami M.' },
  { id: 12, date: '26/04/2026 15:55', ref: 'EL-302',  name: 'Démarreur 1.4kW',            type: 'Ajustement',  qty: -1,  before: 3,   after: 2,   docRef: 'INV-2026-04', user: 'Admin' },
  { id: 13, date: '26/04/2026 10:08', ref: 'AM-0055', name: 'Amortisseur avant gauche',    type: 'Sortie',      qty: -1,  before: 1,   after: 0,   docRef: 'F-2026-0342', user: 'Malek B.' },
  { id: 14, date: '25/04/2026 16:20', ref: 'POL-033', name: 'Pompe à eau',                 type: 'Entrée',      qty: 5,   before: 4,   after: 9,   docRef: 'BC-2026-0108', user: 'Admin' },
  { id: 15, date: '25/04/2026 09:44', ref: 'FR-0842', name: 'Plaquettes de frein avant',  type: 'Sortie',      qty: -6,  before: 58,  after: 52,  docRef: 'F-2026-0341', user: 'Sami M.' },
  { id: 16, date: '24/04/2026 14:00', ref: 'BAT-220', name: 'Batterie 12V 60Ah',           type: 'Sortie',      qty: -2,  before: 14,  after: 12,  docRef: 'F-2026-0340', user: 'Malek B.' },
  { id: 17, date: '24/04/2026 09:15', ref: 'FT-1120', name: 'Filtre à huile moteur',       type: 'Ajustement',  qty: 2,   before: 6,   after: 8,   docRef: 'INV-2026-04', user: 'Admin' },
]

const TABS = ['Tous', 'Entrées', 'Sorties', 'Ajustements']

const typeVariant: Record<MvtType, 'green' | 'red' | 'amber'> = {
  'Entrée': 'green',
  'Sortie': 'red',
  'Ajustement': 'amber',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MovementsPage() {
  const [activeTab, setActiveTab] = useState('Tous')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [page, setPage]           = useState(1)

  const filtered = MOVEMENTS.filter(m => {
    if (activeTab === 'Entrées')      return m.type === 'Entrée'
    if (activeTab === 'Sorties')      return m.type === 'Sortie'
    if (activeTab === 'Ajustements')  return m.type === 'Ajustement'
    return true
  })

  return (
    <>
      <Topbar
        title="Mouvements de stock"
        breadcrumb="Historique des entrées / sorties"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Exporter
            </Button>
            <Button variant="primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nouveau mouvement
            </Button>
          </div>
        }
      />

      <div className="content">
        <Card>
          <CardHead>
            <CardTitle>Journal des mouvements</CardTitle>
            <Tabs tabs={TABS} active={activeTab} onChange={t => { setActiveTab(t); setPage(1) }} />
            {/* Date range filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Du</span>
              <input
                type="date"
                className="form-input"
                style={{ width: 140, height: 32, fontSize: 12 }}
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>au</span>
              <input
                type="date"
                className="form-input"
                style={{ width: 140, height: 32, fontSize: 12 }}
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
          </CardHead>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th style={{ textAlign: 'center' }}>Type</th>
                  <th style={{ textAlign: 'center' }}>Quantité</th>
                  <th style={{ textAlign: 'center' }}>Stock avant</th>
                  <th style={{ textAlign: 'center' }}>Stock après</th>
                  <th>Réf. document</th>
                  <th>Utilisateur</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontSize: 12 }}>{m.date.split(' ')[0]}</div>
                      <div className="td-muted">{m.date.split(' ')[1]}</div>
                    </td>
                    <td><RefCode code={m.ref} /></td>
                    <td style={{ fontWeight: 500 }}>{m.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <Badge variant={typeVariant[m.type]}>{m.type}</Badge>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontFamily: 'var(--mono)',
                        fontWeight: 700,
                        fontSize: 13,
                        color: m.qty > 0 ? 'var(--green)' : m.type === 'Ajustement' ? 'var(--amber)' : 'var(--red)',
                      }}>
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>
                      {m.before}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
                      {m.after}
                    </td>
                    <td>
                      <span className="ref-code">{m.docRef}</span>
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{m.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {filtered.length} mouvement{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
            </span>
            <Pagination page={page} total={filtered.length} pageSize={10} onPage={setPage} />
          </div>
        </Card>
      </div>
    </>
  )
}
