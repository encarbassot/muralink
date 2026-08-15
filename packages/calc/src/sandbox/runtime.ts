// QuickJS runtime loader. The wasm module is loaded ONCE (async) and cached; all
// per-call contexts are then created synchronously so they slot into the engine's
// synchronous recompute. A sheet with no user-defined functions never calls
// `preloadSandbox`, so pure-formula sheets (including phase-1 pricing) never pay
// the wasm download/parse cost.

import { getQuickJS, getQuickJSSync, type QuickJSWASMModule } from 'quickjs-emscripten'

let loaded: QuickJSWASMModule | null = null
let loading: Promise<QuickJSWASMModule> | null = null

/** Load and cache the QuickJS wasm module. Call once (await) before any sheet
 *  with code boxes recomputes. Idempotent. */
export async function preloadSandbox(): Promise<void> {
  if (loaded) return
  if (!loading) loading = getQuickJS()
  loaded = await loading
}

/** True once `preloadSandbox` has resolved — the engine checks this before
 *  attempting a synchronous user-function call. */
export function isSandboxReady(): boolean {
  if (loaded) return true
  // getQuickJSSync throws if the async load hasn't resolved; treat that as "not ready".
  try {
    loaded = getQuickJSSync()
    return true
  } catch {
    return false
  }
}

/** Synchronous access to the loaded module. Throws if not preloaded. */
export function quickjs(): QuickJSWASMModule {
  if (loaded) return loaded
  loaded = getQuickJSSync() // throws if preloadSandbox hasn't resolved
  return loaded
}
