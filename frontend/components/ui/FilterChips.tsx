'use client'

import { cn } from '@/lib/utils'

interface FilterChipsProps {
  options: string[]
  active: string
  onChange: (value: string) => void
}

export function FilterChips({ options, active, onChange }: FilterChipsProps) {
  return (
    <div className="filter-row" style={{ padding: '12px 20px 0' }}>
      {options.map((opt) => (
        <span
          key={opt}
          className={cn('filter-chip', active === opt && 'on')}
          onClick={() => onChange(opt)}
        >
          {opt}
        </span>
      ))}
    </div>
  )
}
