import { cn } from '@/lib/utils'

type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'teal' | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantMap: Record<BadgeVariant, string> = {
  green: 'badge-green',
  red: 'badge-red',
  amber: 'badge-amber',
  blue: 'badge-blue',
  purple: 'badge badge-purple',
  teal: 'badge badge-teal',
  default: 'badge',
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span className={cn('badge', variantMap[variant], className)}>
      {children}
    </span>
  )
}

export function StockBadge({ quantity, minStock }: { quantity: number; minStock: number }) {
  if (quantity === 0) return <Badge variant="red">Rupture</Badge>
  if (quantity <= minStock) return <Badge variant="amber">Stock bas</Badge>
  return <Badge variant="green">En stock</Badge>
}
