'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Textarea } from '@/components/ui/textarea';
import type { CashTransaction } from './CashTransactionsTable';
import { isDeletionReasonValid } from './cash-movement-deletion';

const TYPE_LABELS: Record<string, string> = {
  ENCAISSEMENT_VENTE: 'Vente',
  CUSTOMER_CHANGE_OUT: 'Monnaie client',
  CASH_SURPLUS_IN: 'Écart encaissé',
  DECAISSEMENT_ACHAT: 'Achat',
  DEPENSE_GENERALE: 'Dépense',
  DEPOT_MANUEL: 'Dépôt manuel',
  RETRAIT_MANUEL: 'Retrait manuel',
  ANNULATION_VENTE: 'Annulation vente',
  REFUND_OUT: 'Remboursement avoir',
  ANNULATION_ACHAT: 'Annulation achat',
  ANNULATION_DEPENSE: 'Annulation dépense',
  CASH_RESET: 'Remise à zéro',
};

function money(amount: number) {
  return `${new Intl.NumberFormat('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount)} DT`;
}

function dateTime(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span className="break-words font-medium text-text-primary">{value}</span>
    </div>
  );
}

interface Props {
  movement: CashTransaction | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}

export function CashMovementDeleteModal({ movement, onClose, onConfirm, isPending }: Props) {
  const [reason, setReason] = useState('');

  useEffect(() => setReason(''), [movement?.id]);
  if (!movement) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Supprimer ce mouvement de caisse ?"
      reference={movement.reference ?? undefined}
      onSave={() => onConfirm(reason.trim())}
      saveLabel="Confirmer la suppression"
      saving={isPending}
      saveDisabled={!isDeletionReasonValid(reason)}
      size="md"
    >
      <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-2">
        <Detail label="Date et heure" value={dateTime(movement.date)} />
        <Detail label="Type" value={TYPE_LABELS[movement.type] ?? movement.type} />
        <Detail label="Montant" value={money(movement.montant)} />
        <Detail label="Référence" value={movement.reference ?? '—'} />
        <Detail label="Créé par" value={movement.user?.fullName ?? movement.user?.email ?? '—'} />
        <Detail label="Description / motif" value={movement.motif ?? '—'} />
      </div>

      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Cette action supprimera le mouvement et recalculera les soldes de caisse suivants. Elle est réservée aux
        administrateurs.
      </p>

      <label htmlFor="cash-movement-deletion-reason" className="mb-1.5 block text-sm font-semibold text-text-primary">
        Motif de suppression <span className="text-red-500">*</span>
      </label>
      <Textarea
        id="cash-movement-deletion-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={isPending}
        placeholder="Ex. Montant saisi incorrectement, mouvement créé en double…"
        rows={4}
      />
    </Modal>
  );
}
