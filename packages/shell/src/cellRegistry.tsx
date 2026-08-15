// Shared runtime cell registry. Maps a moduleId → { descriptor, render }.
// Both platforms (web, electron) build a registry, register their cell modules,
// and hand ShellApp a single renderCell driven by the registry. This replaces
// the per-platform hardcoded renderCell switch.
//
// Note: packages/core/ModuleRegistry is manifest/DAG-oriented (static views as
// string paths). This is its runtime React counterpart — it holds live render
// functions, not manifests.

import type { ReactNode } from 'react'
import type { GridCellRecord, BentoSize, LayoutConstraints } from '@muralink/types'

/** One selectable flavor of a module at add time (Android-widget-picker style).
 *  Picking a variant seeds the new cell's props — the module's render dispatches
 *  on them. Absent/empty variants = the module adds directly, as before. */
export interface ModuleVariant {
  id: string
  label: string
  icon: string
  description?: string
  /** Seed for the new cell's props (e.g. { view: 'board' }). */
  defaultProps?: Record<string, unknown>
  /** Overrides the descriptor's defaultSize for this variant. */
  defaultSize?: BentoSize
}

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
  /** Add-time flavors. When present, the add picker asks which one to place. */
  variants?: ModuleVariant[]
  /** Window-manager layout intent (min/max/preferred/aspect/orientation/priority/grow).
   *  Consumed by auto layout; ignored in freeform. Absent = grid decides. */
  constraints?: LayoutConstraints
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
  /** Scroll a cell into view and focus it — the Dock's pinned-icon click target. */
  focusCell?: (cellId: string) => void
  /** Jump to the app drawer (electron) */
  goToDrawer?: () => void
  /**
   * Focus/outfocus: true only for the single focused cell. Widgets render
   * interactive when focused and a read-only variant when not. Undefined in
   * hosts that don't use the focus model (treated as interactive/legacy).
   */
  focused?: boolean
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

// ── Focus surfaces ────────────────────────────────────────────────────────────
// A module can declare edge surfaces for FOCUS mode: rows of square action
// buttons and/or panels that emerge parallel to the card's edges. The HOST
// wraps what `render` returns — kind 'actions' in an ActionRow, kind 'panel'
// in an EdgePanel (both from @muralink/ui) — docked at `edge`. Hosts that
// don't use the focus model simply never read this field.

export type SurfaceEdge = 'top' | 'bottom' | 'left' | 'right'

/** An edge surface a module declares for focus mode. */
export interface FocusSurface {
  id: string
  edge: SurfaceEdge
  kind: 'actions' | 'panel'
  /** For 'panel': open as soon as the cell is focused. Default true. */
  autoOpen?: boolean
  render: (cell: GridCellRecord, ctx: CellContext) => ReactNode
  /** Reuses the method gating (minSizes etc.). Omitted = always. */
  visibility?: CellMethodVisibility
}

export interface CellModule {
  descriptor: ModuleDescriptor
  render: (cell: GridCellRecord, ctx: CellContext, isDragging: boolean) => ReactNode
  /** Capabilities surfaced in the header ⋯ menu / on-click config. */
  methods?: CellMethod[]
  /** Standalone config tabs not tied to a method (always available in config). */
  tabs?: CellTab[]
  /** Edge surfaces shown when the cell is focused (ActionRows / EdgePanels). */
  focusSurfaces?: FocusSurface[]
  /** Custom Dock representation for a pinned cell (rendered inside an `ActionButton`
   *  size 's'). Unrelated to `focusSurfaces` — this replaces the icon shown while
   *  UNFOCUSED and tiny in the Dock, not a decoration on a focused full-size cell.
   *  Falls back to `descriptor.icon` when absent. */
  dockIcon?: (cell: GridCellRecord, ctx: CellContext) => ReactNode
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

  /** Module-level layout constraints for a cell (for the auto layout resolver). */
  getConstraints(moduleId: string): LayoutConstraints | undefined {
    return this.mods.get(moduleId)?.descriptor.constraints
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

  getFocusSurfaces(moduleId: string): FocusSurface[] {
    return this.mods.get(moduleId)?.focusSurfaces ?? []
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
