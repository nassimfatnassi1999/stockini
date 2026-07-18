import { cn } from '@/lib/utils';

const CONFIG = {
  PAID: { label: 'Payé', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  PARTIAL: { label: 'Partiellement payé', className: 'border-orange-200 bg-orange-50 text-orange-700' },
  UNPAID: { label: 'Non payé', className: 'border-red-200 bg-red-50 text-red-700' },
} as const;

export function PaymentStatusBadge({ status }: { status: keyof typeof CONFIG }) {
  const config = CONFIG[status] ?? CONFIG.UNPAID;
  return <span className={cn('app-status-badge whitespace-nowrap', config.className)}>{config.label}</span>;
}
