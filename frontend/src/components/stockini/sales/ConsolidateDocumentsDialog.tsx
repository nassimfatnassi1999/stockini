'use client';

import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { money } from '@/lib/stockini/format';
import type { Sale } from '@/lib/stockini/types';

export function ConsolidateDocumentsDialog({ sales, onClose, onConfirm, loading = false }: {
  sales: Sale[];
  onClose: () => void;
  onConfirm: (value: { targetType: 'BON_LIVRAISON' | 'FACTURE'; date: string; note: string }) => void;
  loading?: boolean;
}) {
  const sourceType = sales[0]?.documentType;
  const [targetType, setTargetType] = useState<'BON_LIVRAISON' | 'FACTURE'>(sourceType === 'FACTURE' ? 'FACTURE' : 'BON_LIVRAISON');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const summary = useMemo(() => sales.reduce((acc, sale) => ({
    articles: acc.articles + (sale.items?.reduce((n, item) => n + Number(item.quantity), 0) ?? 0),
    total: acc.total + Number(sale.total),
    paid: acc.paid + Number(sale.paidAmount ?? 0), credits: acc.credits + Number(sale.totalRefunded ?? 0),
  }), { articles: 0, total: 0, paid: 0, credits: 0 }), [sales]);
  const consolidatedStamp = 1;
  const net = summary.total + consolidatedStamp;
  const remaining = Math.max(net - summary.paid - summary.credits, 0);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="consolidation-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4"><h2 id="consolidation-title" className="font-semibold">Regrouper les documents</h2><button onClick={onClose} aria-label="Fermer"><X size={18} /></button></div>
        <div className="space-y-5 p-5 text-sm">
          <div><p className="text-xs text-slate-500">Client</p><p className="font-medium">{sales[0]?.customer?.name ?? '—'}</p></div>
          <div className="flex flex-wrap gap-2">{sales.map((sale) => <span key={sale.id} className="rounded bg-slate-100 px-2 py-1 font-mono text-xs">{sale.invoiceNumber}</span>)}</div>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
            <Metric label="Documents" value={String(sales.length)} /><Metric label="Articles" value={String(summary.articles)} />
            <Metric label="TTC hors timbre" value={money(summary.total)} /><Metric label="Timbre" value={money(consolidatedStamp)} />
            <Metric label="Net à payer" value={money(net)} /><Metric label="Déjà payé" value={money(summary.paid)} />
            <Metric label="Avoirs" value={money(summary.credits)} /><Metric label="Reste" value={money(remaining)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1"><span className="text-xs text-slate-500">Type final</span><select className="app-select w-full" value={targetType} onChange={(e) => setTargetType(e.target.value as typeof targetType)}><option value="BON_LIVRAISON">Bon de livraison consolidé</option><option value="FACTURE">Facture consolidée</option></select></label><label className="space-y-1"><span className="text-xs text-slate-500">Date</span><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label></div>
          <label className="block space-y-1"><span className="text-xs text-slate-500">Note</span><textarea className="min-h-20 w-full rounded-lg border p-2" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Les documents sources resteront consultables mais leurs paiements seront gérés depuis le document consolidé.</p>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4"><Button variant="outline" onClick={onClose} disabled={loading}>Annuler</Button><Button onClick={() => onConfirm({ targetType, date, note })} disabled={loading}>{loading && <Loader2 size={14} className="animate-spin" />} Regrouper</Button></div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] text-slate-500">{label}</p><p className="font-semibold tabular-nums">{value}</p></div>; }
