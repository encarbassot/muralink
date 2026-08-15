// Rule evaluation. A blocks-mode rule is interpreted directly on the HOST by a
// pure, deterministic walker (no sandbox, no wasm) — the block AST is our own
// structure. Only a rule the user flipped to code-mode runs its hand-edited
// source in the QuickJS sandbox. Determinism: no Date/random here; the current
// date is `ctx.now` (caller-supplied), mirroring how calendar recurrence takes
// an explicit clock instead of reading it.

import { type CellValue, isError, toNumber, toText } from '../values.js'
import type { RuleBlock, ValueBlock, CheckBlock, ActionBlock, BlockInstanceRef } from './schema.js'

export interface RuleContext {
  /** Named values a rule reads: buyer ref, quantity, base price, startDate… */
  inputs: Record<string, CellValue>
  /** The dragged-in instance a value block points at (list refs, buyer ref). */
  refs: Record<string, BlockInstanceRef>
  /** Host-resolved membership: is `ref` a member of virtual list `listId`?
   *  Precomputed on the host so the sandbox/interpreter never touches storage. */
  isMember: (listId: string, ref: BlockInstanceRef) => boolean
  /** Current date, ISO (caller-supplied — never Date.now()). */
  now: string
}

/** The effect a rule contributes to a price: a multiplicative factor plus any
 *  named outputs it set. The pricing folder multiplies base by all factors. */
export interface RuleResult {
  applied: boolean
  factor: number
  outputs: Record<string, CellValue>
}

export function evalRule(rule: RuleBlock, ctx: RuleContext): RuleResult {
  const result: RuleResult = { applied: false, factor: 1, outputs: {} }

  // All `when` checks must pass (empty = always).
  for (const check of rule.when) {
    if (!evalCheck(check, ctx)) return result
  }
  result.applied = true

  for (const action of rule.then) applyAction(action, ctx, result)
  return result
}

function evalValue(v: ValueBlock, ctx: RuleContext): CellValue {
  switch (v.t) {
    case 'literal':
      return v.v
    case 'input':
      return ctx.inputs[v.name] ?? null
    case 'global':
      // Globals are resolved by the engine; a rule reads them via inputs mirror.
      return ctx.inputs[v.name] ?? null
    case 'listRef':
      // A list ref evaluates to a stable string id (for use as a list handle).
      return `${v.ref.type}:${v.ref.id}`
  }
}

function refOf(v: ValueBlock, ctx: RuleContext): BlockInstanceRef | null {
  if (v.t === 'listRef') return v.ref
  if (v.t === 'input' && ctx.refs[v.name]) return ctx.refs[v.name]!
  return null
}

function evalCheck(c: CheckBlock, ctx: RuleContext): boolean {
  switch (c.t) {
    case 'isMember': {
      const who = refOf(c.who, ctx)
      const list = c.list.t === 'listRef' ? c.list.ref : refOf(c.list, ctx)
      if (!who || !list) return false
      return ctx.isMember(`${list.type}:${list.id}`, who)
    }
    case 'isFrom': {
      // "who is from place" — string equality on a place attribute for now.
      return toText(evalValue(c.who, ctx)) === toText(evalValue(c.place, ctx))
    }
    case 'compare': {
      const l = evalValue(c.l, ctx)
      const r = evalValue(c.r, ctx)
      const ln = toNumber(l)
      const rn = toNumber(r)
      let cmp: number
      if (!isError(ln) && !isError(rn)) cmp = ln === rn ? 0 : ln < rn ? -1 : 1
      else cmp = compareText(toText(l), toText(r))
      switch (c.op) {
        case '=': return cmp === 0
        case '<>': return cmp !== 0
        case '<': return cmp < 0
        case '<=': return cmp <= 0
        case '>': return cmp > 0
        case '>=': return cmp >= 0
      }
    }
  }
}

function applyAction(a: ActionBlock, ctx: RuleContext, out: RuleResult): void {
  switch (a.t) {
    case 'applyDiscount': {
      const pct = num(evalValue(a.pct, ctx))
      out.factor *= 1 - pct / 100
      return
    }
    case 'applyEscalation': {
      const pctPerDay = num(evalValue(a.pctPerDay, ctx))
      const until = toText(evalValue(a.untilDate, ctx))
      const start = toText(ctx.inputs['startDate'] ?? null) || ctx.now
      const days = daysBetween(start, clampDate(ctx.now, until))
      out.factor *= Math.pow(1 + pctPerDay / 100, Math.max(0, days))
      return
    }
    case 'setOutput': {
      out.outputs[a.name] = evalValue(a.value, ctx)
      return
    }
  }
}

function num(v: CellValue): number {
  const n = toNumber(v)
  return isError(n) ? 0 : n
}

function compareText(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1
}

// Whole-day difference between two ISO dates (date part only), deterministic and
// timezone-free: parse yyyy-mm-dd as a UTC midnight.
function daysBetween(from: string, to: string): number {
  const a = utcDay(from)
  const b = utcDay(to)
  if (a === null || b === null) return 0
  return Math.floor((b - a) / 86_400_000)
}

function clampDate(now: string, until: string): string {
  const n = utcDay(now)
  const u = utcDay(until)
  if (n === null || u === null) return now
  return n <= u ? now : until
}

function utcDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
