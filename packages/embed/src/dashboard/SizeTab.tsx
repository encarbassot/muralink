// Grid-native "Size" config tab. Writes cell.size directly (the layout re-derives
// placement from it). Not tied to any module method — always available in config.

import type { CellTab, CellTabProps } from '@muralink/shell'
import type { BentoSize } from '@muralink/ui'

function SizeTabBody({ cell, update, availableSizes }: CellTabProps & { availableSizes: BentoSize[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Tamaño
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {availableSizes.map((s) => {
          const selected = cell.size === s
          return (
            <button
              key={s}
              onClick={() => update({ size: s })}
              style={{
                padding: '5px 11px',
                borderRadius: 7,
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                background: selected ? 'var(--accent-dim, rgba(76,159,255,0.12))' : 'var(--bg)',
                color: selected ? 'var(--accent)' : 'var(--fg-dim)',
                fontSize: 11,
                fontWeight: selected ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function makeSizeTab(availableSizes: BentoSize[]): CellTab {
  return {
    id: 'size',
    label: 'Tamaño',
    icon: '⤢',
    render: (p) => <SizeTabBody {...p} availableSizes={availableSizes} />,
  }
}
