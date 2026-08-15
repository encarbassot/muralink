// Assertions for engine/mural/muralPlacement.ts. Run: npx tsx checks/muralPlacement.check.ts

import type { MuralElement } from '../types.ts'
import {
  muralPlacementOf,
  placementsOf,
  isLoose,
  frameScaleOf,
  localPointOf,
  childrenOf,
  LIENZO_W,
} from '../implementations/web/engine/mural/muralPlacement.ts'
import { DEFAULT_GROUP_R, DEFAULT_TEXT_W } from '../implementations/web/engine/semantics.ts'

let failures = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`)
  else { failures++; console.log(`FAIL ${name} ${detail}`) }
}
function eq(name: string, got: unknown, want: unknown) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}
function close(name: string, got: number, want: number, eps = 1e-9) {
  ok(name, Math.abs(got - want) < eps, `got ${got} want ${want}`)
}

const flow = { placement: 'flow' as const }

function md(id: string, parentId: string | undefined, canvas: MuralElement['canvas'], mural?: MuralElement['mural']): MuralElement {
  return { id, kind: 'markdown', parentId, text: id, doc: flow, canvas, ...(mural ? { mural } : {}) }
}
function grp(id: string, parentId: string | undefined, canvas: MuralElement['canvas'], mural?: MuralElement['mural']): MuralElement {
  return { id, kind: 'group', parentId, doc: flow, canvas, ...(mural ? { mural } : {}) }
}

// ── lazy defaults ────────────────────────────────────────────────────────────
const a = md('a', undefined, { x: 10, y: 20, w: 300 })
eq('default from canvas', muralPlacementOf(a), { x: 10, y: 20, scale: 1, w: 300 })
const g = grp('g', undefined, { x: 0, y: 0, r: 50 })
eq('default group w = 2r', muralPlacementOf(g).w, 100)
const g2 = grp('g2', undefined, { x: 0, y: 0 })
eq('default group w fallback', muralPlacementOf(g2).w, 2 * DEFAULT_GROUP_R)
const t = md('t', undefined, { x: 0, y: 0 })
eq('default text w fallback', muralPlacementOf(t).w, DEFAULT_TEXT_W)
const explicit = md('e', undefined, { x: 1, y: 2 }, { x: 5, y: 6, scale: 0.5, w: 40 })
eq('explicit mural wins', muralPlacementOf(explicit), { x: 5, y: 6, scale: 0.5, w: 40 })

// ── isLoose ──────────────────────────────────────────────────────────────────
ok('root without mural = column', !isLoose(a))
ok('root with mural = loose', isLoose(explicit))
ok('child with mural NOT loose', !isLoose(md('c', 'g', { x: 0, y: 0 }, { x: 0, y: 0, scale: 1 })))

// ── frameScaleOf products ────────────────────────────────────────────────────
const p1 = grp('p1', undefined, { x: 0, y: 0 }, { x: 100, y: 100, scale: 0.5 })
const p2 = grp('p2', 'p1', { x: 0, y: 0 }, { x: 10, y: 10, scale: 0.1 })
const leaf = md('leaf', 'p2', { x: 0, y: 0 })
const els = [p1, p2, leaf]
close('root frame = camera', frameScaleOf(els, undefined, 2), 2)
close('one level', frameScaleOf(els, 'p1', 2), 2 * 0.5)
close('two levels', frameScaleOf(els, 'p2', 2), 2 * 0.5 * 0.1)
close('default scale 1 in chain', frameScaleOf([g, md('x', 'g', { x: 0, y: 0 })], 'g', 3), 3)

// ── localPointOf inverse walk ────────────────────────────────────────────────
// camera identity: screen == root units
const vpId = { tx: 0, ty: 0, scale: 1 }
eq('root local = world', localPointOf(els, { x: 100, y: 100 }, vpId), { x: 100, y: 100 })
// p1 center at (100,100) scale .5 → screen (100,100) is p1's local origin
eq('p1 origin', localPointOf(els, { x: 100, y: 100 }, vpId, 'p1'), { x: 0, y: 0 })
// screen (150,100): (150-100)/0.5 = 100 in p1 units
eq('p1 offset', localPointOf(els, { x: 150, y: 100 }, vpId, 'p1'), { x: 100, y: 0 })
// p2 center at p1-local (10,10), scale .1 → p1-local (10,10) is p2 origin
eq('p2 origin', localPointOf(els, { x: 105, y: 105 }, vpId, 'p2'), { x: 0, y: 0 })
// with camera: scale 2, t (50,0). screen = root*2+50 → root (100,100) = screen (250,200)
eq('camera composed', localPointOf(els, { x: 250, y: 200 }, { tx: 50, ty: 0, scale: 2 }, 'p1'), { x: 0, y: 0 })

// ── cycle guard terminates ───────────────────────────────────────────────────
const c1 = grp('c1', 'c2', { x: 0, y: 0 }, { x: 0, y: 0, scale: 0.5 })
const c2 = grp('c2', 'c1', { x: 0, y: 0 }, { x: 0, y: 0, scale: 0.5 })
ok('frameScaleOf terminates on cycle', Number.isFinite(frameScaleOf([c1, c2], 'c1', 1)))
ok('localPointOf terminates on cycle', Number.isFinite(localPointOf([c1, c2], { x: 0, y: 0 }, vpId, 'c1').x))

// ── misc ─────────────────────────────────────────────────────────────────────
eq('childrenOf', childrenOf(els, 'p1').map((e) => e.id), ['p2'])
ok('placementsOf covers all', placementsOf(els).size === 3)
ok('LIENZO_W sane', LIENZO_W > 0)

console.log(failures ? `\n${failures} FAILURES` : '\nall ok')
process.exit(failures ? 1 : 0)
