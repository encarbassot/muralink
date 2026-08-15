// The block rule model — the visual, draggable representation of a deterministic
// rule. A rule is a tree of typed blocks (values → checks → actions) whose
// CANONICAL form is this JSON, and which compiles (compile.ts) to the same
// sandboxed-function source the engine already runs. Blocks and code are two
// views of one artifact; "edit source" round-trips through the compiler.
//
// Blocks can reference Instances and InstanceLists: a user builds a "virtual
// list" of anything (contacts, orgs…) and a rule checks membership
// (buyer ∈ list → discount). The list is never resolved inside the sandbox — the
// host resolves membership and injects `isMember` into the RuleContext.

import type { CellValue } from '../values.js'

/** A pointer to an instance the block references (mirrors @muralink/types
 *  InstanceRef; duplicated as a local shape so packages/calc stays zero-dep). */
export interface BlockInstanceRef {
  type: string
  id: string
}

export type ValueBlock =
  | { t: 'literal'; v: CellValue }
  | { t: 'input'; name: string } // from RuleContext.inputs (buyer, quantity, base…)
  | { t: 'global'; name: string } // a sheet global variable
  | { t: 'listRef'; ref: BlockInstanceRef } // a dragged-in virtual InstanceList

export type CheckBlock =
  | { t: 'isMember'; who: ValueBlock; list: ValueBlock } // who ∈ list
  | { t: 'compare'; op: '=' | '<>' | '<' | '<=' | '>' | '>='; l: ValueBlock; r: ValueBlock }
  | { t: 'isFrom'; who: ValueBlock; place: ValueBlock }

export type ActionBlock =
  | { t: 'applyDiscount'; pct: ValueBlock } // reduce price by pct %
  | { t: 'applyEscalation'; pctPerDay: ValueBlock; untilDate: ValueBlock } // +pct%/day until date
  | { t: 'setOutput'; name: string; value: ValueBlock }

/** One IF/CHECK/THEN unit. `when` checks are ANDed; empty `when` = always. */
export interface RuleBlock {
  id: string
  mode: 'blocks' | 'code' // 'code' = the source was hand-edited and is authoritative
  when: CheckBlock[]
  then: ActionBlock[]
  source?: string // generated from blocks, or hand-edited when mode==='code'
}
