import { cn } from '@/lib/utils'

type StatVariant = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'teal' | 'default'

interface StatCardProps {
  variant?: StatVariant
  icon: React.ReactNode
  value: string | number
  label: string
  trend?: string
  trendType?: 'up' | 'down'
}

const iconClass: Record<StatVariant, string> = {
  blue: 'si-blue',
  green: 'si-green',
  red: 'si-red',
  amber: 'si-amber',
  purple: 'si-purple',
  teal: 'si-teal',
  default: 'si-blue',
}

export function StatCard({ variant = 'default', icon, value, label, trend, trendType = 'up' }: StatCardProps) {
  return (
    <div className={cn('stat-card', variant !== 'default' && variant)}>
      <div className={cn('stat-icon', iconClass[variant])}>
        {icon}
      </div>
      <div className="stat-val">{value}</div>
      <div className="stat-label">{label}</div>
      {trend && (
        <div className={cn('stat-trend', trendType === 'up' ? 'trend-up' : 'trend-down')}>
          {trendType === 'up' ? '▲' : '▼'} {trend}
        </div>
      )}
    </div>
  )
}
