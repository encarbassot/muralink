// @muralink/calc/sandbox — the deterministic JS sandbox for user-defined
// functions, kept in a separate entry so importing the core engine never pulls
// the QuickJS wasm. A sheet wires its functions into the engine via
// `makeUserFnCaller`, passed as `EngineConfig.callUser`.

import type { CellValue } from '../values.js'
import { err } from '../values.js'
import type { UserFnCaller } from '../engine.js'
import { runUserFn, type UserFn, type RunLimits } from './runUserFn.js'

export { preloadSandbox, isSandboxReady } from './runtime.js'
export { runUserFn, type UserFn, type RunLimits } from './runUserFn.js'

/**
 * Build a `UserFnCaller` (the engine's `callUser`) over a set of user functions.
 * A formula call `MARKUP(cost,pct)` runs the matching function and yields its
 * first declared output as a scalar CellValue. Names match case-insensitively
 * (the engine upper-cases call names). Multi-output functions are consumed
 * directly by the block/rule layer via `runUserFn`, not through formulas.
 */
export function makeUserFnCaller(fns: UserFn[], limits?: RunLimits): UserFnCaller {
  const byName = new Map<string, UserFn>()
  for (const fn of fns) byName.set(fn.name.toUpperCase(), fn)

  return (name: string, args: CellValue[]): CellValue => {
    const fn = byName.get(name.toUpperCase())
    if (!fn) return err('NAME', `Unknown function "${name}"`)
    const out = runUserFn(fn, args, limits)
    const first = fn.outputs[0]
    return first ? out[first] ?? null : null
  }
}
