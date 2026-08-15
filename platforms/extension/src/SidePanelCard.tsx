// Host wrapper for one temporary card ("active app"). Owns the relative
// positioning the focus surfaces dock into: when the card is focused, it reads
// the module's declared focusSurfaces and wraps each one in an ActionRow or
// EdgePanel at the matching edge.

import type { CellContext, CellRegistry } from '@muralink/shell'
import { ActionRow, EdgePanel } from '@muralink/ui'
import type { GridCellRecord } from '@muralink/types'

export function SidePanelCard({ cell, registry, ctx, focused, onFocus, onClose }: {
  cell: GridCellRecord
  registry: CellRegistry
  ctx: CellContext
  focused: boolean
  onFocus: () => void
  onClose: () => void
}) {
  const descriptor = registry.getDescriptor(cell.moduleId)
  const surfaces = focused ? registry.getFocusSurfaces(cell.moduleId) : []

  return (
    <div
      onPointerDown={onFocus}
      style={{
        position: 'relative',
        borderRadius: 14,
        border: `1px solid ${focused ? 'var(--accent, #6366f1)' : 'var(--border, #262c34)'}`,
        background: 'var(--bg-elevated, #14171b)',
        boxShadow: focused ? '0 0 0 2px color-mix(in srgb, var(--accent, #6366f1) 30%, transparent)' : undefined,
        overflow: 'visible',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Mini header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 0' }}>
        <span style={{ fontSize: 11, color: 'var(--fg-faint, #6b7280)', flex: 1 }}>
          {descriptor?.icon} {descriptor?.label ?? cell.moduleId}
        </span>
        <button
          title="Cerrar"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--fg-faint, #6b7280)',
            cursor: 'pointer',
            fontSize: 12,
            padding: 2,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Card body — the actual module component. */}
      <div style={{ height: 190, minHeight: 0, padding: 8 }}>
        {registry.render(cell, ctx, false)}
      </div>

      {/* Declared focus surfaces, docked at their edges. */}
      {surfaces.map((s) =>
        s.kind === 'actions' ? (
          <div
            key={s.id}
            style={{
              position: 'absolute',
              zIndex: 15,
              ...(s.edge === 'bottom' && { bottom: -20, left: '50%', transform: 'translateX(-50%)' }),
              ...(s.edge === 'top' && { top: -20, left: '50%', transform: 'translateX(-50%)' }),
              ...(s.edge === 'left' && { left: -20, top: '50%', transform: 'translateY(-50%)' }),
              ...(s.edge === 'right' && { right: -20, top: '50%', transform: 'translateY(-50%)' }),
              background: 'var(--bg-elevated, #1b2026)',
              border: '1px solid var(--border, #262c34)',
              borderRadius: 12,
              boxShadow: 'var(--shadow, 0 6px 24px rgba(0,0,0,0.4))',
            }}
          >
            <ActionRow edge={s.edge} focused contextView={`${cell.moduleId} focus`}>
              {s.render(cell, ctx)}
            </ActionRow>
          </div>
        ) : (
          <EdgePanel key={s.id} edge={s.edge} open={s.autoOpen !== false}>
            {s.render(cell, ctx)}
          </EdgePanel>
        ),
      )}
    </div>
  )
}
