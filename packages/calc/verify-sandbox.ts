// Sandbox verification (async — loads the QuickJS wasm). Run:
//   npm run verify:sandbox   — or   npx tsx verify-sandbox.ts

import { CalcEngine, isError, type CellValue } from './src/index.js'
import { preloadSandbox, runUserFn, makeUserFnCaller, type UserFn } from './src/sandbox/index.js'

let pass = 0
let fail = 0
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`  FAIL ${name}: got ${g} want ${w}`) }
}

async function main(): Promise<void> {
  await preloadSandbox()

  // 1. Deterministic function, positional args → named output. We assert PARITY
  //    with the host V8 result of the same expression (both give the identical
  //    IEEE-754 float 114.99999999999999) — that parity is the determinism
  //    guarantee. Money rounding to precision happens later at the pricing layer.
  const markup: UserFn = { id: 'f1', name: 'markup', inputs: ['cost', 'pct'], outputs: ['out'], source: '({cost,pct}) => ({ out: cost * (1 + pct/100) })' }
  const hostVal = 100 * (1 + 15 / 100)
  check('markup parity with host V8', runUserFn(markup, [100, 15]), { out: hostVal })
  // And with a rounding function, an exact result:
  const markupR: UserFn = { id: 'f1r', name: 'markupR', inputs: ['cost', 'pct'], outputs: ['out'], source: '({cost,pct}) => ({ out: Math.round(cost * (1 + pct/100)) })' }
  check('markupR(100,15)=115', runUserFn(markupR, [100, 15]), { out: 115 })

  // 2. Determinism: Math.random and Date are removed → touching them errors.
  const rnd: UserFn = { id: 'f2', name: 'rnd', inputs: [], outputs: ['out'], source: '() => ({ out: Math.random() })' }
  const r = runUserFn(rnd, [])
  check('Math.random blocked', isError(r['out'] as CellValue) ? (r['out'] as { code: string }).code : r['out'], 'VALUE')
  const dt: UserFn = { id: 'f3', name: 'dt', inputs: [], outputs: ['out'], source: '() => ({ out: Date.now() })' }
  const d = runUserFn(dt, [])
  check('Date blocked', isError(d['out'] as CellValue) ? (d['out'] as { code: string }).code : d['out'], 'VALUE')

  // 3. Budget: an infinite loop is interrupted (not a hang), yields an error.
  const loop: UserFn = { id: 'f4', name: 'loop', inputs: [], outputs: ['out'], source: '() => { while(true){} }' }
  const l = runUserFn(loop, [], { wallMs: 100 })
  check('infinite loop interrupted', isError(l['out'] as CellValue), true)

  // 4. Engine integration: a formula calls a user function.
  const engine = new CalcEngine({
    cells: [{ id: 'A1', src: '200' }, { id: 'A2', src: '=MARKUP(A1,25)' }],
    callUser: makeUserFnCaller([markup]),
  })
  check('formula calls user fn', engine.getValue('A2'), 250)

  console.log(`@muralink/calc sandbox: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

void main()
