// Pinned-cell → Dock projection. The dashboard's dock is no longer static
// config: it's a pure function of which cells in the current GridLayoutConfig
// are pinned. A module can supply its own compact icon via
// CellModule.dockIcon; otherwise it falls back to the module's descriptor icon.

import type { ReactNode } from 'react'
import type { GridCellRecord } from '@muralink/types'
import type { CellContext, CellRegistry, DockItem } from '@muralink/shell'

export function pinnedDockItems(
  cells: GridCellRecord[],
  registry: CellRegistry,
  ctx: CellContext,
  focusedCellId?: string,
): DockItem[] {
  return cells
    .filter((cell) => cell.pinned)
    .map((cell): DockItem | null => {
      const mod = registry.getModule(cell.moduleId)
      if (!mod) return null
      const icon: ReactNode =
        mod.dockIcon?.(cell, ctx) ?? <span style={{ fontSize: 14, lineHeight: 1 }}>{mod.descriptor.icon}</span>
      return {
        type: 'button',
        id: cell.id,
        icon,
        label: mod.descriptor.label,
        onClick: () => ctx.focusCell?.(cell.id),
        active: cell.id === focusedCellId,
      }
    })
    .filter((item): item is DockItem => item !== null)
}
