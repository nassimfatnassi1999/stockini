import { Card, CardHead, CardTitle } from './Card'
import { getInitials } from '@/lib/utils'

interface Sale {
  id: string | number
  customerName: string
  invoiceNumber: string
  time: string
  amount: string
  avatarColor?: string
  avatarTextColor?: string
}

interface SalesListProps {
  sales: Sale[]
  totalAmount: string
}

export function SalesList({ sales, totalAmount }: SalesListProps) {
  return (
    <Card>
      <CardHead>
        <CardTitle>Ventes du jour</CardTitle>
        <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginLeft: 'auto' }}>
          {totalAmount}
        </span>
      </CardHead>
      {sales.map((sale) => (
        <div key={sale.id} className="sale-row">
          <div
            className="sale-avatar"
            style={{
              background: sale.avatarColor ?? 'var(--accent-dim)',
              color: sale.avatarTextColor ?? 'var(--accent2)',
            }}
          >
            {getInitials(sale.customerName)}
          </div>
          <div className="sale-info">
            <div className="sale-name">{sale.customerName}</div>
            <div className="sale-sub">{sale.invoiceNumber} · {sale.time}</div>
          </div>
          <div className="sale-amount">+{sale.amount}</div>
        </div>
      ))}
    </Card>
  )
}
