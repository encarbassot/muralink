// ZoomPicker — slider for grid icon size. Shows at bottom center of grid view.

import { useNavigation } from '@/stores/navigationStore'

export function ZoomPicker() {
  const gridZoom = useNavigation((s) => s.gridZoom)
  const setGridZoom = useNavigation((s) => s.setGridZoom)

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-md border px-3 py-2 bg-opacity-90"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <button
        onClick={() => setGridZoom(gridZoom - 1)}
        disabled={gridZoom === 1}
        className="text-[11px] disabled:opacity-40"
        style={{ color: 'var(--fg-dim)' }}
      >
        −
      </button>

      <input
        type="range"
        min="1"
        max="10"
        value={gridZoom}
        onChange={(e) => setGridZoom(parseInt(e.target.value, 10))}
        className="w-24"
        style={{
          cursor: 'pointer',
          accentColor: 'var(--accent)',
        }}
      />

      <button
        onClick={() => setGridZoom(gridZoom + 1)}
        disabled={gridZoom === 10}
        className="text-[11px] disabled:opacity-40"
        style={{ color: 'var(--fg-dim)' }}
      >
        +
      </button>

      <span style={{ color: 'var(--fg-faint)', fontSize: 10, minWidth: 20 }}>
        {gridZoom}×
      </span>
    </div>
  )
}
