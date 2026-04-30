'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHead, CardTitle, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewProductPage() {
  const [form, setForm] = useState({
    ref: '',
    barcode: '',
    name: '',
    category: '',
    brand: '',
    supplier: '',
    location: '',
    buyPrice: '',
    sellPrice: '',
    minStock: '',
    initialQty: '',
    description: '',
  })

  const margin = form.buyPrice && form.sellPrice
    ? (((parseFloat(form.sellPrice) - parseFloat(form.buyPrice)) / parseFloat(form.buyPrice)) * 100).toFixed(1)
    : null

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <>
      <Topbar
        title="Nouvelle pièce"
        breadcrumb="Ajouter au catalogue"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/products">
              <Button variant="ghost">Annuler</Button>
            </Link>
            <Button variant="primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Enregistrer la pièce
            </Button>
          </div>
        }
      />

      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

          {/* ── Main form ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Identification */}
            <Card>
              <CardHead>
                <CardTitle>Identification</CardTitle>
              </CardHead>
              <CardBody>
                <div className="form-grid-2" style={{ marginBottom: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Référence / SKU *</label>
                    <input className="form-input" placeholder="ex: FR-0842" value={form.ref} onChange={set('ref')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Code-barres</label>
                    <input className="form-input" placeholder="EAN13 / Code interne" value={form.barcode} onChange={set('barcode')} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">Désignation *</label>
                  <input className="form-input" placeholder="ex: Plaquettes de frein avant" value={form.name} onChange={set('name')} />
                </div>
                <div className="form-grid-3" style={{ marginBottom: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Catégorie *</label>
                    <select className="form-select" value={form.category} onChange={set('category')}>
                      <option value="">-- Choisir --</option>
                      <option>Moteur</option>
                      <option>Freinage</option>
                      <option>Suspension</option>
                      <option>Électricité</option>
                      <option>Filtres</option>
                      <option>Batteries</option>
                      <option>Pneus</option>
                      <option>Transmission</option>
                      <option>Refroidissement</option>
                      <option>Carrosserie</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Marque</label>
                    <select className="form-select" value={form.brand} onChange={set('brand')}>
                      <option value="">-- Choisir --</option>
                      <option>Bosch</option>
                      <option>Valeo</option>
                      <option>Brembo</option>
                      <option>Monroe</option>
                      <option>NGK</option>
                      <option>Mann</option>
                      <option>Continental</option>
                      <option>Sachs</option>
                      <option>Moog</option>
                      <option>Purflux</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fournisseur</label>
                    <select className="form-select" value={form.supplier} onChange={set('supplier')}>
                      <option value="">-- Choisir --</option>
                      <option>Auto Parts SARL</option>
                      <option>Maghreb Pièces</option>
                      <option>TunisiAuto</option>
                      <option>SpareHub Tunis</option>
                      <option>Euro Parts TN</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Emplacement / Rayon</label>
                  <input className="form-input" placeholder="ex: Rayon B — Étagère 3" value={form.location} onChange={set('location')} />
                </div>
              </CardBody>
            </Card>

            {/* Tarification */}
            <Card>
              <CardHead>
                <CardTitle>Tarification & Seuils</CardTitle>
              </CardHead>
              <CardBody>
                <div className="form-grid-3" style={{ marginBottom: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Prix d&apos;achat (DT) *</label>
                    <input className="form-input" type="number" step="0.001" placeholder="0.000" value={form.buyPrice} onChange={set('buyPrice')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Prix de vente (DT) *</label>
                    <input className="form-input" type="number" step="0.001" placeholder="0.000" value={form.sellPrice} onChange={set('sellPrice')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Stock minimum</label>
                    <input className="form-input" type="number" placeholder="ex: 5" value={form.minStock} onChange={set('minStock')} />
                  </div>
                </div>
                {margin !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: parseFloat(margin) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                    </svg>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>Marge calculée :</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: parseFloat(margin) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {margin}%
                    </span>
                    {parseFloat(margin) < 0 && (
                      <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 4 }}>Attention : prix de vente inférieur au prix d&apos;achat</span>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Stock initial */}
            <Card>
              <CardHead>
                <CardTitle>Stock initial</CardTitle>
              </CardHead>
              <CardBody>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Quantité initiale</label>
                    <input className="form-input" type="number" placeholder="0" value={form.initialQty} onChange={set('initialQty')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Emplacement de stockage</label>
                    <input className="form-input" placeholder="ex: Entrepôt A — Case 12" value={form.location} onChange={set('location')} />
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Description */}
            <Card>
              <CardHead>
                <CardTitle>Description & Notes</CardTitle>
              </CardHead>
              <CardBody>
                <div className="form-group">
                  <label className="form-label">Description technique</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Compatibilité véhicules, dimensions, caractéristiques techniques…"
                    rows={4}
                    value={form.description}
                    onChange={set('description')}
                  />
                </div>
              </CardBody>
            </Card>

          </div>

          {/* ── Summary sidebar ── */}
          <div style={{ position: 'sticky', top: 72, display: 'flex', flexDirection: 'column', gap: 14 }}>

            <Card>
              <CardHead><CardTitle>Aperçu de la fiche</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 42, height: 42, background: 'var(--accent-dim)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20, color: 'var(--accent2)' }}>
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{form.name || 'Nouvelle pièce'}</div>
                      <div className="td-muted">{form.ref || 'REF-XXXX'}</div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  {[
                    { label: 'Catégorie', value: form.category || '—' },
                    { label: 'Marque', value: form.brand || '—' },
                    { label: 'Fournisseur', value: form.supplier || '—' },
                    { label: 'Stock initial', value: form.initialQty ? `${form.initialQty} unités` : '0' },
                    { label: 'Stock minimum', value: form.minStock ? `${form.minStock} unités` : '—' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text3)' }}>{row.label}</span>
                      <span style={{ color: 'var(--text2)', fontWeight: 500 }}>{row.value}</span>
                    </div>
                  ))}

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>Prix d&apos;achat</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{form.buyPrice ? `${parseFloat(form.buyPrice).toFixed(3)} DT` : '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>Prix de vente</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{form.sellPrice ? `${parseFloat(form.sellPrice).toFixed(3)} DT` : '—'}</span>
                  </div>
                  {margin !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text3)' }}>Marge</span>
                      <Badge variant={parseFloat(margin) >= 20 ? 'green' : parseFloat(margin) >= 0 ? 'amber' : 'red'}>
                        {margin}%
                      </Badge>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button variant="primary" style={{ width: '100%', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Enregistrer la pièce
                  </Button>
                  <Link href="/products">
                    <Button variant="ghost" style={{ width: '100%', justifyContent: 'center' }}>
                      Annuler
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHead><CardTitle>Aide</CardTitle></CardHead>
              <CardBody>
                <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
                  <p>Les champs marqués d&apos;un <strong style={{ color: 'var(--red)' }}>*</strong> sont obligatoires.</p>
                  <br />
                  <p>La référence doit être unique dans le catalogue.</p>
                  <br />
                  <p>Le stock minimum déclenche une alerte automatique.</p>
                </div>
              </CardBody>
            </Card>

          </div>
        </div>
      </div>
    </>
  )
}
