'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Eye, FileDown, Plus, Search, X } from 'lucide-react';
import { KebabMenu } from '@/components/stockini/shared/KebabMenu';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { stockiniApi } from '@/lib/stockini/api';
import { money } from '@/lib/stockini/format';
import { toast } from '@/lib/toast';
import type { CreditNote, ReturnableItem, Sale } from '@/lib/stockini/types';
import { PageHeader } from '../shared/PageHeader';
import { SlideOver } from '@/components/ui/SlideOver';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('fr-TN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(statut: string) {
  const map: Record<string, { label: string; cls: string }> = {
    CREATED: { label: 'Créé', cls: 'bg-blue-100 text-blue-700' },
    REFUNDED: { label: 'Remboursé', cls: 'bg-green-100 text-green-700' },
    CANCELLED: { label: 'Annulé', cls: 'bg-red-100 text-red-700' },
  };
  const s = map[statut] ?? { label: statut, cls: 'bg-gray-100 text-gray-700' };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

// ── AvoirDetailModal ──────────────────────────────────────────────────────────

function AvoirDetailModal({ avoir, onClose }: { avoir: CreditNote; onClose: () => void }) {
  const pdfUrl = stockiniApi.avoirPdfUrl(avoir.id);
  return (
    <SlideOver
      title={`Avoir ${avoir.numero}`}
      subtitle={avoir.sale?.invoiceNumber ?? undefined}
      open={true}
      onClose={onClose}
      width={720}
      footer={
        <>
          <a href={pdfUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline">
              <FileDown size={14} className="mr-1" /> PDF
            </Button>
          </a>
          <Button size="sm" variant="outline" onClick={onClose}>Fermer</Button>
        </>
      }
    >
      <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Date :</span> <span className="font-medium">{fmtDate(avoir.dateAvoir)}</span></div>
            <div><span className="text-gray-500">Statut :</span> {statusBadge(avoir.statut)}</div>
            <div><span className="text-gray-500">Client :</span> <span className="font-medium">{avoir.customer?.name ?? '—'}</span></div>
            <div><span className="text-gray-500">Motif :</span> <span className="font-medium">{avoir.motif ?? '—'}</span></div>
            <div><span className="text-gray-500">Créé par :</span> <span className="font-medium">{avoir.createdBy?.fullName ?? '—'}</span></div>
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-sm">Produits retournés</h3>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-2 border">Désignation</th>
                  <th className="text-right p-2 border">Qté</th>
                  <th className="text-right p-2 border">PU HT</th>
                  <th className="text-right p-2 border">Total HT</th>
                  <th className="text-right p-2 border">TVA</th>
                  <th className="text-right p-2 border">Total TTC</th>
                  <th className="text-left p-2 border">Motif</th>
                </tr>
              </thead>
              <tbody>
                {avoir.items.map((item) => (
                  <tr key={item.id} className="odd:bg-white even:bg-gray-50">
                    <td className="p-2 border">{item.designation}</td>
                    <td className="p-2 border text-right">{item.quantiteRetournee}</td>
                    <td className="p-2 border text-right">{money(item.prixUnitaireHt)}</td>
                    <td className="p-2 border text-right">{money(item.totalHt)}</td>
                    <td className="p-2 border text-right">{Number(item.tva).toFixed(0)}%</td>
                    <td className="p-2 border text-right">{money(item.totalTtc)}</td>
                    <td className="p-2 border text-gray-500">{item.motifLigne ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <div className="flex justify-end">
            <div className="border rounded bg-red-50 p-4 text-sm space-y-1 min-w-52">
              <div className="flex justify-between gap-8"><span className="text-gray-500">Total HT</span><span>{money(avoir.subtotal)}</span></div>
              <div className="flex justify-between gap-8"><span className="text-gray-500">TVA</span><span>{money(avoir.tax)}</span></div>
              <div className="flex justify-between gap-8 font-semibold border-t pt-1"><span>Total TTC</span><span>{money(avoir.total)}</span></div>
              <div className="flex justify-between gap-8 font-bold text-red-700 border-t pt-1"><span>Remboursé</span><span>{money(avoir.montantRembourse)}</span></div>
            </div>
          </div>
      </div>
    </SlideOver>
  );
}

// ── CreateAvoirModal ──────────────────────────────────────────────────────────

interface LineState {
  saleItemId: string;
  productId: string;
  designation: string;
  quantiteRetournable: number;
  unitPrice: number;
  quantiteRetournee: number;
  motifLigne: string;
  selected: boolean;
}

function CreateAvoirModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saleSearch, setSaleSearch] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [selectedSaleInvoice, setSelectedSaleInvoice] = useState('');
  const [motif, setMotif] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [lines, setLines] = useState<LineState[]>([]);
  const [linesLoaded, setLinesLoaded] = useState(false);

  const salesQuery = useQuery({ queryKey: ['stockini-sales'], queryFn: () => stockiniApi.sales() });
  const sales: Sale[] = Array.isArray(salesQuery.data?.data) ? salesQuery.data.data : [];

  const filteredSales = saleSearch
    ? sales.filter((s) => {
        const q = saleSearch.toLowerCase();
        return (
          s.invoiceNumber.toLowerCase().includes(q) ||
          (s.customer?.name ?? '').toLowerCase().includes(q)
        );
      })
    : [];

  const returnableQuery = useQuery({
    queryKey: ['returnable-items', selectedSaleId],
    queryFn: () => stockiniApi.returnableItems(selectedSaleId),
    enabled: !!selectedSaleId,
  });

  // Load lines once when data arrives
  if (returnableQuery.data && !linesLoaded && returnableQuery.data.items.length > 0) {
    setLinesLoaded(true);
    setLines(
      returnableQuery.data.items.map((item: ReturnableItem) => ({
        saleItemId: item.saleItemId,
        productId: item.productId,
        designation: item.product?.name ?? item.productId,
        quantiteRetournable: item.quantiteRetournable,
        unitPrice: item.unitPrice,
        quantiteRetournee: 1,
        motifLigne: '',
        selected: false,
      })),
    );
  }

  const handleSelectSale = (sale: Sale) => {
    setSelectedSaleId(sale.id);
    setSelectedSaleInvoice(sale.invoiceNumber);
    setSaleSearch('');
    setLines([]);
    setLinesLoaded(false);
  };

  const toggleLine = (idx: number) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, selected: !l.selected } : l)));

  const updateQty = (idx: number, val: number) =>
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        return { ...l, quantiteRetournee: Math.max(1, Math.min(val, l.quantiteRetournable)) };
      }),
    );

  const updateMotifLigne = (idx: number, val: string) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, motifLigne: val } : l)));

  const selectedLines = lines.filter((l) => l.selected);
  const subtotal = selectedLines.reduce((s, l) => s + l.unitPrice * l.quantiteRetournee, 0);
  const tax = subtotal * 0.19;
  const total = subtotal + tax;

  const createMutation = useMutation({
    mutationFn: () => {
      const sale = sales.find((s) => s.id === selectedSaleId);
      return stockiniApi.createAvoir({
        saleId: selectedSaleId,
        customerId: sale?.customer?.id,
        motif: motif || undefined,
        paymentMethod,
        items: selectedLines.map((l) => ({
          productId: l.productId,
          saleItemId: l.saleItemId,
          quantiteRetournee: l.quantiteRetournee,
          motifLigne: l.motifLigne || undefined,
        })),
      });
    },
    onSuccess: (avoir) => {
      queryClient.invalidateQueries({ queryKey: ['stockini-avoirs'] });
      queryClient.invalidateQueries({ queryKey: ['stockini-products'] });
      queryClient.invalidateQueries({ queryKey: ['returnable-items', selectedSaleId] });
      toast.success(`Avoir ${avoir.numero} créé avec succès`);
      window.open(stockiniApi.avoirPdfUrl(avoir.id), '_blank');
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Erreur lors de la création de l'avoir");
    },
  });

  return (
    <SlideOver
      title="Nouvel avoir"
      open={true}
      onClose={onClose}
      width={800}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
          <Button
            size="sm"
            disabled={createMutation.isPending || selectedLines.length === 0 || !selectedSaleId}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Création…' : "Créer l'avoir"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
          {/* Facture selection */}
          <div>
            <label className="block text-sm font-medium mb-1">Facture concernée *</label>
            {!selectedSaleId ? (
              <>
                <div className="relative mb-1">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    className="w-full border rounded pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Numéro de facture ou nom du client…"
                    value={saleSearch}
                    onChange={(e) => setSaleSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                {filteredSales.length > 0 && (
                  <ul className="border rounded bg-white shadow-sm max-h-44 overflow-y-auto text-sm">
                    {filteredSales.slice(0, 12).map((s) => (
                      <li
                        key={s.id}
                        className="px-3 py-2 cursor-pointer hover:bg-blue-50 flex justify-between gap-4"
                        onClick={() => handleSelectSale(s)}
                      >
                        <span className="font-mono font-semibold">{s.invoiceNumber}</span>
                        <span className="text-gray-500 truncate">{s.customer?.name ?? 'Comptoir'}</span>
                        <span className="text-gray-400 shrink-0">{money(s.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {saleSearch && filteredSales.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">Aucune facture trouvée</p>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded px-3 py-2">
                <span>Facture : <strong>{selectedSaleInvoice}</strong></span>
                <button
                  className="ml-auto text-gray-400 hover:text-gray-600"
                  onClick={() => { setSelectedSaleId(''); setSelectedSaleInvoice(''); setLines([]); setLinesLoaded(false); }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Articles retournables */}
          {selectedSaleId && (
            <>
              {returnableQuery.isLoading && <p className="text-sm text-gray-500">Chargement des articles…</p>}
              {returnableQuery.isSuccess && returnableQuery.data?.items.length === 0 && (
                <p className="text-sm text-orange-600 bg-orange-50 rounded px-3 py-2">
                  Tous les articles de cette facture ont déjà été retournés.
                </p>
              )}
              {lines.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Articles retournables — cochez ceux à retourner</p>
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-2 w-8 text-center"></th>
                          <th className="p-2 text-left">Désignation</th>
                          <th className="p-2 text-right">Disponible</th>
                          <th className="p-2 text-right">Quantité</th>
                          <th className="p-2 text-right">PU HT</th>
                          <th className="p-2 text-right">Total HT</th>
                          <th className="p-2 text-left">Motif</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, idx) => (
                          <tr key={line.saleItemId} className={`border-t ${line.selected ? 'bg-blue-50' : 'bg-white'}`}>
                            <td className="p-2 text-center">
                              <input type="checkbox" checked={line.selected} onChange={() => toggleLine(idx)} />
                            </td>
                            <td className="p-2 font-medium">{line.designation}</td>
                            <td className="p-2 text-right">{line.quantiteRetournable}</td>
                            <td className="p-2 text-right">
                              <input
                                type="number" min={1} max={line.quantiteRetournable}
                                value={line.quantiteRetournee}
                                disabled={!line.selected}
                                onChange={(e) => updateQty(idx, Number(e.target.value))}
                                className="w-14 border rounded px-1.5 py-1 text-right text-xs disabled:bg-gray-100"
                              />
                            </td>
                            <td className="p-2 text-right">{money(line.unitPrice)}</td>
                            <td className="p-2 text-right">
                              {line.selected ? money(line.unitPrice * line.quantiteRetournee) : '—'}
                            </td>
                            <td className="p-2">
                              <input
                                type="text" value={line.motifLigne}
                                disabled={!line.selected} placeholder="Optionnel"
                                onChange={(e) => updateMotifLigne(idx, e.target.value)}
                                className="w-full border rounded px-1.5 py-1 text-xs disabled:bg-gray-100"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Motif + méthode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Motif du retour</label>
              <input
                type="text" value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex: Article défectueux…"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Méthode de remboursement</label>
              <select
                value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="CASH">Espèces</option>
                <option value="CARD">Carte</option>
                <option value="BANK_TRANSFER">Virement bancaire</option>
                <option value="CHECK">Chèque</option>
                <option value="CREDIT">Crédit client</option>
              </select>
            </div>
          </div>

          {/* Récap montants */}
          {selectedLines.length > 0 && (
            <div className="flex justify-end">
              <div className="border rounded bg-red-50 p-4 text-sm space-y-1 min-w-52">
                <div className="flex justify-between gap-8"><span className="text-gray-500">Total HT</span><span>{money(subtotal)}</span></div>
                <div className="flex justify-between gap-8"><span className="text-gray-500">TVA (19%)</span><span>{money(tax)}</span></div>
                <div className="flex justify-between gap-8 font-bold text-red-700 border-t pt-1">
                  <span>Remboursement</span><span>{money(total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
    </SlideOver>
  );
}

// ── AvoirPage ─────────────────────────────────────────────────────────────────

export function AvoirPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailAvoir, setDetailAvoir] = useState<CreditNote | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const avoirsQuery = useQuery({
    queryKey: ['stockini-avoirs'],
    queryFn: () => stockiniApi.avoirs(),
  });
  const avoirs: CreditNote[] = avoirsQuery.data ?? [];

  const filtered = avoirs.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.numero.toLowerCase().includes(q) ||
      (a.customer?.name ?? '').toLowerCase().includes(q) ||
      (a.sale?.invoiceNumber ?? '').toLowerCase().includes(q) ||
      (a.motif ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <PageHeader
          title="Avoirs"
          subtitle="Retours clients et remboursements liés aux factures."
        />
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1" />
          Nouvel avoir
        </Button>
      </div>

      {/* Barre de recherche */}
      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
        <input
          className="w-full border rounded pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="N° avoir, client, facture, motif…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Historique des avoirs */}
      <Card className="shadow-card">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['N° Avoir', 'Date', 'Client', 'Facture', 'Articles', 'Total TTC', 'Remboursé', 'Statut', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {avoirsQuery.isLoading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">Chargement…</td></tr>
              )}
              {!avoirsQuery.isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">Aucun avoir enregistré</td></tr>
              )}
              {filtered.map((avoir) => (
                <>
                  <tr key={avoir.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-red-700 text-xs">{avoir.numero}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{fmtDate(avoir.dateAvoir)}</td>
                    <td className="px-4 py-3 text-gray-700">{avoir.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{avoir.sale?.invoiceNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-center">{avoir.items.length}</td>
                    <td className="px-4 py-3 tabular-nums">{money(avoir.total)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-red-700">{money(avoir.montantRembourse)}</td>
                    <td className="px-4 py-3">{statusBadge(avoir.statut)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <KebabMenu
                          items={[
                            {
                              label: 'Voir les détails',
                              icon: <Eye size={14} />,
                              onClick: () => setDetailAvoir(avoir),
                            },
                            {
                              label: 'Télécharger PDF',
                              icon: <FileDown size={14} />,
                              onClick: () => window.open(stockiniApi.avoirPdfUrl(avoir.id), '_blank'),
                            },
                          ]}
                        />
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-muted hover:text-text-primary"
                          title={expanded === avoir.id ? 'Masquer les lignes' : 'Voir les lignes'}
                          onClick={() => setExpanded(expanded === avoir.id ? null : avoir.id)}
                        >
                          {expanded === avoir.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === avoir.id && (
                    <tr key={`exp-${avoir.id}`} className="bg-gray-50">
                      <td colSpan={9} className="px-6 py-3">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-gray-200">
                              <th className="text-left p-1.5 border">Désignation</th>
                              <th className="text-right p-1.5 border">Qté retournée</th>
                              <th className="text-right p-1.5 border">PU HT</th>
                              <th className="text-right p-1.5 border">Total HT</th>
                              <th className="text-right p-1.5 border">Total TTC</th>
                              <th className="text-left p-1.5 border">Motif ligne</th>
                            </tr>
                          </thead>
                          <tbody>
                            {avoir.items.map((item) => (
                              <tr key={item.id} className="odd:bg-white even:bg-gray-50">
                                <td className="p-1.5 border">{item.designation}</td>
                                <td className="p-1.5 border text-right">{item.quantiteRetournee}</td>
                                <td className="p-1.5 border text-right">{money(item.prixUnitaireHt)}</td>
                                <td className="p-1.5 border text-right">{money(item.totalHt)}</td>
                                <td className="p-1.5 border text-right">{money(item.totalTtc)}</td>
                                <td className="p-1.5 border text-gray-500">{item.motifLigne ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {createOpen && <CreateAvoirModal onClose={() => setCreateOpen(false)} />}
      {detailAvoir && <AvoirDetailModal avoir={detailAvoir} onClose={() => setDetailAvoir(null)} />}
    </>
  );
}
