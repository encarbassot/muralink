// Run one user-defined function inside a fresh, hardened QuickJS context.
// Determinism contract enforced here:
//   - QuickJS is a separate VM: user code cannot reach the node/browser host at
//     all (no `process`, no `window`, no `require`) — isolation is structural.
//   - The two in-VM non-determinism sources, `Date` and `Math.random`, are
//     removed by a prelude so touching them throws.
//   - Only the declared inputs are marshalled in (as a JSON literal); only the
//     declared outputs are marshalled out. Numbers are normalized by the HOST
//     (caller), never trusted from the VM, so QuickJS↔V8 float edge cases can't
//     leak into persisted values.
//   - An interrupt deadline caps runaway loops.

import type { CellValue } from '../values.js'
import { err, isError } from '../values.js'
import { quickjs, isSandboxReady } from './runtime.js'

export interface UserFn {
  id: string
  name: string
  inputs: string[] // X named inputs
  outputs: string[] // Y named outputs
  source: string // e.g. `({a,b}) => ({ out: a*(1+b) })` — pure, deterministic
}

export interface RunLimits {
  /** Wall-clock ceiling (ms) for a single call — a backstop against infinite
   *  loops. Never affects a valid computation, so determinism is preserved. */
  wallMs: number
}

const DEFAULT_LIMITS: RunLimits = { wallMs: 250 }

// Strip the non-deterministic in-VM globals before running user code.
const HARDEN_PRELUDE = `
  Date = undefined;
  if (typeof Math !== 'undefined') {
    Math.random = function () { throw new Error('random is not deterministic'); };
  }
`

/** Marshal a CellValue into something safe to embed as a JSON literal. Errors
 *  and blanks become null (a rule/function reads them as "missing"). */
function toJsonable(v: CellValue): number | string | boolean | null {
  if (v === null || isError(v)) return null
  return v
}

/**
 * Execute `fn` with `args` (positional, mapped to `fn.inputs` names). Returns an
 * object keyed by `fn.outputs`. On any failure (not ready, throw, timeout,
 * missing output) the corresponding value is a CalcError.
 */
export function runUserFn(
  fn: UserFn,
  args: CellValue[],
  limits: RunLimits = DEFAULT_LIMITS,
): Record<string, CellValue> {
  const fail = (code: Parameters<typeof err>[0], msg: string): Record<string, CellValue> => {
    const out: Record<string, CellValue> = {}
    for (const name of fn.outputs) out[name] = err(code, msg)
    return out
  }

  if (!isSandboxReady()) return fail('NAME', 'sandbox not loaded (await preloadSandbox)')

  // Build the named-input object from positional args.
  const inputObj: Record<string, number | string | boolean | null> = {}
  fn.inputs.forEach((name, i) => {
    inputObj[name] = toJsonable(args[i] ?? null)
  })

  const ctx = quickjs().newContext()
  try {
    ctx.runtime.setInterruptHandler(shouldInterruptAfter(limits.wallMs))

    // Harden, then invoke: (SOURCE)(INPUTS). INPUTS is a JSON literal — valid JS.
    const code = `${HARDEN_PRELUDE}\n(${fn.source})(${JSON.stringify(inputObj)})`
    const result = ctx.evalCode(code)

    if (result.error) {
      const detail = ctx.dump(result.error)
      result.error.dispose()
      return fail('VALUE', typeof detail === 'object' && detail && 'message' in detail ? String((detail as { message: unknown }).message) : 'function error')
    }

    const raw = ctx.dump(result.value)
    result.value.dispose()

    // Map declared outputs out of the returned object; a scalar return maps to
    // the single declared output.
    const out: Record<string, CellValue> = {}
    if (fn.outputs.length === 1 && (typeof raw !== 'object' || raw === null)) {
      out[fn.outputs[0]!] = normalizeOut(raw)
    } else {
      const obj = (raw ?? {}) as Record<string, unknown>
      for (const name of fn.outputs) {
        out[name] = name in obj ? normalizeOut(obj[name]) : err('NAME', `missing output "${name}"`)
      }
    }
    return out
  } catch (e) {
    return fail('VALUE', e instanceof Error ? e.message : 'sandbox error')
  } finally {
    ctx.dispose()
  }
}

// QuickJS values dumped out are already JS primitives/objects; coerce to a
// CellValue, rejecting non-finite numbers and unsupported shapes.
function normalizeOut(v: unknown): CellValue {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : err('NUM', 'non-finite result')
  if (typeof v === 'boolean' || typeof v === 'string') return v
  return err('VALUE', 'unsupported function output type')
}

// Wall-clock interrupt: the host CAN read the clock (only user code inside the VM
// is forbidden to). Deterministic computations finish long before the deadline.
function shouldInterruptAfter(ms: number): () => boolean {
  const deadline = Date.now() + ms
  return () => Date.now() > deadline
}
