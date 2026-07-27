'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Bell, Box, CalendarClock, Hash, MessageSquareText, Package, X } from 'lucide-react';
import type { Alert } from '@/lib/stockini/types';
import { formatAlertDate, getAlertTypePresentation, getAlertViewModel } from '@/lib/alerts-presentation';
import { cn } from '@/lib/utils';

const toneClasses = {
  danger: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
};

function DetailItem({ icon, label, value, mono = false }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-white p-3.5">
      <dt className="flex items-center gap-2 text-xs font-medium text-text-muted">
        <span className="text-app-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        {label}
      </dt>
      <dd className={cn('mt-1.5 break-words text-sm font-semibold text-text-primary', mono && 'font-mono text-xs')}>
        {value}
      </dd>
    </div>
  );
}

export function AlertDetailsDrawer({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const type = getAlertTypePresentation(alert?.type);
  const details = alert ? getAlertViewModel(alert) : null;
  const TypeIcon = type.tone === 'neutral' ? Bell : AlertTriangle;

  return (
    <Dialog.Root open={Boolean(alert)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-none sm:w-full sm:max-w-[500px] sm:rounded-none sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-right">
          <div className="flex shrink-0 items-start justify-between border-b border-border/70 px-4 py-4 sm:px-6">
            <div className="min-w-0 pr-3">
              <Dialog.Title className="text-base font-semibold text-text-primary">Détails de l’alerte</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-secondary">
                Toutes les informations enregistrées pour cette alerte.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ring" aria-label="Fermer les détails">
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>

          {alert && details && (
            <div className="min-h-0 flex-1 overflow-y-auto bg-surface/50 px-4 py-5 sm:px-6">
              <div className="mb-5">
                <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', toneClasses[type.tone])}>
                  <TypeIcon size={14} aria-hidden="true" />
                  {type.label}
                </span>
                <p className="mt-3 break-words text-lg font-semibold leading-6 text-text-primary">{details.designation}</p>
                {alert.title?.trim() && alert.title.trim() !== details.designation && (
                  <p className="mt-1 text-sm text-text-secondary">{alert.title}</p>
                )}
              </div>

              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailItem icon={<Package />} label="Produit" value={details.designation} />
                <DetailItem icon={<Hash />} label="Référence" value={details.reference} mono />
                <DetailItem icon={<Box />} label="Stock actuel" value={details.currentStock ?? '—'} />
                <DetailItem icon={<Box />} label="Seuil minimum" value={details.minimumStock ?? '—'} />
                <DetailItem icon={<Bell />} label="Statut" value={alert.isRead ? 'Lue' : 'Non lue'} />
                <div>
                  <DetailItem icon={<CalendarClock />} label="Date de l’alerte" value={formatAlertDate(alert.createdAt, true)} />
                </div>
              </dl>

              <div className="mt-3 rounded-lg border border-border/70 bg-white p-4">
                <h3 className="flex items-center gap-2 text-xs font-medium text-text-muted">
                  <MessageSquareText size={16} className="text-app-primary" />
                  Message complet
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
                  {alert.message?.trim() || '—'}
                </p>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
