import { useState } from 'react'
import type { YStockItem } from '../../../types.ts'

interface Props {
  items?: YStockItem[]
  onItemClick?: (item: YStockItem) => void
  onAdjust?: (id: string, delta: number) => void
}

function formatPrice(item: YStockItem): string {
  if (!item.price) return ''
  const val = item.price.amount / Math.pow(10, item.price.precision)
  return `${val.toFixed(item.price.precision)} ${item.price.currency}`
}

function isLow(item: YStockItem): boolean {
  return item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold
}

export function StockList({ items = [], onItemClick, onAdjust }: Props) {
  const [search, setSearch] = useState('')
  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.category?.toLowerCase().includes(search.toLowerCase()) ?? false)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          style={{
            width: '100%', border: '1px solid var(--border, #d4cfc9)', borderRadius: 6,
            padding: '6px 10px', fontSize: 13, outline: 'none',
            background: 'var(--background, #f9f7f4)', boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Sin productos</div>
        ) : (
          filtered.map(item => (
            <div
              key={item.id}
              onClick={() => onItemClick?.(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderBottom: '1px solid var(--border, #d4cfc9)',
                cursor: onItemClick ? 'pointer' : 'default',
              }}
            >
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item.name}
                  {isLow(item) && (
                    <span style={{ fontSize: 10, color: '#e53935', fontWeight: 700 }}>LOW</span>
                  )}
                </div>
                {item.category && (
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)' }}>{item.category}</div>
                )}
              </div>
              <div style={{ fontSize: 12, color: isLow(item) ? '#e53935' : 'var(--foreground, #1a1a1a)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>
                {item.quantity} {item.unit}
              </div>
              {onAdjust && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={e => { e.stopPropagation(); onAdjust(item.id, -1) }}
                    style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border, #d4cfc9)', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                  >−</button>
                  <button
                    onClick={e => { e.stopPropagation(); onAdjust(item.id, 1) }}
                    style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border, #d4cfc9)', background: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                  >+</button>
                </div>
              )}
              {item.price && (
                <div style={{ fontSize: 12, color: 'var(--muted-foreground, #6b6560)', minWidth: 50, textAlign: 'right' }}>
                  {formatPrice(item)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
