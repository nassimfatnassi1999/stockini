'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHead, CardTitle, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { RefCode } from '@/components/ui/RefCode'

// ── Mock catalogue ────────────────────────────────────────────────────────────

const CATALOGUE = [
  { ref: 'FR-0842', name: 'Plaquettes de frein avant',  price: 38.500 },
  { ref: 'FT-1120', name: 'Filtre à huile moteur',       price: 12.000 },
  { ref: 'BAT-220', name: 'Batterie 12V 60Ah',           price: 185.000 },
  { ref: 'BOU-331', name: "Bougie d'allumage NGK",        price: 9.500  },
  { ref: 'EL-441',  name: 'Alternateur 90A',             price: 320.000 },
  { ref: 'PNE-019', name: 'Pneu 195/65 R15',             price: 210.000 },
  { ref: 'FC-088',  name: 'Filtre à carburant',          price: 15.000 },
  { ref: 'EMB-201', name: 'Kit embrayage complet',       price: 240.000 },
  { ref: 'SUS-044', name: 'Rotule de direction',         price: 32.000 },
  { ref: 'FH-055',  name: 'Filtre habitacle',            price: 11.000 },
  { ref: 'COU-112', name: 'Courroie de distribution',    price: 85.000 },
  { ref: 'POL-033', name: 'Pompe à eau',                 price: 115.000 },
]

const CUSTOMERS = [
  'Garage Mabrouk', 'Sami Mrad', 'Auto Top SARL', 'Khaled Azizi',
  'Garage Centrale', 'Mohamed Trabelsi', 'Rania Kchouk', 'Nabil Benzarti',
]

interface CartLine {
  ref: string
  name: string
  qty: number
  unitPrice: number
}

const TVA_RATE = 0.19

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewSalePage() {
  const [cart, setCart]               = useState<CartLine[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [barcode, setBarcode]         = useState('')
  const [customer, setCustomer]       = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Espèces')
  const [notes, setNotes]             = useState('')

  const invoiceNumber = 'F-2026-0349'

  const searchResults = productSearch.length >= 2
    ? CATALOGUE.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.ref.toLowerCase().includes(productSearch.toLowerCase())
      ).slice(0, 5)
    : []

  const addToCart = (item: typeof CATALOGUE[0]) => {
    setCart(prev => {
      const existing = prev.find(l => l.ref === item.ref)
      if (existing) {
        return prev.map(l => l.ref === item.ref ? { ...l, qty: l.qty + 1 } : l)
      }
      return [...prev, { ref: item.ref, name: item.name, qty: 1, unitPrice: item.price }]
    })
    setProductSearch('')
  }

  const updateQty = (ref: string, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(l => l.ref !== ref))
    } else {
      setCart(prev => prev.map(l => l.ref === ref ? { ...l, qty } : l))
    }
  }

  const updatePrice = (ref: string, price: number) => {
    setCart(prev => prev.map(l => l.ref === ref ? { ...l, unitPrice: price } : l))
  }

  const removeLine = (ref: string) => setCart(prev => prev.filter(l => l.ref !== ref))

  const subtotal = cart.reduce((a, l) => a + l.qty * l.unitPrice, 0)
  const tva      = subtotal * TVA_RATE
  const total    = subtotal + tva

  return (
    <>
      <Topbar
        title="Nouvelle vente"
        breadcrumb="Point de vente"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/sales">
              <Button variant="ghost">Annuler</Button>
            </Link>
            <Button variant="primary" disabled={cart.length === 0 || !customer}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Valider la vente
            </Button>
          </div>
        }
      />

      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

          {/* ── Left panel ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Product search */}
            <Card>
              <CardHead>
                <CardTitle>Ajouter des articles</CardTitle>
              </CardHead>
              <CardBody>
                <div className="form-grid-2" style={{ marginBottom: 12 }}>
                  {/* Search by name */}
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label className="form-label">Rechercher par nom / référence</label>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </div>
                      <input
                        className="form-input"
                        style={{ paddingLeft: 32 }}
                        placeholder="ex: filtre, FR-0842…"
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                      />
                    </div>
                    {/* Dropdown */}
                    {searchResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r)', marginTop: 4, overflow: 'hidden' }}>
                        {searchResults.map(r => (
                          <div
                            key={r.ref}
                            onClick={() => addToCart(r)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg4)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{r.name}</div>
                              <RefCode code={r.ref} />
                            </div>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
                              {r.price.toFixed(3)} DT
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Barcode */}
                  <div className="form-group">
                    <label className="form-label">Scanner code-barres</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="form-input"
                        placeholder="EAN13…"
                        value={barcode}
                        onChange={e => setBarcode(e.target.value)}
                      />
                      <Button variant="ghost" style={{ flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                          <path d="M3 9V5a2 2 0 0 1 2-2h4M3 15v4a2 2 0 0 0 2 2h4M21 9V5a2 2 0 0 0-2-2h-4M21 15v4a2 2 0 0 1-2 2h-4M7 8h10M7 12h10M7 16h10" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Quick add from catalogue */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Articles fréquents</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {CATALOGUE.slice(0, 8).map(p => (
                      <button
                        key={p.ref}
                        onClick={() => addToCart(p)}
                        className="btn btn-ghost"
                        style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                      >
                        {p.ref}
                      </button>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Cart */}
            <Card>
              <CardHead>
                <CardTitle>
                  Panier
                  {cart.length > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent2)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 20 }}>
                      {cart.length} article{cart.length > 1 ? 's' : ''}
                    </span>
                  )}
                </CardTitle>
              </CardHead>

              {cart.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.3 }}>
                    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                  <p style={{ fontSize: 12 }}>Le panier est vide. Ajoutez des articles ci-dessus.</p>
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Référence</th>
                          <th>Désignation</th>
                          <th style={{ textAlign: 'center' }}>Qté</th>
                          <th style={{ textAlign: 'right' }}>Prix unit.</th>
                          <th style={{ textAlign: 'right' }}>Total ligne</th>
                          <th style={{ width: 36 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map(line => (
                          <tr key={line.ref}>
                            <td><RefCode code={line.ref} /></td>
                            <td style={{ fontWeight: 500 }}>{line.name}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                <button
                                  className="btn btn-ghost"
                                  style={{ width: 24, height: 24, padding: 0, fontSize: 14 }}
                                  onClick={() => updateQty(line.ref, line.qty - 1)}
                                >−</button>
                                <span style={{ width: 28, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{line.qty}</span>
                                <button
                                  className="btn btn-ghost"
                                  style={{ width: 24, height: 24, padding: 0, fontSize: 14 }}
                                  onClick={() => updateQty(line.ref, line.qty + 1)}
                                >+</button>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number"
                                step="0.001"
                                className="form-input"
                                style={{ width: 100, height: 30, fontSize: 12, textAlign: 'right', fontFamily: 'var(--mono)' }}
                                value={line.unitPrice}
                                onChange={e => updatePrice(line.ref, parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                              {(line.qty * line.unitPrice).toFixed(3)} DT
                            </td>
                            <td>
                              <button
                                className="btn btn-ghost"
                                style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}
                                onClick={() => removeLine(line.ref)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals row */}
                  <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)' }}>
                      <span>Sous-total HT</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{subtotal.toFixed(3)} DT</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)' }}>
                      <span>TVA (19%)</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{tva.toFixed(3)} DT</span>
                    </div>
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
                      <span>Total TTC</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{total.toFixed(3)} DT</span>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* ── Right panel ── */}
          <div style={{ position: 'sticky', top: 72, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Customer & Invoice */}
            <Card>
              <CardHead><CardTitle>Informations vente</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">N° Facture</label>
                    <div style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                      <span className="ref-code">{invoiceNumber}</span>
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)' }}>Généré automatiquement</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Client *</label>
                    <select className="form-select" value={customer} onChange={e => setCustomer(e.target.value)}>
                      <option value="">-- Sélectionner un client --</option>
                      {CUSTOMERS.map(c => <option key={c}>{c}</option>)}
                      <option value="__new__">+ Nouveau client…</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Mode de paiement</label>
                    <select className="form-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                      <option>Espèces</option>
                      <option>Virement bancaire</option>
                      <option>Chèque</option>
                      <option>Traite</option>
                      <option>Paiement différé</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-textarea"
                      placeholder="Notes internes, conditions…"
                      rows={3}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Summary */}
            <Card>
              <CardHead><CardTitle>Récapitulatif</CardTitle></CardHead>
              <CardBody>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>Articles</span>
                    <span style={{ fontWeight: 600 }}>{cart.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>Sous-total HT</span>
                    <span style={{ fontFamily: 'var(--mono)' }}>{subtotal.toFixed(3)} DT</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>TVA (19%)</span>
                    <span style={{ fontFamily: 'var(--mono)' }}>{tva.toFixed(3)} DT</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
                    <span>Total TTC</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{total.toFixed(3)} DT</span>
                  </div>

                  {paymentMethod && (
                    <div style={{ marginTop: 4 }}>
                      <Badge variant="blue">{paymentMethod}</Badge>
                    </div>
                  )}

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <Button
                    variant="primary"
                    style={{ width: '100%', justifyContent: 'center', height: 42 }}
                    disabled={cart.length === 0 || !customer}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Valider la vente
                  </Button>
                  <Link href="/sales">
                    <Button variant="ghost" style={{ width: '100%', justifyContent: 'center' }}>
                      Annuler
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>

          </div>
        </div>
      </div>
    </>
  )
}
