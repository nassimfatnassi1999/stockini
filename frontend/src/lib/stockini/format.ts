export type SalesDocumentType = 'DEVIS' | 'BON_COMMANDE' | 'BON_LIVRAISON' | 'FACTURE' | 'AVOIR';

export interface PaymentDisplay {
  label: string;
  className: string;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PAID: 'Payé',
  PARTIAL: 'Partiel',
  UNPAID: 'Non payé',
};

const PAYMENT_STATUS_CLASSES: Record<string, string> = {
  PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PARTIAL: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  UNPAID: 'border-red-200 bg-red-50 text-red-700',
};

const NON_PAYABLE_TYPES: ReadonlySet<string> = new Set([
  'DEVIS',
  'BON_COMMANDE',
  'BON_LIVRAISON',
  'AVOIR',
]);

const NEUTRAL_PAYMENT: PaymentDisplay = {
  label: '—',
  className: 'border-gray-200 bg-gray-100 text-gray-500',
};

export function getPaymentDisplay(
  documentType: string | null | undefined,
  paymentStatus: string | null | undefined,
): PaymentDisplay {
  if (!documentType || NON_PAYABLE_TYPES.has(documentType) || !paymentStatus) {
    return NEUTRAL_PAYMENT;
  }
  return {
    label: PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus,
    className: PAYMENT_STATUS_CLASSES[paymentStatus] ?? 'border-slate-200 bg-slate-50 text-slate-700',
  };
}

export function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount) + ' DT';
}

export function dateTime(value: string | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function statusLabel(value: string | null | undefined) {
  return (value ?? '-').replace(/_/g, ' ').toLowerCase();
}

export function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join('');
}
