import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_COLORS: Record<string, string> = {
  'A_planifier': 'bg-gray-100 text-gray-700 border-gray-200',
  'Preparation': 'bg-blue-100 text-blue-700 border-blue-200',
  'DT_DICT': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Planifie': 'bg-purple-100 text-purple-700 border-purple-200',
  'Intervention_realisee': 'bg-orange-100 text-orange-700 border-orange-200',
  'Livrables_en_cours': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Cloture': 'bg-green-100 text-green-700 border-green-200',
  'En_attente': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Paye': 'bg-green-100 text-green-700 border-green-200',
  'Impaye': 'bg-red-100 text-red-700 border-red-200',
  'Partiel': 'bg-orange-100 text-orange-700 border-orange-200',
  'Nouvelle_demande': 'bg-blue-100 text-blue-700 border-blue-200',
  'Acceptee': 'bg-green-100 text-green-700 border-green-200',
  'Refusee': 'bg-red-100 text-red-700 border-red-200',
  'Annulee': 'bg-gray-100 text-gray-500 border-gray-200',
};

export const STATUS_LABELS: Record<string, string> = {
  'A_planifier': 'À planifier',
  'Preparation': 'Préparation',
  'DT_DICT': 'DT/DICT',
  'Planifie': 'Planifié',
  'Intervention_realisee': 'Intervention réalisée',
  'Livrables_en_cours': 'Livrables en cours',
  'Cloture': 'Clôturé',
  'En_attente': 'En attente',
  'Paye': 'Payé',
  'Impaye': 'Impayé',
  'Partiel': 'Partiel',
  'Nouvelle_demande': 'Nouvelle demande',
  'En_analyse': 'En analyse',
  'Pieces_a_completer': 'Pièces à compléter',
  'Devis_a_faire': 'Devis à faire',
  'Devis_envoye': 'Devis envoyé',
  'Acceptee': 'Acceptée',
  'Refusee': 'Refusée',
  'Annulee': 'Annulée',
};

export function formatDate(d?: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatEuros(amount?: number | string | null): string {
  if (amount == null) return '—';
  return Number(amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}
