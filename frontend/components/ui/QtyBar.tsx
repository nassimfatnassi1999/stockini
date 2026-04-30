interface QtyBarProps {
  quantity: number
  maxQuantity?: number
  minStock?: number
}

export function QtyBar({ quantity, maxQuantity = 60, minStock = 10 }: QtyBarProps) {
  const pct = Math.min((quantity / maxQuantity) * 100, 100)
  const color =
    quantity === 0 ? 'var(--red)' :
    quantity <= minStock ? 'var(--amber)' :
    pct > 50 ? 'var(--green)' :
    'var(--accent)'

  return (
    <div className="qty-bar">
      <span style={{ color: quantity === 0 ? 'var(--red)' : quantity <= minStock ? 'var(--amber)' : 'var(--text1)' }}>
        {quantity}
      </span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
