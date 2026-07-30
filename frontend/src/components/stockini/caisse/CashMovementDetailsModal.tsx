'use client';

import { Modal } from '@/components/shared/Modal';
import type { CashTransaction } from './CashTransactionsTable';

export function CashMovementDetailsModal({
  movement,
  onClose,
}: {
  movement: CashTransaction | null;
  onClose: () => void;
}) {
  if (!movement) return null;
  const values = [
    ['Date et heure', new Date(movement.date).toLocaleString('fr-FR')],
    ['Type', movement.type],
    ['Compte', movement.account === 'PHYSICAL_CASH' ? 'Caisse physique' : 'Banque / Chèques'],
    ['Référence', movement.reference ?? '—'],
    ['Montant', `${movement.montant.toFixed(3)} DT`],
    ['Solde avant', `${movement.ancienSolde.toFixed(3)} DT`],
    ['Solde après', `${movement.nouveauSolde.toFixed(3)} DT`],
    ['Utilisateur', movement.user?.fullName ?? movement.user?.email ?? '—'],
    ['Description / motif', movement.motif ?? '—'],
  ];
  return (
    <Modal open title="Détails du mouvement" reference={movement.reference ?? undefined} onClose={onClose}>
      <div className="rounded-lg border border-border bg-surface px-4 py-2">
        {values.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[130px_1fr] gap-3 border-b border-border/60 py-2 text-sm last:border-0"
          >
            <span className="text-text-secondary">{label}</span>
            <span className="break-words font-medium text-text-primary">{value}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
