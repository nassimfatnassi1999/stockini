'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { money } from '@/lib/stockini/format';
import { stockiniApi } from '@/lib/stockini/api';
import { toast } from '@/lib/toast';
import type { Sale } from '@/lib/stockini/types';

type DeconsolidationSale = Pick<Sale, 'id' | 'invoiceNumber' | 'total' | 'stampDuty' | 'totalFinal'>;

export function DeconsolidateDialog({ sale, onClose, onSuccess }: {
  sale: DeconsolidationSale;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const details = useQuery({
    queryKey: ['sales-consolidation', sale.id],
    queryFn: () => stockiniApi.salesConsolidation(String(sale.id)),
  });
  const mutation = useMutation({
    mutationFn: () => stockiniApi.cancelSalesConsolidation(String(sale.id), reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success('Regroupement annulé avec succès. Les documents sources ont été restaurés.');
      onSuccess?.();
      onClose();
    },
    onError: (error: unknown) => toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Impossible d’annuler le regroupement'),
  });
  const data = details.data;
  const sourceReferences = data?.consolidationSources?.map((source) => source.sourceReference) ?? [];
  const parentPayments = data?.payments?.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
  const parentCredits = data?.creditNotes?.reduce((sum, credit) => sum + Number(credit.montantRembourse), 0) ?? 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="deconsolidate-title">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4"><div className="flex items-center gap-2"><AlertTriangle className="text-amber-600" size={20} /><h2 id="deconsolidate-title" className="font-semibold">Annuler le regroupement ?</h2></div><button onClick={onClose} aria-label="Fermer"><X size={18} /></button></div>
        <div className="space-y-4 p-5 text-sm">
          {details.isLoading ? <div className="flex items-center justify-center gap-2 py-8 text-slate-500"><Loader2 className="animate-spin" size={18} /> Chargement…</div> : details.isError ? <p className="rounded-lg bg-red-50 p-3 text-red-700">Impossible de charger le regroupement.</p> : <>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
              <Metric label="Référence consolidée" value={sale.invoiceNumber} mono />
              <Metric label="Documents sources" value={String(sourceReferences.length)} />
              <Metric label="Montant total" value={money(data?.totalFinal ?? sale.totalFinal)} />
              <Metric label="Paiements sur le parent" value={money(parentPayments)} />
              <Metric label="Avoirs sur le parent" value={money(parentCredits)} />
            </div>
            <div><p className="mb-2 text-xs text-slate-500">Références sources</p><div className="flex flex-wrap gap-2">{sourceReferences.map((reference) => <span key={reference} className="rounded border bg-white px-2 py-1 font-mono text-xs">{reference}</span>)}</div></div>
            <label className="block space-y-1"><span className="text-xs text-slate-500">Motif éventuel</span><textarea className="min-h-20 w-full rounded-lg border p-2" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Cette action restaurera les documents sources dans leur état précédent et retirera le document consolidé de la liste active.</p>
          </>}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4"><Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Annuler</Button><Button onClick={() => mutation.mutate()} disabled={!data || mutation.isPending}>{mutation.isPending && <Loader2 className="animate-spin" size={14} />} Confirmer la déconsolidation</Button></div>
      </div>
    </div>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><p className="text-[11px] text-slate-500">{label}</p><p className={`font-semibold ${mono ? 'font-mono text-xs' : 'tabular-nums'}`}>{value}</p></div>; }
