// CalcEngine — the facade. Holds cell/global definitions, parses them, builds
// the dependency graph, and recomputes every value in topological order. Pure
// and synchronous: given the same definitions it always produces the same
// values, on web or on the server. User-defined functions are reached through an
// injected `callUser` (the sandbox lives in a separate subpath so the core stays
// zero-dependency); absent it, unknown calls resolve to #NAME.

import type { Expr } from './ast.js'
import { collectRefs } from './ast.js'
import { parse } from './parser.js'
import { CalcParseError } from './lexer.js'
import { evaluate, type EvalScope } from './evaluate.js'
import { type FnRegistry, defaultRegistry } from './functions.js'
import { topoOrder } from './graph.js'
import { normalizeRef, expandRange } from './refs.js'
import { type CellValue, err } from './values.js'

export interface CellDef {
  id: string // 'A1'
  src: string // '' | literal ('42', 'hello') | formula ('=A1*2')
}

export interface GlobalVar {
  name: string
  src: string // literal or formula
}

export type UserFnCaller = (name: string, args: CellValue[]) => CellValue

export interface EngineConfig {
  cells?: CellDef[]
  globals?: GlobalVar[]
  fns?: FnRegistry
  callUser?: UserFnCaller
}

type Parsed =
  | { kind: 'formula'; expr: Expr }
  | { kind: 'literal'; value: CellValue }
  | { kind: 'error'; value: CellValue }

/** Parse a raw cell/global source into either a formula AST or a literal value.
 *  A leading '=' marks a formula; everything else is a literal (blank/number/
 *  boolean/string). Malformed formulas become a #VALUE literal, never throw. */
export function parseSource(src: string): Parsed {
  const trimmed = src.trim()
  if (trimmed.startsWith('=')) {
    try {
      return { kind: 'formula', expr: parse(trimmed.slice(1)) }
    } catch (e) {
      const msg = e instanceof CalcParseError ? e.message : 'Parse error'
      return { kind: 'error', value: err('VALUE', msg) }
    }
  }
  if (trimmed === '') return { kind: 'literal', value: null }
  const upper = trimmed.toUpperCase()
  if (upper === 'TRUE') return { kind: 'literal', value: true }
  if (upper === 'FALSE') return { kind: 'literal', value: false }
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) {
    return { kind: 'literal', value: Number(trimmed) }
  }
  return { kind: 'literal', value: src }
}

export class CalcEngine {
  private cells = new Map<string, string>() // id → src
  private globals = new Map<string, string>() // name → src
  private fns: FnRegistry
  private callUser: UserFnCaller
  private values = new Map<string, CellValue>() // id → computed value
  private dirty = true

  constructor(config: EngineConfig = {}) {
    this.fns = config.fns ?? defaultRegistry()
    this.callUser = config.callUser ?? ((name) => err('NAME', `Unknown function "${name}"`))
    for (const c of config.cells ?? []) this.cells.set(normalizeRef(c.id), c.src)
    for (const g of config.globals ?? []) this.globals.set(g.name, g.src)
  }

  /** Set (or clear, with '') a cell's source. Marks the sheet for recompute. */
  setCell(id: string, src: string): void {
    const key = normalizeRef(id)
    if (src === '') this.cells.delete(key)
    else this.cells.set(key, src)
    this.dirty = true
  }

  setGlobal(name: string, src: string): void {
    this.globals.set(name, src)
    this.dirty = true
  }

  /** Current value of a cell, recomputing the sheet if needed. */
  getValue(id: string): CellValue {
    if (this.dirty) this.recompute()
    return this.values.get(normalizeRef(id)) ?? null
  }

  /** All computed cell values, keyed by id. */
  snapshot(): Map<string, CellValue> {
    if (this.dirty) this.recompute()
    return new Map(this.values)
  }

  /** Recompute every cell in dependency order. Cyclic cells are poisoned with
   *  #CYCLE rather than throwing. */
  recompute(): void {
    // 1. Parse every cell once.
    const parsed = new Map<string, Parsed>()
    for (const [id, src] of this.cells) parsed.set(id, parseSource(src))

    // 2. Build precedents (formula cells only).
    const precedents = new Map<string, Set<string>>()
    for (const [id, p] of parsed) {
      const refs = new Set<string>()
      if (p.kind === 'formula') collectRefs(p.expr, refs, expandRange)
      precedents.set(id, refs)
    }

    // 3. Topological order + cyclic set.
    const { order, cyclic } = topoOrder(precedents)

    // 4. Evaluate. Cyclic first (poison), then the rest in order.
    this.values = new Map()
    for (const id of cyclic) {
      this.values.set(id, err('CYCLE', `Circular reference at ${id}`))
    }

    const scope: EvalScope = {
      cell: (ref) => this.values.get(normalizeRef(ref)) ?? null,
      global: (name) => this.resolveGlobal(name, new Set()),
      callUser: this.callUser,
      fns: this.fns,
    }

    for (const id of order) {
      const p = parsed.get(id)!
      if (p.kind === 'formula') this.values.set(id, evaluate(p.expr, scope))
      else this.values.set(id, p.value)
    }

    this.dirty = false
  }

  // Globals resolve on demand with a visiting guard (globals may reference other
  // globals). Cell reads see already-computed values (null if not yet computed).
  private resolveGlobal(name: string, visiting: Set<string>): CellValue {
    const src = this.globals.get(name)
    if (src === undefined) return err('NAME', `Unknown global "${name}"`)
    if (visiting.has(name)) return err('CYCLE', `Circular global "${name}"`)
    const p = parseSource(src)
    if (p.kind !== 'formula') return p.value
    const nextVisiting = new Set(visiting).add(name)
    const scope: EvalScope = {
      cell: (ref) => this.values.get(normalizeRef(ref)) ?? null,
      global: (n) => this.resolveGlobal(n, nextVisiting),
      callUser: this.callUser,
      fns: this.fns,
    }
    return evaluate(p.expr, scope)
  }
}
