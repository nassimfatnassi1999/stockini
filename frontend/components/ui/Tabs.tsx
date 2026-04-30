'use client'

import { cn } from '@/lib/utils'

interface TabsProps {
  tabs: string[]
  active: string
  onChange: (tab: string) => void
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <div
          key={tab}
          className={cn('tab', active === tab && 'active')}
          onClick={() => onChange(tab)}
        >
          {tab}
        </div>
      ))}
    </div>
  )
}
