// Assertions for engine/canvasViewport.ts + engine/canvasLayout.ts.
// Run: npx tsx checks/canvas.check.ts

import type { MuralElement } from '../types.ts'
import { screenToWorld, worldToScreen, panBy, zoomAt } from '../implementations/web/engine/canvasViewport.ts'
import {
  worldCenterOf,
  circleOf,
  hitGroup,
  hitText,
  toParentFrame,
  reparent,
  makeGroupFromTexts,
  defaultCanvasPlacement,
  applyResize,
} from '../implementations/web/engine/canvasLayout.ts'
import { childrenOf, rootsOf } from '../implementations/web/engine/muralTree.ts'

let failures = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`)
  else { failures++; console.log(`FAIL ${name} ${detail}`) }
}
function eq(name: string, got: unknown, want: unknown) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

// ── Viewport ────────────────────────────────────────────────────────────────
for (const vp of [{ tx: 0, ty: 0, scale: 1 }, { tx: 120, ty: -40, scale: 2.5 }, { tx: -33, ty: 7, scale: 0.4 }]) {
  const p = { x: 57, y: -13 }
  const rt = worldToScreen(vp, screenToWorld(vp, p))
  ok(`roundtrip scale=${vp.scale}`, Math.abs(rt.x - p.x) < 1e-9 && Math.abs(rt.y - p.y) < 1e-9)
}
{
  const vp = { tx: 10, ty: 20, scale: 1 }
  const cursor = { x: 300, y: 200 }
  const before = screenToWorld(vp, cursor)
  const zoomed = zoomAt(vp, cursor, 1.5)
  const after = screenToWorld(zoomed, cursor)
  ok('zoomAt fixes cursor point', Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9)
  eq('zoomAt scale', zoomed.scale, 1.5)
  eq('zoom clamped high', zoomAt(vp, cursor, 100).scale, 4)
  eq('zoom clamped low', zoomAt(vp, cursor, 0.001).scale, 0.2)
  eq('panBy', panBy(vp, 5, -3), { tx: 15, ty: 17, scale: 1 })
}

// ── Tree geometry ───────────────────────────────────────────────────────────
// g1 at (100,100) r=100; g2 child of g1 at offset (30,0) r=40; t child of g2
// at offset (5,5); loose text tl at world (400, 60) w=100.
const els: MuralElement[] = [
  { id: 'g1', kind: 'group', doc: { placement: 'flow' }, canvas: { x: 100, y: 100, r: 100 } },
  { id: 'g2', kind: 'group', parentId: 'g1', doc: { placement: 'flow' }, canvas: { x: 30, y: 0, r: 40 } },
  { id: 't', kind: 'markdown', parentId: 'g2', text: 'hola', doc: { placement: 'flow' }, canvas: { x: 5, y: 5, w: 30 } },
  { id: 'tl', kind: 'markdown', text: 'suelto', doc: { placement: 'flow' }, canvas: { x: 400, y: 60, w: 100 } },
]

eq('worldCenterOf nested', worldCenterOf(els, 't'), { x: 135, y: 105 })
eq('circleOf g2 world', circleOf(els, els[1]!), { cx: 130, cy: 100, r: 40 })

eq('hitGroup deepest wins', hitGroup(els, { x: 130, y: 100 }), 'g2')
eq('hitGroup outer ring', hitGroup(els, { x: 30, y: 100 }), 'g1')
eq('hitGroup miss', hitGroup(els, { x: 500, y: 500 }), undefined)
eq('hitGroup excludes dragged subtree', hitGroup(els, { x: 130, y: 100 }, 'g2'), 'g1')
eq('hitGroup excludes whole subtree of g1', hitGroup(els, { x: 130, y: 100 }, 'g1'), undefined)

eq('hitText hit', hitText(els, { x: 400, y: 60 }), 'tl')
eq('hitText excludes dragged', hitText(els, { x: 400, y: 60 }, 'tl'), undefined)
eq('hitText nested', hitText(els, { x: 135, y: 105 }), 't')

eq('toParentFrame root', toParentFrame(els, { x: 9, y: 9 }, undefined), { x: 9, y: 9 })
eq('toParentFrame nested', toParentFrame(els, { x: 135, y: 105 }, 'g2'), { x: 5, y: 5 })

// ── reparent ────────────────────────────────────────────────────────────────
{
  const next = reparent(els, 'tl', 'g1', { x: 120, y: 140 })
  const moved = next.find((e) => e.id === 'tl')!
  eq('reparent sets parent', moved.parentId, 'g1')
  eq('reparent converts frame', { x: moved.canvas.x, y: moved.canvas.y }, { x: 20, y: 40 })
  eq('reparent world position preserved', worldCenterOf(next, 'tl'), { x: 120, y: 140 })
  eq('reparent joins group in array order', childrenOf(next, 'g1').map((e) => e.id), ['g2', 'tl'])
}
{
  // Document order is untouched: the element keeps its index in the array,
  // it only changes parent (a free canvas move never reorders the document).
  const before = els.map((e) => e.id)
  const next = reparent(els, 't', 'g1', { x: 0, y: 0 })
  eq('reparent keeps array order', next.map((e) => e.id), before)
}
{
  const next = reparent(els, 't', undefined, { x: 300, y: 300 })
  const moved = next.find((e) => e.id === 't')!
  eq('reparent to root', moved.parentId, undefined)
  eq('reparent to root coords are world', { x: moved.canvas.x, y: moved.canvas.y }, { x: 300, y: 300 })
}
eq('reparent cycle guard', reparent(els, 'g1', 'g2', { x: 0, y: 0 }), els)
eq('reparent into self guard', reparent(els, 'g1', 'g1', { x: 0, y: 0 }), els)
{
  // Children ride along: g2 moves to root, t keeps its offset.
  const next = reparent(els, 'g2', undefined, { x: 500, y: 500 })
  eq('subtree rides along', worldCenterOf(next, 't'), { x: 505, y: 505 })
}
{
  // Absolute-pinned root entering a group drops to flow.
  const pinned: MuralElement[] = [
    { id: 'g1', kind: 'group', doc: { placement: 'flow' }, canvas: { x: 100, y: 100, r: 100 } },
    { id: 'p', kind: 'markdown', text: 'x', doc: { placement: 'absolute', abs: { x: 1, y: 1, w: 2 } }, canvas: { x: 300, y: 0, w: 100 } },
  ]
  const next = reparent(pinned, 'p', 'g1', { x: 100, y: 100 })
  eq('absolute drops to flow on nest', next.find((e) => e.id === 'p')!.doc, { placement: 'flow' })
}

// ── makeGroupFromTexts ──────────────────────────────────────────────────────
{
  const texts: MuralElement[] = [
    { id: 'pre', kind: 'markdown', text: 'antes', doc: { placement: 'flow' }, canvas: { x: -300, y: 0, w: 100 } },
    { id: 'A', kind: 'markdown', text: 'Título corto', doc: { placement: 'flow' }, canvas: { x: 100, y: 50, w: 150 } },
    { id: 'B', kind: 'markdown', text: 'Un contenido bastante más largo que va dentro del grupo nuevo con más detalle.', doc: { placement: 'flow' }, canvas: { x: 400, y: 200, w: 150 } },
  ]
  const next = makeGroupFromTexts(texts, 'A', 'B', 'G')
  const g = next.find((e) => e.id === 'G')!
  const a = next.find((e) => e.id === 'A')!
  const b = next.find((e) => e.id === 'B')!
  eq('group takes A slot in array', next.map((e) => e.id), ['pre', 'G', 'A', 'B'])
  eq('group at A position', { x: g.canvas.x, y: g.canvas.y }, { x: 100, y: 50 })
  ok('group has radius', (g.canvas.r ?? 0) >= 120)
  eq('A is first child (title)', childrenOf(next, 'G').map((e) => e.id), ['A', 'B'])
  ok('A id stable / above center', a.parentId === 'G' && a.canvas.y < 0)
  ok('B sized ~half parent scaled by ratio', (b.canvas.w ?? 0) > 0 && (b.canvas.w ?? 0) <= (g.canvas.r ?? 0) * 2 * 0.5 * 1.4 + 1e-9)
  eq('non-markdown guard', makeGroupFromTexts(els, 'g1', 'tl', 'X'), els)
}

// ── defaultCanvasPlacement ──────────────────────────────────────────────────
{
  eq('first root at origin', defaultCanvasPlacement([], undefined, 'markdown'), { x: 0, y: 0, w: 180 })
  const p1 = defaultCanvasPlacement(els, 'g1', 'markdown')
  ok('child within parent radius', Math.hypot(p1.x, p1.y) <= 100 * 0.6 + 1e-9)
  const g = defaultCanvasPlacement(els, undefined, 'group')
  eq('root group gets default r', g.r, 120)
  ok('deterministic', JSON.stringify(defaultCanvasPlacement(els, 'g1', 'markdown')) === JSON.stringify(p1))
}

// ── applyResize ─────────────────────────────────────────────────────────────
{
  eq('resize circle averages axes', applyResize({ x: 0, y: 0, r: 100 }, 'group', 40, 40).r, 120)
  eq('resize circle min', applyResize({ x: 0, y: 0, r: 45 }, 'group', -100, -100).r, 40)
  // Text boxes now resize freely on BOTH axes; an auto box gains an explicit
  // height (seeded from w*0.62) so the text can refit the box.
  eq('resize text free both axes', applyResize({ x: 0, y: 0, w: 100 }, 'markdown', 30, 20), { x: 0, y: 0, w: 130, h: 82 })
  eq('resize text min width', applyResize({ x: 0, y: 0, w: 90 }, 'markdown', -50, 0).w, 80)
  eq('resize text min height', applyResize({ x: 0, y: 0, w: 100, h: 30 }, 'markdown', 0, -100).h, 28)
  eq('resize fixed-h both axes', applyResize({ x: 0, y: 0, w: 100, h: 50 }, 'markdown', 20, 10), { x: 0, y: 0, w: 120, h: 60 })
}

// rootsOf smoke on the shared fixture
eq('roots fixture', rootsOf(els).map((e) => e.id), ['g1', 'tl'])

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
