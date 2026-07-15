// Module contracts — the interface between a module and any platform that runs it.
// A module declares WHAT it can show and at WHICH sizes. The platform decides
// WHERE and HOW. A module never knows where it will be rendered.

/** Where a module can run. A module declares capability; an implementation realizes it. */
export type Platform = 'web' | 'extension' | 'mobile' | 'local-server' | 'electron'

/** Preset bento sizes a view advertises in menus (add-element picker, defaults). */
export type BentoSize = '1x1' | '1x2' | '2x1' | '2x2' | '2x3' | '3x2' | '3x3'

/** Actual geometry a placed cell can hold. Spans snap to 0.5-cell steps, so a
 *  cell may be 1.5×2, 2.5×1.5, etc. The preset BentoSize values are a subset. */
export type GridSize = `${number}x${number}`

/** A renderable widget the module exposes. The platform renders it without
 *  knowing what's inside. */
export interface ViewSpec {
  id: string
  platforms: Platform[]
  sizes: BentoSize[] // which grid sizes this view supports
  component: string // path to the implementation component
}

/** Every module exports a `manifest` conforming to this. Dependencies are
 *  resolved at build time from this static declaration — never at runtime
 *  from a remote server. */
export interface ModuleManifest {
  id: string // e.g. "contacts", "expenses"
  version: string // semver
  dependencies: string[] // other module ids — forms a DAG, no cycles
  types: string[] // type ids this module exposes, e.g. ["YUrl"]
  views: ViewSpec[] // renderable widgets
  interceptorScripts?: string[] // e.g. ["sendWhatsApp", "readNotionPage"]
  platforms: Platform[] // where this module can run
}

/** Runtime handle a platform supplies to a view when it renders.
 *  PROVISIONAL: CLAUDE.md does not pin this shape yet. Storage is left as an
 *  opaque handle so each platform can back it with IndexedDB / fs / git-DB.
 *  Any AI-capable code path must read `aiProvider` — never hardcode. */
export interface ModuleContext {
  platform: Platform
  storage: ModuleStorage
  aiProvider: 'platform' | 'ollama' | 'none'
}

/** Minimal storage surface a module can rely on, offline-first. The concrete
 *  backing (IndexedDB in browser, git-DB on the server) is the platform's call. */
export interface ModuleStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<string[]>
}

/** Each platform implements this to turn a ViewSpec into something on screen.
 *  Kept here (not in core) so platforms can depend on types alone. The React
 *  return type is intentionally `unknown` — types stays framework-free. */
export interface ViewRenderer {
  render(spec: ViewSpec, size: BentoSize, context: ModuleContext): unknown
}

/** Props every module Output component must accept. One Output.tsx per module
 *  handles all sizes internally (may delegate to size-specific sub-components). */
export interface ModuleOutputProps {
  size: BentoSize
  zoom?: number
  aspectRatio?: string
  context: ModuleContext
  instanceId: string
}
