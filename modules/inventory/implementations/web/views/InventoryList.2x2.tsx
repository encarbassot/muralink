import type { YItem } from '../../../types.ts'

interface Props {
  items?: YItem[]
  onItemClick?: (item: YItem) => void
}

export function InventoryList({ items = [], onItemClick }: Props) {
  const sorted = [...items].sort((a, b) => {
    const aLow = a.minStock !== undefined && a.quantity <= a.minStock
    const bLow = b.minStock !== undefined && b.quantity <= b.minStock
    if (aLow && !bLow) return -1
    if (!aLow && bLow) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        Stock · {items.length} artículos
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {items.length === 0 && (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Sin artículos</div>
        )}
        {sorted.map(item => {
          const isLow = item.minStock !== undefined && item.quantity <= item.minStock
          return (
            <div
              key={item.id}
              onClick={() => onItemClick?.(item)}
              style={{
                padding: '9px 12px',
                borderBottom: '1px solid var(--border, #d4cfc9)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: isLow ? '#e5393508' : undefined,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </div>
                {item.category && (
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)' }}>{item.category}</div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isLow ? '#e53935' : 'inherit' }}>
                  {item.quantity} {item.unit}
                </div>
                {item.minStock !== undefined && (
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground, #6b6560)' }}>
                    mín {item.minStock}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
