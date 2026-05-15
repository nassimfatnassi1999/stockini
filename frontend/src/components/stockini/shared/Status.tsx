import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/lib/stockini/format';

export function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();

  const variant =
    normalized.includes('cancel') || normalized.includes('unpaid') || normalized.includes('open')
      ? 'danger'
      : normalized.includes('paid') ||
          normalized.includes('completed') ||
          normalized.includes('received') ||
          normalized.includes('read')
        ? 'success'
        : 'warning';

  return <Badge variant={variant}>{statusLabel(value)}</Badge>;
}
