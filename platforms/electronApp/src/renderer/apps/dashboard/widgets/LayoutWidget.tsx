import type { BentoSize } from '@muralink/ui'
import type { GridCellRecord } from '@muralink/types'

interface LayoutWidgetProps {
  layoutId: string
  label?: string
  icon?: string
  size: BentoSize
  childCells?: GridCellRecord[]
  onClick?: () => void
}

function MiniIcon({ cell, slotSize }: { cell: GridCellRecord; slotSize: number }) {
  const iconMap: Record<string, string> = {
    clock: '🕐',
    welcome: '👋',
    'app-link': '⊞',
    notes: '📝',
    calendar: '📅',
    weather: '⛅',
    layout: '📂',
  }

  const icon = iconMap[cell.moduleId] ?? '⬜'

  return (
    <div
      style={{
        width: slotSize,
        height: slotSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        fontSize: slotSize * 0.45,
        lineHeight: 1,
        flexShrink: 0,
      }}
      title={cell.moduleId}
    >
      {icon}
    </div>
  )
}

export function LayoutWidget({ layoutId: _layoutId, label, icon, size, childCells = [], onClick }: LayoutWidgetProps) {
  const [cols, rows] = size.split('x').map(Number) as [number, number]
  const isSmall = cols === 1 && rows === 1

  const firstFour = childCells.slice(0, 4)
  const slotSize = isSmall ? 16 : Math.min(36, 52)

  return (
    <div
      onClick={onClick}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        cursor: onClick ? 'pointer' : 'default',
        padding: 8,
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      {/* Mini 2x2 icon grid showing first 4 children */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: isSmall ? 2 : 4,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => {
          const cell = firstFour[i]
          return cell ? (
            <MiniIcon key={cell.id} cell={cell} slotSize={slotSize} />
          ) : (
            <div
              key={i}
              style={{
                width: slotSize,
                height: slotSize,
                borderRadius: 4,
                border: '1px dashed rgba(255,255,255,0.12)',
                flexShrink: 0,
              }}
            />
          )
        })}
      </div>

      {!isSmall && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--fg-dim)',
            fontWeight: 500,
          }}
        >
          {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
          <span>{label ?? 'Folder'}</span>
          {childCells.length > 0 && (
            <span style={{ color: 'var(--fg-faint)', fontSize: 10 }}>
              · {childCells.length}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
