import type { YItem } from '../../../types.ts'

interface Props {
  items?: YItem[]
  onClick?: () => void
}

export function StockAlert({ items = [], onClick }: Props) {
  const lowStock = items.filter(i => i.minStock !== undefined && i.quantity <= i.minStock)
  const count = lowStock.length
  const hasAlert = count > 0

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        gap: 6,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 700, color: hasAlert ? '#e53935' : 'var(--muted-foreground, #6b6560)' }}>
        {count}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)', textAlign: 'center' }}>
        {count === 1 ? 'artículo bajo stock' : 'artículos bajo stock'}
      </div>
      {hasAlert && (
        <div style={{
          fontSize: 9,
          padding: '2px 6px',
          borderRadius: 99,
          background: '#e5393522',
          color: '#e53935',
          fontWeight: 600,
          letterSpacing: 0.5,
        }}>
          REVISAR
        </div>
      )}
    </div>
  )
}
