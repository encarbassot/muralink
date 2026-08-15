// Compact block renderer for read contexts — calendar event spans, cards.
// Checkboxes stay interactive when `onToggle` is given; toggling stops
// propagation so ticking an item inside a clickable span doesn't open it.

import type React from 'react'
import type { YBlock } from '@muralink/types'

const headingSize: Record<number, number> = { 1: 1.25, 2: 1.1, 3: 1 }

export function BlockList({
  blocks,
  onToggle,
  compact = false,
}: {
  blocks: YBlock[]
  onToggle?: (blockId: string, checked: boolean) => void
  compact?: boolean
}) {
  const base = compact ? 11 : 14
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 1 : 4 }}>
      {blocks.map((b) => {
        if (b.type === 'checkbox') {
          return (
            <label
              key={b.id}
              onClick={stop}
              onPointerDown={stop}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: compact ? 4 : 6,
                fontSize: base,
                lineHeight: 1.3,
                cursor: onToggle ? 'pointer' : 'default',
              }}
            >
              <input
                type="checkbox"
                checked={!!b.checked}
                disabled={!onToggle}
                onChange={(e) => onToggle?.(b.id, e.target.checked)}
                style={{ margin: 0, flexShrink: 0, width: compact ? 11 : 14, height: compact ? 11 : 14 }}
              />
              <span
                style={{
                  textDecoration: b.checked ? 'line-through' : 'none',
                  opacity: b.checked ? 0.55 : 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {b.text}
              </span>
            </label>
          )
        }
        if (b.type === 'heading') {
          return (
            <div
              key={b.id}
              style={{
                fontSize: base * (headingSize[b.level ?? 1] ?? 1),
                fontWeight: 700,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {b.text}
            </div>
          )
        }
        return (
          <div
            key={b.id}
            style={{
              fontSize: base,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {b.text}
          </div>
        )
      })}
    </div>
  )
}
