import type { GridSize, Platform } from './module.js'

/** Position in fractional grid units. Non-integer when free-placed. */
export interface GridCellPosition {
  col: number
  row: number
}

/** One placed cell in the layout. */
export interface GridCellRecord {
  id: string
  viewSpecId: string
  moduleId: string
  position: GridCellPosition
  size: GridSize
  instanceId?: string
  /** Per-cell content. e.g. text cell → props.text, sub-dashboard cell → props.name. */
  props?: Record<string, unknown>
}

/** Persisted layout document for one platform surface. */
export interface GridLayoutConfig {
  layoutId: string
  platform: Platform
  columns: number
  cellSize: number
  gap: number
  cells: GridCellRecord[]
}

/** Adapter slot for persistence. localStorage shim ships in @muralink/ui. */
export interface GridPersistenceAdapter {
  load(layoutId: string): Promise<GridLayoutConfig | null>
  save(config: GridLayoutConfig): Promise<void>
}
