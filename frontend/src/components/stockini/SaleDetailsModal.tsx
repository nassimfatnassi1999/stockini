'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/stockini/format';
import type { SaleDetail } from '@/lib/stockini/types';

const PAYMENT_LABELS: Record<string, string> = {
  PAID: 'Payé',
  PARTIAL: 'Partiel',
  UNPAID: 'Non payé',
};

const SALE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  RETURNED: 'Retournée',
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DRAFT: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  CANCELLED: 'border-red-200 bg-red-50 text-red-700',
  RETURNED: 'border-orange-200 bg-orange-50 text-orange-700',
};

const PAYMENT_COLORS: Record<string, string> = {
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PARTIAL: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  UNPAID: 'border-red-200 bg-red-50 text-red-700',
};

interface Props {
  saleId: string;
  onClose: () => void;
}

function fmt3(v: number | string) {
  return Number(v).toLocaleString('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export function SaleDetailsModal({ saleId, onClose }: Props) {
  const { data: sale, isLoading, error } = useQuery<SaleDetail>({
    queryKey: ['sale-detail', saleId],
    queryFn: () => api.get<SaleDetail>(`/sales/${saleId}`).then((r) => r.data),
    enabled: !!saleId,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-4xl rounded-xl border border-border/70 bg-white shadow-2xl mb-10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Détails de la vente
              {sale && (
                <span className="ml-2 font-mono text-primary">{sale.invoiceNumber}</span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">Vue en lecture seule</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 p-6">
          {isLoading && (
            <div className="py-16 text-center text-sm text-text-muted">Chargement…</div>
          )}
          {error && (
            <div className="py-8 text-center text-sm text-red-600">
              Impossible de charger les détails de cette vente.
            </div>
          )}
          {sale && (
            <>
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <InfoField label="Numéro facture" value={sale.invoiceNumber} mono />
                <InfoField label="Client" value={sale.customer?.name ?? 'Comptoir'} />
                <InfoField
                  label="Date"
                  value={new Date(sale.createdAt).toLocaleDateString('fr-TN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                />
                <div className="space-y-0.5">
                  <p className="text-xs text-text-muted">Statut</p>
                  <span
                    className={`app-status-badge ${STATUS_COLORS[sale.status] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                  >
                    {SALE_STATUS_LABELS[sale.status] ?? sale.status}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-text-muted">Paiement</p>
                  <span
                    className={`app-status-badge ${PAYMENT_COLORS[sale.paymentStatus] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                  >
                    {PAYMENT_LABELS[sale.paymentStatus] ?? sale.paymentStatus}
                  </span>
                </div>
                <InfoField label="Montant payé" value={money(sale.paidAmount)} mono />
                {Number(sale.remainingAmount) > 0 && (
                  <InfoField
                    label="Reste à payer"
                    value={money(sale.remainingAmount)}
                    mono
                    highlight
                  />
                )}
              </div>

              <hr className="border-border/50" />

              {/* Lines table */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Lignes de vente ({sale.items.length})
                </h3>
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <table className="w-full text-xs">
                    <thead className="bg-surface">
                      <tr className="border-b border-border/60">
                        {[
                          { label: 'Réf', right: false },
                          { label: 'Désignation', right: false },
                          { label: 'Qté', right: true },
                          { label: 'PU HT', right: true },
                          { label: 'Marge %', right: true },
                          { label: 'Total HT', right: true },
                        ].map(({ label, right }) => (
                          <th
                            key={label}
                            className={`px-3 py-2.5 font-semibold uppercase tracking-wide text-text-muted ${right ? 'text-right' : 'text-left'}`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {sale.items.map((item) => {
                        const unitPrice = Number(item.unitPrice);
                        const purchasePrice = Number(item.product?.purchasePrice ?? 0);
                        const margePercent =
                          purchasePrice > 0
                            ? ((unitPrice - purchasePrice) / purchasePrice) * 100
                            : null;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2.5 font-mono text-text-secondary">
                              {item.product?.reference ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-text-primary">
                              {item.product?.name ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {item.quantity}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {fmt3(item.unitPrice)}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                                margePercent === null
                                  ? 'text-text-muted'
                                  : margePercent < 20
                                    ? 'text-red-600'
                                    : 'text-emerald-600'
                              }`}
                            >
                              {margePercent === null
                                ? '—'
                                : `${margePercent.toLocaleString('fr-TN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })} %`}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                              {fmt3(item.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 rounded-lg border border-border/60 bg-surface p-4">
                  <TotalRow label="Sous-total HT" value={money(sale.subtotal)} />
                  {Number(sale.discount) > 0 && (
                    <TotalRow label="Remise" value={`− ${money(sale.discount)}`} negative />
                  )}
                  {Number(sale.tax) > 0 && (
                    <TotalRow label="TVA" value={`+ ${money(sale.tax)}`} />
                  )}
                  <div className="border-t border-border/60 pt-1.5">
                    <TotalRow label="Total TTC" value={money(sale.total)} bold />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoField({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-text-muted">{label}</p>
      <p
        className={`text-sm font-medium ${mono ? 'font-mono' : ''} ${
          highlight ? 'text-red-600' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TotalRow({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-text-muted">{label}</span>
      <span
        className={`font-mono tabular-nums ${
          bold ? 'text-sm font-bold text-text-primary' : 'text-text-secondary'
        } ${negative ? 'text-red-600' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
