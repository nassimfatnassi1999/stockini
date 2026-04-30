'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHead, CardTitle, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'

// ── Settings sections ─────────────────────────────────────────────────────────

const TABS = ['Général', 'Entreprise', 'Notifications', 'Sécurité']

interface NotifSetting {
  id: string
  label: string
  description: string
  enabled: boolean
  category: 'Stock' | 'Financier' | 'Commandes' | 'Système'
}

const INITIAL_NOTIFS: NotifSetting[] = [
  { id: 'n1',  label: 'Ruptures de stock',          description: 'Alerte quand un article atteint 0 unité',                   enabled: true,  category: 'Stock'     },
  { id: 'n2',  label: 'Stock sous seuil minimum',   description: 'Alerte quand la quantité passe sous le seuil configuré',    enabled: true,  category: 'Stock'     },
  { id: 'n3',  label: 'Stock dormant',              description: 'Articles sans mouvement depuis plus de 90 jours',           enabled: true,  category: 'Stock'     },
  { id: 'n4',  label: 'Factures impayées',          description: 'Rappel automatique pour les factures en retard',            enabled: true,  category: 'Financier' },
  { id: 'n5',  label: 'Marge négative',             description: "Alerte si le prix de vente est inférieur au prix d'achat",  enabled: true,  category: 'Financier' },
  { id: 'n6',  label: "Dettes fournisseurs",        description: "Rappel d'échéance de paiement fournisseur",                 enabled: false, category: 'Financier' },
  { id: 'n7',  label: 'Livraison en retard',        description: 'Commande non reçue après la date prévue',                  enabled: true,  category: 'Commandes' },
  { id: 'n8',  label: 'Commande à valider',         description: "Bon de commande en attente d'approbation",                 enabled: true,  category: 'Commandes' },
  { id: 'n9',  label: 'Sauvegarde échouée',         description: 'Notification si la sauvegarde automatique échoue',         enabled: true,  category: 'Système'   },
  { id: 'n10', label: 'Connexion inhabituelle',     description: "Alerte si connexion depuis un nouveau dispositif",          enabled: false, category: 'Système'   },
]

const notifCategoryColors: Record<string, 'blue' | 'amber' | 'green' | 'purple'> = {
  'Stock':     'blue',
  'Financier': 'amber',
  'Commandes': 'green',
  'Système':   'purple',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('Général')
  const [notifs, setNotifs]       = useState(INITIAL_NOTIFS)
  const [saved, setSaved]         = useState(false)

  // General settings
  const [general, setGeneral] = useState({
    companyName: 'StockPro — Pièces Auto',
    currency: 'DT (Dinar Tunisien)',
    timezone: 'Africa/Tunis (UTC+1)',
    language: 'Français',
    dateFormat: 'DD/MM/YYYY',
    tvaRate: '19',
  })

  // Company settings
  const [company, setCompany] = useState({
    name: 'Malek Auto Pièces SARL',
    address: '12 Rue Ibn Khaldoun, Tunis 1001',
    phone: '+216 71 234 567',
    email: 'contact@malekauto.tn',
    taxId: '1234567/A/M/000',
    website: 'www.malekauto.tn',
    logo: '',
  })

  // Security settings
  const [security, setSecurity] = useState({
    sessionTimeout: '30',
    twoFactor: false,
    passwordExpiry: '90',
    loginAlerts: true,
  })

  const toggleNotif = (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, enabled: !n.enabled } : n))
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const setGen = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setGeneral(prev => ({ ...prev, [field]: e.target.value }))

  const setCo = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCompany(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <>
      <Topbar
        title="Paramètres"
        breadcrumb="Configuration système"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saved && (
              <span style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Modifications enregistrées
              </span>
            )}
            <Button variant="primary" onClick={handleSave}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
              </svg>
              Sauvegarder
            </Button>
          </div>
        }
      />

      <div className="content">

        {/* Tab navigation */}
        <div style={{ marginBottom: 20 }}>
          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
        </div>

        {/* ── General tab ── */}
        {activeTab === 'Général' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
            <Card>
              <CardHead><CardTitle>Paramètres généraux</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Nom de l&apos;application</label>
                    <input className="form-input" value={general.companyName} onChange={setGen('companyName')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Devise</label>
                    <select className="form-select" value={general.currency} onChange={setGen('currency')}>
                      <option>DT (Dinar Tunisien)</option>
                      <option>EUR (Euro)</option>
                      <option>USD (Dollar américain)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fuseau horaire</label>
                    <select className="form-select" value={general.timezone} onChange={setGen('timezone')}>
                      <option>Africa/Tunis (UTC+1)</option>
                      <option>Europe/Paris (UTC+2)</option>
                      <option>UTC</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Langue</label>
                    <select className="form-select" value={general.language} onChange={setGen('language')}>
                      <option>Français</option>
                      <option>Arabe</option>
                      <option>Anglais</option>
                    </select>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Format de date</label>
                      <select className="form-select" value={general.dateFormat} onChange={setGen('dateFormat')}>
                        <option>DD/MM/YYYY</option>
                        <option>MM/DD/YYYY</option>
                        <option>YYYY-MM-DD</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Taux TVA (%)</label>
                      <input className="form-input" type="number" value={general.tvaRate} onChange={setGen('tvaRate')} />
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHead><CardTitle>Statut du système</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Version',                 value: '1.0.0',          color: 'var(--text2)' },
                    { label: 'Base de données',         value: 'Connectée',      color: 'var(--green)' },
                    { label: 'Dernière sauvegarde',     value: 'Il y a 12 min',  color: 'var(--text2)' },
                    { label: 'Utilisation disque',      value: '2.4 Go / 20 Go', color: 'var(--text2)' },
                    { label: 'Utilisateurs connectés',  value: '3',              color: 'var(--accent2)' },
                    { label: 'Environnement',           value: 'Production',     color: 'var(--green)' },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: 'var(--text3)' }}>{s.label}</span>
                      <span style={{ color: s.color, fontWeight: 500 }}>{s.value}</span>
                    </div>
                  ))}

                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                  <Button variant="ghost" style={{ width: '100%', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Télécharger les logs système
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* ── Entreprise tab ── */}
        {activeTab === 'Entreprise' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
            <Card>
              <CardHead><CardTitle>Informations légales</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Raison sociale</label>
                    <input className="form-input" value={company.name} onChange={setCo('name')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Adresse</label>
                    <input className="form-input" value={company.address} onChange={setCo('address')} />
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Téléphone</label>
                      <input className="form-input" value={company.phone} onChange={setCo('phone')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email</label>
                      <input className="form-input" type="email" value={company.email} onChange={setCo('email')} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Numéro fiscal / MF</label>
                    <input className="form-input" value={company.taxId} onChange={setCo('taxId')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Site web</label>
                    <input className="form-input" value={company.website} onChange={setCo('website')} />
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHead><CardTitle>Logo & Apparence</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Logo preview */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 64, height: 64, background: 'var(--accent-dim)', borderRadius: 'var(--r2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border2)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28, color: 'var(--accent2)' }}>
                        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Logo de l&apos;entreprise</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>PNG, JPG · Max 2 Mo · Recommandé 200×200px</div>
                      <Button variant="ghost" style={{ height: 28, fontSize: 11, padding: '0 12px' }}>
                        Choisir un fichier
                      </Button>
                    </div>
                  </div>
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>Apparence de l&apos;interface</div>
                    {['Sombre (défaut)', 'Clair', 'Automatique (système)'].map((theme, i) => (
                      <label key={theme} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
                        <input type="radio" name="theme" defaultChecked={i === 0} style={{ accentColor: 'var(--accent)' }} />
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{theme}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* ── Notifications tab ── */}
        {activeTab === 'Notifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(['Stock', 'Financier', 'Commandes', 'Système'] as const).map(cat => (
              <Card key={cat}>
                <CardHead>
                  <CardTitle>{cat}</CardTitle>
                  <Badge variant={notifCategoryColors[cat]}>{notifs.filter(n => n.category === cat && n.enabled).length} actif{notifs.filter(n => n.category === cat && n.enabled).length > 1 ? 's' : ''}</Badge>
                </CardHead>
                <div>
                  {notifs.filter(n => n.category === cat).map(n => (
                    <div
                      key={n.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 20px',
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.1s',
                      }}
                    >
                      {/* Toggle */}
                      <label style={{ position: 'relative', width: 36, height: 20, flexShrink: 0, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={n.enabled}
                          onChange={() => toggleNotif(n.id)}
                          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                        />
                        <span style={{
                          position: 'absolute', inset: 0,
                          background: n.enabled ? 'var(--accent)' : 'var(--bg4)',
                          borderRadius: 20,
                          transition: 'background 0.2s',
                          border: '1px solid var(--border2)',
                        }} />
                        <span style={{
                          position: 'absolute',
                          top: 3, left: n.enabled ? 18 : 3,
                          width: 14, height: 14,
                          background: '#fff',
                          borderRadius: '50%',
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </label>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text1)' }}>{n.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{n.description}</div>
                      </div>

                      <span style={{ fontSize: 11, color: n.enabled ? 'var(--green)' : 'var(--text3)', fontWeight: 500 }}>
                        {n.enabled ? 'Activé' : 'Désactivé'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Security tab ── */}
        {activeTab === 'Sécurité' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
            <Card>
              <CardHead><CardTitle>Sessions & Authentification</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Expiration de session (minutes)</label>
                    <select
                      className="form-select"
                      value={security.sessionTimeout}
                      onChange={e => setSecurity(p => ({ ...p, sessionTimeout: e.target.value }))}
                    >
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 heure</option>
                      <option value="120">2 heures</option>
                      <option value="480">8 heures</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Expiration mot de passe (jours)</label>
                    <select
                      className="form-select"
                      value={security.passwordExpiry}
                      onChange={e => setSecurity(p => ({ ...p, passwordExpiry: e.target.value }))}
                    >
                      <option value="30">30 jours</option>
                      <option value="60">60 jours</option>
                      <option value="90">90 jours</option>
                      <option value="180">180 jours</option>
                      <option value="never">Jamais</option>
                    </select>
                  </div>

                  {[
                    { field: 'twoFactor', label: 'Authentification à deux facteurs (2FA)', desc: "Active la vérification par SMS ou application d'authentification" },
                    { field: 'loginAlerts', label: 'Alertes de connexion', desc: 'Recevoir une notification à chaque nouvelle connexion' },
                  ].map(opt => (
                    <div key={opt.field} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <label style={{ position: 'relative', width: 36, height: 20, flexShrink: 0, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={security[opt.field as keyof typeof security] as boolean}
                          onChange={() => setSecurity(p => ({ ...p, [opt.field]: !p[opt.field as keyof typeof security] }))}
                          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                        />
                        <span style={{
                          position: 'absolute', inset: 0,
                          background: (security[opt.field as keyof typeof security] as boolean) ? 'var(--accent)' : 'var(--bg4)',
                          borderRadius: 20, transition: 'background 0.2s', border: '1px solid var(--border2)',
                        }} />
                        <span style={{
                          position: 'absolute', top: 3,
                          left: (security[opt.field as keyof typeof security] as boolean) ? 18 : 3,
                          width: 14, height: 14, background: '#fff', borderRadius: '50%',
                          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </label>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{opt.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHead><CardTitle>Utilisateurs actifs</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { name: 'Malek Ben Salem',  role: 'Administrateur', lastLogin: 'Aujourd\'hui 08:30', online: true  },
                    { name: 'Sami Mrad',         role: 'Vendeur',        lastLogin: 'Aujourd\'hui 09:15', online: true  },
                    { name: 'Leila Jendoubi',    role: 'Gestionnaire',   lastLogin: 'Aujourd\'hui 07:55', online: true  },
                    { name: 'Ahmed Chaabane',    role: 'Vendeur',        lastLogin: 'Hier 18:40',         online: false },
                    { name: 'Rania Sghaier',     role: 'Comptable',      lastLogin: '28/04/2026 14:22',   online: false },
                  ].map(u => (
                    <div key={u.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: u.online ? 'var(--green)' : 'var(--text3)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{u.role} · {u.lastLogin}</div>
                      </div>
                      <Button variant="ghost" style={{ height: 26, fontSize: 10, padding: '0 8px' }}>
                        Gérer
                      </Button>
                    </div>
                  ))}
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <Button variant="ghost" style={{ width: '100%', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Inviter un utilisateur
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHead><CardTitle>Changer le mot de passe</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Mot de passe actuel</label>
                    <input className="form-input" type="password" placeholder="••••••••" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nouveau mot de passe</label>
                    <input className="form-input" type="password" placeholder="••••••••" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirmer le nouveau mot de passe</label>
                    <input className="form-input" type="password" placeholder="••••••••" />
                  </div>
                  <Button variant="primary">Mettre à jour le mot de passe</Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHead><CardTitle>Journal d&apos;activité</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { action: 'Connexion',                  user: 'Malek B.',  time: '30/04 08:30' },
                    { action: 'Vente créée F-2026-0348',    user: 'Malek B.',  time: '30/04 08:45' },
                    { action: 'Connexion',                  user: 'Sami M.',   time: '30/04 09:15' },
                    { action: 'Pièce modifiée FR-0842',     user: 'Malek B.',  time: '30/04 10:02' },
                    { action: 'Bon de commande validé',     user: 'Malek B.',  time: '30/04 11:30' },
                    { action: 'Déconnexion',                user: 'Leila J.',  time: '30/04 17:00' },
                  ].map((log, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: 'var(--text2)' }}>{log.action}</span>
                      <span style={{ color: 'var(--text3)' }}>{log.user} · {log.time}</span>
                    </div>
                  ))}
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <Button variant="ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 11, height: 28 }}>
                    Voir le journal complet
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

      </div>
    </>
  )
}
