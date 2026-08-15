// Assertions for the mind-map force-directed layout (repulsion + edge springs).
// Run: npx tsx checks/mindmap.check.ts

import type { MuralElement } from '../types.ts'
import { computeLayout } from '../implementations/web/engine/packLayout.ts'
import { worldCenterOf } from '../implementations/web/engine/canvasLayout.ts'

let failures = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`)
  else { failures++; console.log(`FAIL ${name} ${detail}`) }
}
function eq(name: string, got: unknown, want: unknown) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// A pinned mind-map group (no layout ≡ mindmap) with several small children —
// enough that two of them seed far apart on the spiral (so a spring has slack).
const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g2', 'h']
const els: MuralElement[] = [
  { id: 'g', kind: 'group', doc: { placement: 'flow' }, canvas: { x: 0, y: 0, pinned: true } },
  ...ids.map((id): MuralElement => ({
    id, kind: 'markdown', text: id, parentId: 'g', doc: { placement: 'flow' }, canvas: { x: 0, y: 0, w: 48, h: 48 },
  })),
]

// Deterministic: identical input → identical output (pure, fixed iterations).
{
  const l1 = computeLayout(els)
  const l2 = computeLayout(els)
  eq('deterministic', l1.map((e) => [e.canvas.x, e.canvas.y]), l2.map((e) => [e.canvas.x, e.canvas.y]))
}

// An edge pulls its two endpoints (which seed far apart) closer than with none.
{
  const none = computeLayout(els)
  const wired = computeLayout(els, undefined, [{ id: 'ar', from: 'a', to: 'h' }])
  const dNone = dist(worldCenterOf(none, 'a'), worldCenterOf(none, 'h'))
  const dWired = dist(worldCenterOf(wired, 'a'), worldCenterOf(wired, 'h'))
  ok('edge pulls endpoints closer', dWired < dNone, `none=${dNone.toFixed(1)} wired=${dWired.toFixed(1)}`)
  ok('endpoints do not overlap', dWired > 48, `dWired=${dWired.toFixed(1)}`) // rest gap keeps them apart
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
if (failures > 0) process.exit(1)
