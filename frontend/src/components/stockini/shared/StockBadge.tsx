import { Badge } from '@/components/ui/badge';
import type { Product } from '@/lib/stockini/types';

export function StockBadge({ product }: { product: Product }) {
  if (product.quantity <= 0) return <Badge className="border-red-200 bg-red-50 text-red-700">rupture</Badge>;
  if (product.quantity <= product.minStock) return <Badge className="border-amber-200 bg-amber-50 text-amber-700">stock bas</Badge>;
  return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">disponible</Badge>;
}
