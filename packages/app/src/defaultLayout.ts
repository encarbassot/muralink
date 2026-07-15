import type { GridLayoutConfig } from '@muralink/types'

export const WEB_LAYOUT_ID = 'web-dashboard'

// The main dashboard opens empty. The user builds it up by adding elements
// (module cells, text, sub-dashboards). 6-column grid like electron.
export const defaultLayout: GridLayoutConfig = {
  layoutId: WEB_LAYOUT_ID,
  platform: 'web',
  columns: 6,
  cellSize: 160,
  gap: 12,
  cells: [],
}
