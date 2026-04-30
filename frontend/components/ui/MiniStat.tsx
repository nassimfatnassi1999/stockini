import { cn } from '@/lib/utils'

type IconVariant = 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'teal'

interface MiniStatProps {
  icon: React.ReactNode
  iconVariant: IconVariant
  label: string
  value: React.ReactNode
  right?: React.ReactNode
}

const iconClasses: Record<IconVariant, string> = {
  green: 'si-green',
  blue: 'si-blue',
  amber: 'si-amber',
  red: 'si-red',
  purple: 'si-purple',
  teal: 'si-teal',
}

export function MiniStat({ icon, iconVariant, label, value, right }: MiniStatProps) {
  return (
    <div className="mini-stat">
      <div className={cn('mini-icon', iconClasses[iconVariant])}>
        {icon}
      </div>
      <div>
        <div className="mini-label">{label}</div>
        <div className="mini-val">{value}</div>
      </div>
      {right && <div className="mini-right">{right}</div>}
    </div>
  )
}
