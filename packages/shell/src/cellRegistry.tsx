// Shared runtime cell registry. Maps a moduleId → { descriptor, render }.
// Both platforms (web, electron) build a registry, register their cell modules,
// and hand ShellApp a single renderCell driven by the registry. This replaces
// the per-platform hardcoded renderCell switch.
//
// Note: packages/core/ModuleRegistry is manifest/DAG-oriented (static views as
// string paths). This is its runtime React counterpart — it holds live render
// functions, not manifests.

import type { ReactNode } from 'react'
import type { GridCellRecord, BentoSize } from '@muralink/types'

export interface ModuleDescriptor {
  moduleId: string
  label: string
  icon: string
  description: string
  defaultSize: BentoSize
  availableSizes: BentoSize[]
  /** If true: only has a small icon representation, auto-wraps into a layout cell. */
  isIconOnly?: boolean
  /** If true: registered for rendering existing cells, but hidden from the add picker. */
  hiddenFromPicker?: boolean
}

/** Capabilities a platform exposes to its cells. Each cell uses what it needs. */
export interface CellContext {
  /** Open a registered app (electron) */
  openApp?: (appId: string) => void
  /** Open a module's full view as a modal overlay (web) */
  openModal?: (moduleId: string, instanceId?: string) => void
  /** Navigate into a sub-layout (recursive dashboards). */
  navigateTo?: (layoutId: string, title?: string) => void
  /** The layoutId of the grid currently being rendered — lets a cell derive child layout ids. */
  layoutId?: string
  /** Persist a patch to this cell's record (e.g. text content, sub-dashboard name). */
  updateCell?: (cellId: string, patch: Partial<GridCellRecord>) => void
  /** Open the full-screen text editor overlay for a text cell. */
  openTextEditor?: (cellId: string) => void
  /** Jump to the app drawer (electron) */
  goToDrawer?: () => void
}

// ── Widget methods + config tabs ──────────────────────────────────────────────
// A module declares "methods" (capabilities). The parent layout renders them in
// the header ⋯ menu; one is the default (view-mode click target). Some methods
// open a config "tab"; tabs are addressed by id and decoupled from menu items
// (N:M). Config values persist under cell.props, keyed by tab id.

/** Gates when a method surfaces as a ⋯ menu item. Omitted field = no gate. */
export interface CellMethodVisibility {
  /** Which mode shows the item. Default 'edit' (the menu is an edit affordance). */
  mode?: 'edit' | 'view' | 'both'
  /** Show only at spans >= one of these footprints (min-span, fractional-safe). */
  minSizes?: BentoSize[]
  /** Escape hatch over the parsed span for anything minSizes can't express. */
  match?: (span: { cols: number; rows: number }) => boolean
}

/** A config tab. Addressed by id; 0..N menu items may open it. */
export interface CellTab {
  id: string
  label: string
  icon?: string
  render: (props: CellTabProps) => ReactNode
}

export interface CellTabProps {
  cell: GridCellRecord
  ctx: CellContext
  /** Merge-safe write to cell.props[tab.id]. */
  setConfig: (value: unknown) => void
  /** Raw (still props-merge-safe) patch escape hatch. */
  update: (patch: Partial<GridCellRecord>) => void
  close: () => void
}

/** A capability a module declares. The parent layout renders/executes these. */
export interface CellMethod {
  id: string
  label: string
  icon?: string
  /** One method may be the module's default (view-mode click target). */
  isDefault?: boolean
  /** Eligible as an on-click binding target (shown in the On-click tab). Default true. */
  clickable?: boolean
  visibility?: CellMethodVisibility
  /** Immediate action when chosen from the ⋯ menu (no tab). */
  run?: (cell: GridCellRecord, ctx: CellContext) => void
  /** OR: choosing this item opens a config tab. May have both, or neither. */
  tab?: CellTab
}

/** Serializable on-click binding stored at cell.props.onClick. Absent = default. */
export type OnClickBinding =
  | { kind: 'method'; methodId: string }
  | { kind: 'openModal'; moduleId?: string }
  | { kind: 'navigate'; layoutId: string; title?: string }
  | { kind: 'url'; url: string }
  | { kind: 'none' }

export interface CellModule {
  descriptor: ModuleDescriptor
  render: (cell: GridCellRecord, ctx: CellContext, isDragging: boolean) => ReactNode
  /** Capabilities surfaced in the header ⋯ menu / on-click config. */
  methods?: CellMethod[]
  /** Standalone config tabs not tied to a method (always available in config). */
  tabs?: CellTab[]
}

function PlaceholderCell({ moduleId }: { moduleId: string }): ReactNode {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 6,
        color: 'var(--fg-faint)',
        fontSize: 11,
        background: 'var(--bg-elevated)',
        borderRadius: 10,
      }}
    >
      <span style={{ fontSize: 20, opacity: 0.5 }}>▢</span>
      <span>{moduleId}</span>
    </div>
  )
}

export class CellRegistry {
  private mods = new Map<string, CellModule>()

  register(m: CellModule): void {
    this.mods.set(m.descriptor.moduleId, m)
  }

  registerAll(ms: CellModule[]): void {
    for (const m of ms) this.register(m)
  }

  has(moduleId: string): boolean {
    return this.mods.has(moduleId)
  }

  getDescriptor(moduleId: string): ModuleDescriptor | undefined {
    return this.mods.get(moduleId)?.descriptor
  }

  getModule(moduleId: string): CellModule | undefined {
    return this.mods.get(moduleId)
  }

  getMethods(moduleId: string): CellMethod[] {
    return this.mods.get(moduleId)?.methods ?? []
  }

  getTabs(moduleId: string): CellTab[] {
    return this.mods.get(moduleId)?.tabs ?? []
  }

  /** The default on-click method: explicit isDefault, else the first clickable one. */
  getDefaultMethod(moduleId: string): CellMethod | undefined {
    const methods = this.getMethods(moduleId)
    return methods.find((m) => m.isDefault) ?? methods.find((m) => m.clickable !== false)
  }

  list(): ModuleDescriptor[] {
    return [...this.mods.values()].map((m) => m.descriptor)
  }

  render(cell: GridCellRecord, ctx: CellContext, isDragging: boolean): ReactNode {
    const mod = this.mods.get(cell.moduleId)
    if (!mod) return <PlaceholderCell moduleId={cell.moduleId} />
    return mod.render(cell, ctx, isDragging)
  }
}
