import { Card, CardHead, CardTitle } from './Card'

interface Alert {
  id: string | number
  message: string
  time: string
  color: 'red' | 'amber' | 'purple' | 'text3'
}

interface AlertsPanelProps {
  alerts: Alert[]
  count?: number
}

const colorMap = {
  red: 'var(--red)',
  amber: 'var(--amber)',
  purple: 'var(--purple)',
  text3: 'var(--text3)',
}

export function AlertsPanel({ alerts, count }: AlertsPanelProps) {
  return (
    <Card>
      <CardHead>
        <CardTitle>Alertes actives</CardTitle>
        {count !== undefined && (
          <span className="nav-badge" style={{ position: 'static' }}>{count}</span>
        )}
      </CardHead>
      <div className="alert-list">
        {alerts.map((alert) => (
          <div key={alert.id} className="alert-item">
            <div className="alert-dot" style={{ background: colorMap[alert.color] }} />
            <div>
              <div className="alert-msg">{alert.message}</div>
              <div className="alert-time">{alert.time}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
