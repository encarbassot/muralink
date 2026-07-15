import type { GridLayoutConfig } from '@muralink/types'
import { Card } from './Card.js'
import { Input } from './Input.js'

type ConfigPatch = Partial<Pick<GridLayoutConfig, 'columns' | 'cellSize' | 'gap'>>

interface GridConfigPanelProps {
  config: GridLayoutConfig
  onChange: (patch: ConfigPatch) => void
  onClose?: () => void
}

export function GridConfigPanel({ config, onChange, onClose }: GridConfigPanelProps) {
  function handleNumber(
    key: keyof ConfigPatch,
    min: number,
    max: number,
    value: string,
  ) {
    const n = parseInt(value, 10)
    if (!Number.isNaN(n) && n >= min && n <= max) {
      onChange({ [key]: n })
    }
  }

  return (
    <Card
      padding={12}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 200 }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-fg)' }}>
          Grid settings
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted-fg)',
              fontSize: 14,
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      <Input
        label="Columns"
        type="number"
        min={1}
        max={12}
        defaultValue={config.columns}
        onBlur={(e) => handleNumber('columns', 1, 12, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleNumber('columns', 1, 12, e.currentTarget.value)
        }}
        style={{ width: '100%' }}
      />

      <Input
        label="Cell size (px)"
        type="number"
        min={80}
        max={400}
        step={10}
        defaultValue={config.cellSize}
        onBlur={(e) => handleNumber('cellSize', 80, 400, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleNumber('cellSize', 80, 400, e.currentTarget.value)
        }}
        style={{ width: '100%' }}
      />

      <Input
        label="Gap (px)"
        type="number"
        min={0}
        max={40}
        step={2}
        defaultValue={config.gap}
        onBlur={(e) => handleNumber('gap', 0, 40, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleNumber('gap', 0, 40, e.currentTarget.value)
        }}
        style={{ width: '100%' }}
      />
    </Card>
  )
}
