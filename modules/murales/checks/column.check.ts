// Assertions for the column (markdown-document) model: text-onto-text stacking,
// column packing, in-column insertion, and heading splitting.
// Run: npx tsx checks/column.check.ts

import type { MuralElement } from '../types.ts'
import {
  setGroupLayout,
  makeColumnFromTexts,
  insertIntoColumn,
  hitColumnSlot,
  groupElements,
  dissolveThinColumns,
} from '../implementations/web/engine/canvasLayout.ts'
import { computeLayout, isColumn } from '../implementations/web/engine/packLayout.ts'
import { childrenOf } from '../implementations/web/engine/muralTree.ts'
import { splitByHeadings } from '../implementations/web/engine/muralLayout.ts'

let failures = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`)
  else { failures++; console.log(`FAIL ${name} ${detail}`) }
}
function eq(name: string, got: unknown, want: unknown) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

function md(id: string, text: string, parentId?: string, w = 180, h = 40): MuralElement {
  return { id, kind: 'markdown', text, parentId, doc: { placement: 'flow' }, canvas: { x: 0, y: 0, w, h } }
}

// ── makeColumnFromTexts ──────────────────────────────────────────────────────
{
  const els = [md('a', 'A'), md('b', 'B')]
  const below = makeColumnFromTexts(els, 'a', 'b', 'g', 'below')
  const g = below.find((e) => e.id === 'g')!
  ok('column group created', !!g && g.kind === 'group' && isColumn(g))
  eq('below → [A,B]', childrenOf(below, 'g').map((e) => e.id), ['a', 'b'])

  const above = makeColumnFromTexts(els, 'a', 'b', 'g', 'above')
  eq('above → [B,A]', childrenOf(above, 'g').map((e) => e.id), ['b', 'a'])
}

// ── computeLayout stacks a column vertically ─────────────────────────────────
{
  const els: MuralElement[] = [
    { id: 'g', kind: 'group', parentId: undefined, doc: { placement: 'flow' }, canvas: { x: 0, y: 0, layout: 'column' } },
    md('a', 'A', 'g'),
    md('b', 'B', 'g'),
  ]
  const laid = computeLayout(els)
  const a = laid.find((e) => e.id === 'a')!
  const b = laid.find((e) => e.id === 'b')!
  const g = laid.find((e) => e.id === 'g')!
  ok('a stacked above b', a.canvas.y < b.canvas.y, `a.y=${a.canvas.y} b.y=${b.canvas.y}`)
  ok('column got a width', (g.canvas.w ?? 0) > 0)
  ok('column got a height', (g.canvas.h ?? 0) > 0)
  // Left-aligned: narrower children shift left so their left edge = card left.
  // child.x = (childW - cardW)/2 = (180 - 240)/2 = -30.
  eq('children left-aligned', [a.canvas.x, b.canvas.x], [-30, -30])
}

// ── insertIntoColumn ─────────────────────────────────────────────────────────
{
  const els: MuralElement[] = [
    { id: 'g', kind: 'group', parentId: undefined, doc: { placement: 'flow' }, canvas: { x: 0, y: 0, layout: 'column' } },
    md('a', 'A', 'g'),
    md('b', 'B', 'g'),
    md('c', 'C'), // loose root
  ]
  const belowA = insertIntoColumn(els, 'c', 'g', 'a', 'below')
  eq('insert c below a → [a,c,b]', childrenOf(belowA, 'g').map((e) => e.id), ['a', 'c', 'b'])
  const aboveA = insertIntoColumn(els, 'c', 'g', 'a', 'above')
  eq('insert c above a → [c,a,b]', childrenOf(aboveA, 'g').map((e) => e.id), ['c', 'a', 'b'])
  const belowB = insertIntoColumn(els, 'c', 'g', 'b', 'below')
  eq('insert c below b → [a,b,c]', childrenOf(belowB, 'g').map((e) => e.id), ['a', 'b', 'c'])
}

// ── hitColumnSlot picks the side by pointer half ─────────────────────────────
{
  const els = [md('a', 'A', undefined, 100, 40)] // centered at (0,0), h=40
  const above = hitColumnSlot(els, { x: 0, y: -10 })
  const below = hitColumnSlot(els, { x: 0, y: 10 })
  eq('above half', above && above.place, 'above')
  eq('below half', below && below.place, 'below')
  ok('miss → null', hitColumnSlot(els, { x: 500, y: 500 }) === null)
}

// ── splitByHeadings ──────────────────────────────────────────────────────────
{
  const { preamble, sections } = splitByHeadings('intro\n# H1\ntext\n## H2\nmore')
  eq('preamble', preamble, 'intro')
  eq('one top section', sections.length, 1)
  eq('H1 title', sections[0]!.title, 'H1')
  eq('H1 body', sections[0]!.body, 'text')
  eq('H2 nested', sections[0]!.children.map((c) => c.title), ['H2'])
  eq('H2 body', sections[0]!.children[0]!.body, 'more')

  // A '#' inside a fence is not a heading.
  const fenced = splitByHeadings('```\n# not a heading\n```')
  eq('fence not split', fenced.sections.length, 0)

  // Two siblings at the same level.
  const sib = splitByHeadings('# A\n# B')
  eq('two siblings', sib.sections.map((s) => s.title), ['A', 'B'])
}

// ── groupElements (selection → new group) ────────────────────────────────────
{
  const els = [md('a', 'A'), md('b', 'B'), md('c', 'C')]
  const grouped = groupElements(els, ['a', 'b'], 'g', 'mindmap')
  const g = grouped.find((e) => e.id === 'g')!
  ok('group created', !!g && g.kind === 'group')
  eq('a,b now children of g', childrenOf(grouped, 'g').map((e) => e.id).sort(), ['a', 'b'])
  eq('c stays root', grouped.find((e) => e.id === 'c')!.parentId, undefined)

  const col = groupElements(els, ['a', 'b'], 'g', 'column')
  ok('column layout group', isColumn(col.find((e) => e.id === 'g')!))

  eq('needs ≥2', groupElements(els, ['a'], 'g', 'mindmap').length, els.length)

  // A selected child of a selected element doesn't double-group.
  const nested = [
    { id: 'g0', kind: 'group', parentId: undefined, doc: { placement: 'flow' }, canvas: { x: 0, y: 0 } } as MuralElement,
    md('x', 'X', 'g0'),
    md('y', 'Y'),
  ]
  const g2 = groupElements(nested, ['g0', 'x', 'y'], 'gg', 'mindmap')
  eq('only tops reparented (g0,y)', childrenOf(g2, 'gg').map((e) => e.id).sort(), ['g0', 'y'])
  eq('x stays under g0', g2.find((e) => e.id === 'x')!.parentId, 'g0')
}

// ── dissolveThinColumns (a 1-child column collapses) ─────────────────────────
{
  const g = (id: string, parentId?: string): MuralElement =>
    ({ id, kind: 'group', parentId, doc: { placement: 'flow' }, canvas: { x: 5, y: 7, layout: 'column' } })

  // 2-child column, one child removed → column dissolves, lone child promoted.
  const afterDelete = [g('col'), md('a', 'A', 'col')] // 'b' already deleted
  const dis = dissolveThinColumns(afterDelete)
  ok('column gone', !dis.some((e) => e.id === 'col'))
  eq('lone child promoted to root', dis.find((e) => e.id === 'a')!.parentId, undefined)
  eq('child inherits column slot', [dis.find((e) => e.id === 'a')!.canvas.x, dis.find((e) => e.id === 'a')!.canvas.y], [5, 7])

  // Healthy 2-child column is untouched.
  const healthy = [g('c'), md('x', 'X', 'c'), md('y', 'Y', 'c')]
  eq('healthy column kept', dissolveThinColumns(healthy).length, 3)

  // Empty column is removed.
  eq('empty column removed', dissolveThinColumns([g('e')]).length, 0)

  // Cascade: a column holding a single sub-column collapses too.
  const nested = [g('outer'), g('inner', 'outer'), md('t', 'T', 'inner'), md('u', 'U', 'inner')]
  const casc = dissolveThinColumns(nested)
  ok('outer dissolved', !casc.some((e) => e.id === 'outer'))
  eq('inner promoted to root', casc.find((e) => e.id === 'inner')!.parentId, undefined)
  eq('inner keeps its 2 kids', childrenOf(casc, 'inner').map((e) => e.id), ['t', 'u'])
}

// ── setGroupLayout (block ↔ mind-map convert) ────────────────────────────────
{
  const els: MuralElement[] = [
    { id: 'g', kind: 'group', parentId: undefined, doc: { placement: 'flow' }, canvas: { x: 0, y: 0, layout: 'column', pinned: true } },
    { ...md('a', 'A', 'g'), canvas: { x: 0, y: 0, w: 180, h: 40, pinned: true } },
    { ...md('b', 'B', 'g'), canvas: { x: 0, y: 0, w: 180, h: 40, pinned: true } },
  ]
  const toMind = setGroupLayout(els, 'g', 'mindmap')
  eq('group is now mindmap', toMind.find((e) => e.id === 'g')!.canvas.layout, 'mindmap')
  ok('group not a column', !isColumn(toMind.find((e) => e.id === 'g')!))
  eq('children unpinned', [toMind.find((e) => e.id === 'a')!.canvas.pinned, toMind.find((e) => e.id === 'b')!.canvas.pinned], [false, false])
  ok('group keeps its pin', toMind.find((e) => e.id === 'g')!.canvas.pinned === true)

  const back = setGroupLayout(toMind, 'g', 'column')
  ok('back to column', isColumn(back.find((e) => e.id === 'g')!))
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
if (failures > 0) process.exit(1)
