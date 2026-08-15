// Blocks → source. One-way: the block JSON is canonical, and this renders the
// equivalent readable JS for the "view / edit this block's source" feature and
// for code-mode execution in the sandbox. The reverse (source → blocks) is
// deliberately NOT attempted: once a user hand-edits source it becomes
// authoritative (`mode:'code'`) and the visual panel shows this generated text
// as a read-only preview — honest, never a lossy re-parse.

import { toText } from '../values.js'
import type { RuleBlock, ValueBlock, CheckBlock, ActionBlock } from './schema.js'

// Code-mode execution contract: the compiled source is `(ctx) => {…}` where
// `ctx` is a superset of the interpreter's RuleContext, additionally exposing the
// helpers referenced below — `ctx.isMember(listId, whoId)` and
// `ctx.daysElapsed(untilDate)` (whole days from ctx.inputs.startDate to
// min(ctx.now, untilDate)). The host marshals these into the sandbox when a rule
// is flipped to code-mode; blocks-mode rules run through the pure interpreter
// (context.ts) instead and never touch this source.
/** Render a rule as `(ctx) => ({ applied, factor, outputs })` source. */
export function compileBlocksToSource(rule: RuleBlock): string {
  const when = rule.when.length ? rule.when.map(compileCheck).map((c) => `(${c})`).join(' && ') : 'true'
  const actions = rule.then.map(compileAction).join('\n    ')
  return [
    '(ctx) => {',
    `  if (!(${when})) return { applied: false, factor: 1, outputs: {} };`,
    '  let factor = 1;',
    '  const outputs = {};',
    actions ? `    ${actions}` : '',
    '  return { applied: true, factor, outputs };',
    '}',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

function compileValue(v: ValueBlock): string {
  switch (v.t) {
    case 'literal':
      return JSON.stringify(v.v)
    case 'input':
      return `ctx.inputs[${JSON.stringify(v.name)}]`
    case 'global':
      return `ctx.inputs[${JSON.stringify(v.name)}]`
    case 'listRef':
      return JSON.stringify(`${v.ref.type}:${v.ref.id}`)
  }
}

function compileCheck(c: CheckBlock): string {
  switch (c.t) {
    case 'isMember':
      return `ctx.isMember(${compileValue(c.list)}, ${compileValue(c.who)})`
    case 'isFrom':
      return `${compileValue(c.who)} === ${compileValue(c.place)}`
    case 'compare': {
      const op = c.op === '=' ? '===' : c.op === '<>' ? '!==' : c.op
      return `${compileValue(c.l)} ${op} ${compileValue(c.r)}`
    }
  }
}

function compileAction(a: ActionBlock): string {
  switch (a.t) {
    case 'applyDiscount':
      return `factor *= 1 - (${compileValue(a.pct)})/100;`
    case 'applyEscalation':
      return `factor *= Math.pow(1 + (${compileValue(a.pctPerDay)})/100, ctx.daysElapsed(${compileValue(a.untilDate)}));`
    case 'setOutput':
      return `outputs[${JSON.stringify(a.name)}] = ${compileValue(a.value)};`
  }
}

/** A human summary of a rule for a compact chip/preview. */
export function describeRule(rule: RuleBlock): string {
  const cond = rule.when.length ? rule.when.map(describeCheck).join(' and ') : 'always'
  const act = rule.then.map(describeAction).join(', ')
  return `if ${cond} → ${act}`
}

function describeCheck(c: CheckBlock): string {
  switch (c.t) {
    case 'isMember':
      return `${valLabel(c.who)} ∈ ${valLabel(c.list)}`
    case 'isFrom':
      return `${valLabel(c.who)} from ${valLabel(c.place)}`
    case 'compare':
      return `${valLabel(c.l)} ${c.op} ${valLabel(c.r)}`
  }
}

function describeAction(a: ActionBlock): string {
  switch (a.t) {
    case 'applyDiscount':
      return `discount ${valLabel(a.pct)}%`
    case 'applyEscalation':
      return `+${valLabel(a.pctPerDay)}%/day until ${valLabel(a.untilDate)}`
    case 'setOutput':
      return `set ${a.name} = ${valLabel(a.value)}`
  }
}

function valLabel(v: ValueBlock): string {
  switch (v.t) {
    case 'literal':
      return toText(v.v)
    case 'input':
    case 'global':
      return v.name
    case 'listRef':
      return v.ref.id
  }
}
