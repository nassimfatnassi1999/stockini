import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/lib/stockini/format';

export function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className = normalized.includes('cancel') || normalized.includes('unpaid') || normalized.includes('open')
    ? 'border-red-200 bg-red-50 text-red-700'
    : normalized.includes('paid') || normalized.includes('completed') || normalized.includes('received') || normalized.includes('read')
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return <Badge className={className}>{statusLabel(value)}</Badge>;
}
