import type { Alert } from '@/lib/stockini/types';

export type AlertTone = 'danger' | 'warning' | 'neutral';

const ALERT_TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: 'Stock faible',
  OUT_OF_STOCK: 'Rupture de stock',
  UNPAID_INVOICE: 'Facture impayée',
  PURCHASE_DELAY: 'Retard d’achat',
  SYSTEM: 'Système',
};

export function getAlertTypePresentation(type: string | null | undefined): {
  label: string;
  tone: AlertTone;
} {
  const normalized = (type ?? '').trim().replace(/[\s-]+/g, '_').toUpperCase();
  return {
    label: ALERT_TYPE_LABELS[normalized] ?? (type?.trim() || 'Type inconnu'),
    tone: normalized === 'OUT_OF_STOCK' ? 'danger' : normalized === 'LOW_STOCK' ? 'warning' : 'neutral',
  };
}

export function getAlertViewModel(alert: Alert) {
  return {
    designation: alert.designation?.trim() || alert.product?.name?.trim() || alert.title?.trim() || '—',
    reference: alert.reference?.trim() || alert.product?.reference?.trim() || '—',
    currentStock: alert.currentStock ?? alert.product?.quantity ?? null,
    minimumStock: alert.minimumStock ?? alert.product?.minStock ?? null,
  };
}

export function formatAlertDate(value: string | null | undefined, withSeconds = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  }).format(date);
}
