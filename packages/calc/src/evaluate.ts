// Tree-walking evaluator. Pure: every value comes from the injected EvalScope
// (cell lookups, globals, user functions, the builtin registry) — the evaluator
// itself touches no globals, no Date, no random. Errors are values and
// propagate; they are never thrown to the caller.

import type { Expr } from './ast.js'
import { type CellValue, type CalcError, err, isError, toNumber, toBoolean, toText } from './values.js'
import type { FnRegistry } from './functions.js'
import { SPECIAL_FORMS } from './functions.js'
import { expandRange } from './refs.js'

export interface EvalScope {
  /** Resolve a single cell's current value ('A1'). Blank → null. */
  cell: (ref: string) => CellValue
  /** Resolve a global variable's value. Unknown → #NAME error. */
  global: (name: string) => CellValue
  /** Invoke a user-defined (sandboxed) function by name. Unknown → #NAME. */
  callUser: (name: string, args: CellValue[]) => CellValue
  /** Built-in function registry. */
  fns: FnRegistry
}

export function evaluate(expr: Expr, scope: EvalScope): CellValue {
  switch (expr.t) {
    case 'num':
      return expr.v
    case 'str':
      return expr.v
    case 'bool':
      return expr.v
    case 'ref':
      return scope.cell(expr.ref)
    case 'global':
      return scope.global(expr.name)
    case 'range':
      // A bare range in scalar position collapses to its first cell; aggregate
      // functions receive the flattened list via evalArgs instead.
      return scope.cell(expr.from)
    case 'unary':
      return evalUnary(expr.op, evaluate(expr.x, scope))
    case 'binary':
      return evalBinary(expr.op, evaluate(expr.l, scope), evaluate(expr.r, scope))
    case 'call':
      return evalCall(expr.name, expr.args, scope)
  }
}

// Flatten call arguments; a range expands to all its cells (for SUM/MIN/…).
function evalArgs(args: Expr[], scope: EvalScope): CellValue[] {
  const out: CellValue[] = []
  for (const a of args) {
    if (a.t === 'range') {
      for (const id of expandRange(a.from, a.to)) out.push(scope.cell(id))
    } else {
      out.push(evaluate(a, scope))
    }
  }
  return out
}

function evalCall(name: string, args: Expr[], scope: EvalScope): CellValue {
  // ── Lazy special forms — evaluate branches only as needed ──────────────────
  if (SPECIAL_FORMS.has(name)) {
    switch (name) {
      case 'IF': {
        const cond = toBoolean(evaluate(args[0]!, scope))
        if (isError(cond)) return cond
        const branch = cond ? args[1] : args[2]
        return branch ? evaluate(branch, scope) : false
      }
      case 'NOT': {
        const b = toBoolean(evaluate(args[0]!, scope))
        return isError(b) ? b : !b
      }
      case 'AND': {
        for (const a of args) {
          const b = toBoolean(evaluate(a, scope))
          if (isError(b)) return b
          if (!b) return false
        }
        return true
      }
      case 'OR': {
        for (const a of args) {
          const b = toBoolean(evaluate(a, scope))
          if (isError(b)) return b
          if (b) return true
        }
        return false
      }
      case 'IFERROR': {
        const v = evaluate(args[0]!, scope)
        return isError(v) ? (args[1] ? evaluate(args[1], scope) : null) : v
      }
    }
  }

  // ── Eager: builtins, then user-defined functions ───────────────────────────
  const values = evalArgs(args, scope)
  const builtin = scope.fns[name]
  if (builtin) return builtin(values)
  return scope.callUser(name, values)
}

function evalUnary(op: '-' | '+' | 'not', x: CellValue): CellValue {
  if (isError(x)) return x
  if (op === 'not') {
    const b = toBoolean(x)
    return isError(b) ? b : !b
  }
  const n = toNumber(x)
  if (isError(n)) return n
  return op === '-' ? -n : n
}

function evalBinary(op: string, l: CellValue, r: CellValue): CellValue {
  if (isError(l)) return l
  if (isError(r)) return r

  // Comparisons — numeric when both coerce to numbers, else textual.
  if (op === '=' || op === '<>' || op === '<' || op === '<=' || op === '>' || op === '>=') {
    return compare(op, l, r)
  }

  const a = toNumber(l)
  if (isError(a)) return a
  const b = toNumber(r)
  if (isError(b)) return b
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? err('DIV0', 'Division by zero') : a / b
    case '^': return powOf(a, b)
    default: return err('VALUE', `Unknown operator "${op}"`)
  }
}

function powOf(a: number, b: number): CellValue {
  const v = Math.pow(a, b)
  return Number.isFinite(v) ? v : err('NUM', 'Result is not a finite number')
}

function compare(op: string, l: CellValue, r: CellValue): CellValue {
  const ln = toNumber(l)
  const rn = toNumber(r)
  let cmp: number
  if (!isError(ln) && !isError(rn)) {
    cmp = ln === rn ? 0 : ln < rn ? -1 : 1
  } else {
    const ls = toText(l)
    const rs = toText(r)
    cmp = ls === rs ? 0 : ls < rs ? -1 : 1
  }
  switch (op) {
    case '=': return cmp === 0
    case '<>': return cmp !== 0
    case '<': return cmp < 0
    case '<=': return cmp <= 0
    case '>': return cmp > 0
    case '>=': return cmp >= 0
    default: return err('VALUE', `Unknown comparison "${op}"`)
  }
}

/** Convenience: value → CalcError guard re-export for the engine. */
export function asError(v: CellValue): CalcError | null {
  return isError(v) ? v : null
}
