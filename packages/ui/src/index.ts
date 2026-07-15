export { Button } from './Button.tsx'
export { Input } from './Input.tsx'
export { Card } from './Card.tsx'

// Mega input — bar widget with typed center field, edge action slots, panels
export { InputBar, ActionSlot, CenterField, OverflowMenu, useInputContext, InputProvider } from './input/index.ts'
export type { InputBarProps, InputContextValue, FieldType, FieldAction, FieldOption, PanelMode } from './input/index.ts'
export { BentoGrid, BentoCell, bentoSizeToCols } from './BentoGrid.tsx'
export type { BentoSize } from './BentoGrid.tsx'
export { ModuleShell } from './ModuleShell.tsx'
export { themeVars, defaultTheme } from './theme.ts'
export type { UiTheme } from './theme.ts'

// App shell
export { AppShell } from './AppShell.tsx'
export { Sidebar } from './Sidebar.tsx'
export type { SidebarItem } from './Sidebar.tsx'

// Absolute-positioned grid
export { GridCanvas } from './GridCanvas.tsx'
export { GridCell } from './GridCell.tsx'
export { CellMenu } from './CellMenu.tsx'
export type { CellMenuItem } from './CellMenu.tsx'
export { GridConfigPanel } from './GridConfigPanel.tsx'

// Hooks
export { useGridLayout } from './hooks/useGridLayout.ts'
export type { UseGridLayoutReturn } from './hooks/useGridLayout.ts'
export { useGridDrag, computeSnapPosition } from './hooks/useGridDrag.ts'
export type { DragState, UseGridDragReturn } from './hooks/useGridDrag.ts'

// Persistence
export { localStorageAdapter } from './persistence/localStorageAdapter.ts'

// Grid algorithm + relocation
export { OccupancyMap, SlotFinder, DisplacementPlanner, sizeSpan } from './grid/algorithm.ts'
export type { DragPlan, SearchBias } from './grid/algorithm.ts'
export { useGridRelocate } from './grid/relocate.ts'
export type { CellRenderProps, UseGridRelocateReturn } from './grid/relocate.ts'
