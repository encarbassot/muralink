// Built-in function library. Every builtin is a pure `(args) => CellValue` with
// NO access to Date, Math.random, Intl, or any global — determinism by
// construction. Functions that must short-circuit or trap errors (IF, AND, OR,
// NOT, IFERROR) are NOT here; the evaluator handles them as lazy special forms
// so their branches aren't eagerly evaluated. Range args arrive pre-flattened.

import { type CellValue, type CalcError, err, isError, isBlank, toNumber, toText, toBoolean } from './values.js'

export type BuiltinFn = (args: CellValue[]) => CellValue

/** Set of names the evaluator treats as lazy special forms (handled in
 *  evaluate.ts, never dispatched to this registry). */
export const SPECIAL_FORMS = new Set(['IF', 'AND', 'OR', 'NOT', 'IFERROR'])

// Reduce numeric args, propagating the first error. Blanks are skipped for
// aggregates (SUM ignores blanks, like Excel).
function nums(args: CellValue[]): number[] | CalcError {
  const out: number[] = []
  for (const a of args) {
    if (isBlank(a)) continue
    const n = toNumber(a)
    if (isError(n)) return n
    out.push(n)
  }
  return out
}

export const BUILTINS: Record<string, BuiltinFn> = {
  ISBLANK: (a) => isBlank(a[0] ?? null),
  ISERROR: (a) => isError(a[0] ?? null),
  ISNUMBER: (a) => typeof (a[0] ?? null) === 'number',

  SUM: (a) => {
    const ns = nums(a)
    return Array.isArray(ns) ? ns.reduce((s, n) => s + n, 0) : ns
  },
  MIN: (a) => {
    const ns = nums(a)
    if (!Array.isArray(ns)) return ns
    return ns.length ? Math.min(...ns) : 0
  },
  MAX: (a) => {
    const ns = nums(a)
    if (!Array.isArray(ns)) return ns
    return ns.length ? Math.max(...ns) : 0
  },
  AVERAGE: (a) => {
    const ns = nums(a)
    if (!Array.isArray(ns)) return ns
    return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : err('DIV0', 'AVERAGE of no values')
  },

  ABS: (a) => unaryNum(a, Math.abs),
  FLOOR: (a) => unaryNum(a, Math.floor),
  CEILING: (a) => unaryNum(a, Math.ceil),
  ROUND: (a) => {
    const n = toNumber(a[0] ?? null)
    if (isError(n)) return n
    const d = toNumber(a[1] ?? 0)
    if (isError(d)) return d
    const f = Math.pow(10, Math.trunc(d))
    return Math.round(n * f) / f
  },
  MOD: (a) => {
    const n = toNumber(a[0] ?? null)
    if (isError(n)) return n
    const d = toNumber(a[1] ?? null)
    if (isError(d)) return d
    if (d === 0) return err('DIV0', 'MOD by zero')
    return n - d * Math.floor(n / d)
  },

  LEN: (a) => toText(a[0] ?? null).length,
  CONCAT: (a) => a.map(toText).join(''),
  CONCATENATE: (a) => a.map(toText).join(''),

  // TRUE()/FALSE() as callable forms, plus a NUMBER-coercing VALUE.
  TRUE: () => true,
  FALSE: () => false,
  VALUE: (a) => toNumber(a[0] ?? null),

  MIN0: (a) => {
    // clamp-to-zero helper used by pricing; MAX(0, x)
    const n = toNumber(a[0] ?? null)
    return isError(n) ? n : Math.max(0, n)
  },
}

function unaryNum(args: CellValue[], fn: (n: number) => number): CellValue {
  const n = toNumber(args[0] ?? null)
  return isError(n) ? n : fn(n)
}

export type FnRegistry = Record<string, BuiltinFn>

/** The default registry. A sheet may extend it with user-defined functions
 *  (resolved through the sandbox) — those are dispatched separately by the
 *  engine, not merged here, so builtins stay a pure, auditable set. */
export function defaultRegistry(): FnRegistry {
  return { ...BUILTINS }
}

// Re-export for the evaluator's logical coercion of IF/AND/OR conditions.
export { toBoolean }
