export { Button } from './Button.tsx'
export { Input } from './Input.tsx'
export { Card } from './Card.tsx'

// Mega input — bar widget with typed center field, edge action slots, panels
export { InputBar, ActionSlot, CenterField, OverflowMenu, useInputContext, InputProvider } from './input/index.ts'
export type { InputBarProps, InputContextValue, FieldType, FieldAction, FieldOption, PanelMode } from './input/index.ts'
export { BentoGrid, BentoCell, bentoSizeToCols } from './BentoGrid.tsx'
export type { BentoSize } from './BentoGrid.tsx'
export { PillBar } from './PillBar.tsx'

export { RoundCheck } from './RoundCheck.tsx'
export type { RoundCheckProps } from './RoundCheck.tsx'
export type { PillBarProps, PillGroupSpec, PillOption } from './PillBar.tsx'
export { CodeEditor } from './code/CodeEditor.tsx'
export type { CodeEditorProps } from './code/CodeEditor.tsx'
export { ModuleShell } from './ModuleShell.tsx'
export { themeVars, defaultTheme } from './theme.ts'
export type { UiTheme } from './theme.ts'

// Block document model (vertical array of typed elements; markdown as shortcuts)
export { BlockEditor } from './blocks/BlockEditor.tsx'
export { BlockList } from './blocks/BlockList.tsx'
export { newBlock, applyMarkdownShortcut } from './blocks/blocks.ts'
export type { ShortcutResult } from './blocks/blocks.ts'

// Instance panel — a record as a list of typed facets; the host injects its primary section
export { BottomSheet } from './instance/BottomSheet.tsx'
export type { BottomSheetProps } from './instance/BottomSheet.tsx'
export { InstancePanel } from './instance/InstancePanel.tsx'
export type { InstancePanelProps } from './instance/InstancePanel.tsx'
export { FacetSection, FACET_LABELS } from './instance/FacetSection.tsx'
export type { FacetSectionProps } from './instance/FacetSection.tsx'
export { ModuleCard } from './instance/ModuleCard.tsx'
export type { ModuleCardProps, ModuleCardAction } from './instance/ModuleCard.tsx'
export { TodoSection } from './instance/TodoSection.tsx'
export type { FacetBlocksProps } from './instance/TodoSection.tsx'
export { NoteSection } from './instance/NoteSection.tsx'
export { AddFacetGrid } from './instance/AddFacetGrid.tsx'
export type { AddFacetGridProps } from './instance/AddFacetGrid.tsx'
export { newFacet, blocksToFacets, facetsToBlocks, toggleBlockInFacets } from './instance/facets.ts'

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
export { makeCloudLayoutAdapter } from './persistence/cloudLayoutAdapter.ts'
export type { CloudLayoutAdapterConfig } from './persistence/cloudLayoutAdapter.ts'
export { makeVaultSync } from './persistence/vaultSync.ts'
export type { VaultSync, VaultSyncConfig } from './persistence/vaultSync.ts'

// Grid algorithm + relocation
export { OccupancyMap, SlotFinder, DisplacementPlanner, sizeSpan, snap05, STEP } from './grid/algorithm.ts'
export type { DragPlan, SearchBias } from './grid/algorithm.ts'
export { useGridRelocate } from './grid/relocate.ts'
export type { CellRenderProps, UseGridRelocateReturn } from './grid/relocate.ts'
// Automatic window-manager layer (auto-order, reflow, elastic sizing)
export {
  autoPack,
  insertCell,
  removeCell as removeCellFrom,
  resizeCell as resizeCellIn,
  effectiveConstraints,
  constrainedSize,
  defaultSizeFor,
} from './grid/autolayout.ts'
export type { ConstraintResolver } from './grid/autolayout.ts'

// Action system atoms (square buttons, edge rows, edge panels)
export {
  ActionButton,
  ActionRow,
  EdgePanel,
  ActionSurfaceContext,
  ActionRowContext,
  ActionDepthContext,
  useActionSurface,
  useActionSurfaceController,
  ActionFlyout,
  ACTION_SIZE_PX,
} from './actions/index.ts'
export type {
  ActionSize,
  ActionEdge,
  ActionChildContext,
  ActionButtonProps,
  ActionRowProps,
  EdgePanelProps,
  ActionSurfaceController,
} from './actions/index.ts'
