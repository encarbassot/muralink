// Lightweight verification harness (the repo has no test runner). Run with:
//   npm run verify   (from packages/calc)   — or   npx tsx verify.ts
// Exits non-zero on any failure so it can gate CI later.

import { CalcEngine, parse, isError } from './src/index.js'
import { evalRule, compileBlocksToSource, type RuleBlock, type RuleContext } from './src/blocks/index.js'

let pass = 0
let fail = 0
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) {
    pass++
  } else {
    fail++
    console.log(`  FAIL ${name}: got ${g} want ${w}`)
  }
}

// parse
check('parse precedence', parse('1+2*3'), {
  t: 'binary', op: '+', l: { t: 'num', v: 1 },
  r: { t: 'binary', op: '*', l: { t: 'num', v: 2 }, r: { t: 'num', v: 3 } },
})

// eval + recompute propagation + ISBLANK/IF
{
  const e = new CalcEngine({ cells: [
    { id: 'A1', src: '10' }, { id: 'B1', src: '0.15' },
    { id: 'C1', src: '=A1*(1+B1)' }, { id: 'D1', src: '=IF(ISBLANK(A1),0,C1)' },
  ]})
  check('final = base*(1+gain)', e.getValue('C1'), 11.5)
  check('if not blank', e.getValue('D1'), 11.5)
  e.setCell('A1', '20')
  check('propagation', e.getValue('C1'), 23)
  e.setCell('A1', '')
  check('isblank branch', e.getValue('D1'), 0)
}

// builtins + DIV0
{
  const e = new CalcEngine({ cells: [
    { id: 'A1', src: '5' }, { id: 'A2', src: '3' }, { id: 'A3', src: '' }, { id: 'A4', src: '2' },
    { id: 'B1', src: '=SUM(A1:A4)' }, { id: 'B2', src: '=MAX(A1:A4)' },
    { id: 'B3', src: '=ROUND(A1/A2,2)' }, { id: 'B5', src: '=A1/A3' },
  ]})
  check('SUM ignores blank', e.getValue('B1'), 10)
  check('MAX', e.getValue('B2'), 5)
  check('ROUND', e.getValue('B3'), 1.67)
  const div = e.getValue('B5')
  check('DIV0', isError(div) ? div.code : div, 'DIV0')
}

// cycle poisoning (not throwing)
{
  const e = new CalcEngine({ cells: [
    { id: 'A1', src: '=B1+1' }, { id: 'B1', src: '=A1+1' }, { id: 'C1', src: '=5' },
  ]})
  const a = e.getValue('A1')
  check('cycle poisoned', isError(a) ? a.code : a, 'CYCLE')
  check('non-cyclic unaffected', e.getValue('C1'), 5)
}

// globals
{
  const e = new CalcEngine({
    cells: [{ id: 'A1', src: '100' }, { id: 'A2', src: '=A1*defaultGain' }],
    globals: [{ name: 'defaultGain', src: '0.2' }],
  })
  check('global in cell', e.getValue('A2'), 20)
}

// block rules — membership discount (buyer ∈ list → 15% off)
{
  const rule: RuleBlock = {
    id: 'r1', mode: 'blocks',
    when: [{ t: 'isMember', who: { t: 'input', name: 'buyer' }, list: { t: 'listRef', ref: { type: 'list', id: 'vip' } } }],
    then: [{ t: 'applyDiscount', pct: { t: 'literal', v: 15 } }],
  }
  const base: Omit<RuleContext, 'isMember'> = { inputs: {}, refs: { buyer: { type: 'contact', id: 'c1' } }, now: '2026-07-25' }
  const member: RuleContext = { ...base, isMember: (listId, ref) => listId === 'list:vip' && ref.id === 'c1' }
  const nonMember: RuleContext = { ...base, isMember: () => false }
  check('rule applies for member', evalRule(rule, member), { applied: true, factor: 0.85, outputs: {} })
  check('rule skips non-member', evalRule(rule, nonMember), { applied: false, factor: 1, outputs: {} })
  check('rule compiles to source (has isMember call)', /ctx\.isMember/.test(compileBlocksToSource(rule)), true)
}

// block rules — time escalation (+5%/day for 4 days)
{
  const rule: RuleBlock = {
    id: 'r2', mode: 'blocks', when: [],
    then: [{ t: 'applyEscalation', pctPerDay: { t: 'literal', v: 5 }, untilDate: { t: 'literal', v: '2026-12-31' } }],
  }
  const ctx: RuleContext = { inputs: { startDate: '2026-07-21' }, refs: {}, isMember: () => false, now: '2026-07-25' }
  const r = evalRule(rule, ctx)
  // 4 days at +5%/day = 1.05^4
  check('escalation factor 1.05^4', Math.round(r.factor * 1e6) / 1e6, Math.round(Math.pow(1.05, 4) * 1e6) / 1e6)
}

console.log(`@muralink/calc: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
