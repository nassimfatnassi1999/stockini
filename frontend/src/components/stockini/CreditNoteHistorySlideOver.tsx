"use client";

import { useQuery } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/button";
import { stockiniApi } from "@/lib/stockini/api";
import { openPdfInNewTab, pdfOpenErrorMessage } from "@/lib/openPdf";
import { toast } from "@/lib/toast";
import { money } from "@/lib/stockini/format";
import type { CreditNote, Sale } from "@/lib/stockini/types";

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-TN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  CREATED: { label: "Créé", cls: "bg-blue-100 text-blue-700" },
  REFUNDED: { label: "Remboursé", cls: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Annulé", cls: "bg-red-100 text-red-700" },
};

const REFUND_METHOD_LABELS: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  BANK_TRANSFER: "Virement",
  CHECK: "Chèque",
  CREDIT: "Crédit client",
};

function AvoirCard({ avoir }: { avoir: CreditNote }) {
  const openPdf = async () => {
    try {
      await openPdfInNewTab(() => stockiniApi.avoirPdf(avoir.id));
    } catch (error) {
      toast.error(pdfOpenErrorMessage(error));
    }
  };
  const refundMethod =
    avoir.payments?.[0]?.method
      ? (REFUND_METHOD_LABELS[avoir.payments[0].method] ?? avoir.payments[0].method)
      : avoir.statut === "CREATED"
        ? "Non remboursé"
        : "—";

  const badge = STATUS_BADGE[avoir.statut] ?? {
    label: avoir.statut,
    cls: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-mono font-bold text-red-700 text-sm">
            {avoir.numero}
          </span>
          <span className="ml-2 text-xs text-slate-500">
            {fmtDate(avoir.dateAvoir)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
            {badge.label}
          </span>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={openPdf}>
            <FileDown size={12} className="mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-slate-50 p-2 text-center">
          <div className="text-slate-500 mb-0.5">Total TTC</div>
          <div className="font-semibold">{money(avoir.total)}</div>
        </div>
        <div className="rounded bg-red-50 p-2 text-center">
          <div className="text-slate-500 mb-0.5">Remboursé</div>
          <div className="font-semibold text-red-700">
            {money(avoir.montantRembourse)}
          </div>
        </div>
        <div className="rounded bg-slate-50 p-2 text-center">
          <div className="text-slate-500 mb-0.5">Méthode</div>
          <div className="font-semibold">{refundMethod}</div>
        </div>
      </div>

      {/* Motif */}
      {avoir.motif && (
        <p className="text-xs text-slate-500 italic">Motif : {avoir.motif}</p>
      )}

      {/* Lines */}
      <div className="border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium text-slate-500">
                Article
              </th>
              <th className="text-right px-2 py-1.5 font-medium text-slate-500">
                Qté
              </th>
              <th className="text-right px-2 py-1.5 font-medium text-slate-500">
                TTC
              </th>
              <th className="text-left px-2 py-1.5 font-medium text-slate-500">
                Motif ligne
              </th>
            </tr>
          </thead>
          <tbody>
            {avoir.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-2 py-1.5">{item.designation}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {item.quantiteRetournee}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {money(item.totalTtc)}
                </td>
                <td className="px-2 py-1.5 text-slate-400">
                  {item.motifLigne ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Props {
  sale: Sale;
  onClose: () => void;
}

export function CreditNoteHistorySlideOver({ sale, onClose }: Props) {
  const query = useQuery({
    queryKey: ["sale-credit-notes", sale.id],
    queryFn: () => stockiniApi.saleCreditNotes(sale.id),
    staleTime: 0,
  });

  const avoirs: CreditNote[] = query.data ?? [];

  // Compute totals from the freshly fetched avoirs so the banner is always
  // correct even if the parent passed a slightly stale sale object.
  const activeAvoirs = avoirs.filter((av) => av.statut !== "CANCELLED");
  const computedRefunded = activeAvoirs.reduce(
    (sum, av) => sum + Number(av.total),
    0,
  );

  // Prefer server-computed fields; fall back to local computation while loading.
  const initialTtc = Number(sale.totalInitialTtc ?? sale.total);
  const totalRefunded =
    query.isFetched ? computedRefunded : Number(sale.totalRefunded ?? 0);
  const currentTtc = Math.max(0, initialTtc - totalRefunded);

  const isRefunded = sale.status === "REFUNDED";
  const isPartial = sale.status === "PARTIALLY_REFUNDED";

  return (
    <SlideOver
      title="Historique des avoirs"
      subtitle={sale.invoiceNumber}
      open
      onClose={onClose}
      width={620}
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Summary banner */}
        <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
          {/* Top row: initial / refunded / current */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Total initial</div>
              <div className="font-semibold tabular-nums">{money(initialTtc)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Remboursé cumulé</div>
              <div className="font-semibold tabular-nums text-red-700">
                {query.isLoading
                  ? "…"
                  : money(totalRefunded)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Total actuel</div>
              <div className="font-semibold tabular-nums text-slate-800">
                {query.isLoading ? "…" : money(currentTtc)}
              </div>
            </div>
          </div>

          {/* Status row */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
            <span className="text-xs text-slate-500">Statut remboursement</span>
            {isRefunded ? (
              <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                Remboursé intégral
              </span>
            ) : isPartial ? (
              <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                Remb. partiel
              </span>
            ) : (
              <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">
                Aucun
              </span>
            )}
          </div>
        </div>

        {/* Loading */}
        {query.isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
            <Loader2 size={16} className="animate-spin" />
            Chargement des avoirs…
          </div>
        )}

        {/* Empty */}
        {!query.isLoading && avoirs.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">
            Aucun avoir lié à ce document.
          </p>
        )}

        {/* Avoir cards */}
        {avoirs.map((avoir) => (
          <AvoirCard key={avoir.id} avoir={avoir} />
        ))}
      </div>
    </SlideOver>
  );
}
