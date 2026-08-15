// Assertions for engine/muralTree.ts. Run: npx tsx checks/tree.check.ts

import type { MuralElement } from '../types.ts'
import { childrenOf, rootsOf, isDescendant, subtreeIds, reorderSibling } from '../implementations/web/engine/muralTree.ts'

let failures = 0
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) console.log(`ok   ${name}`)
  else { failures++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`) }
}

const md = (id: string, parentId?: string): MuralElement => ({
  id, parentId, kind: 'markdown', text: id,
  doc: { placement: 'flow' }, canvas: { x: 0, y: 0, w: 100 },
})
const grp = (id: string, parentId?: string): MuralElement => ({
  id, parentId, kind: 'group',
  doc: { placement: 'flow' }, canvas: { x: 0, y: 0, r: 100 },
})

// Tree: r1, g1(a, g2(b)), r2
const els = [md('r1'), grp('g1'), md('a', 'g1'), grp('g2', 'g1'), md('b', 'g2'), md('r2')]

eq('rootsOf', rootsOf(els).map((e) => e.id), ['r1', 'g1', 'r2'])
eq('childrenOf g1', childrenOf(els, 'g1').map((e) => e.id), ['a', 'g2'])
eq('childrenOf leaf', childrenOf(els, 'b').length, 0)
eq('isDescendant deep', isDescendant(els, 'b', 'g1'), true)
eq('isDescendant direct', isDescendant(els, 'a', 'g1'), true)
eq('isDescendant not', isDescendant(els, 'r1', 'g1'), false)
eq('isDescendant self', isDescendant(els, 'g1', 'g1'), false)
eq('subtreeIds', [...subtreeIds(els, 'g1')].sort(), ['a', 'b', 'g1', 'g2'])
eq('subtreeIds leaf', [...subtreeIds(els, 'r2')], ['r2'])

// reorderSibling operates within the parent's run of the flat array.
const r1 = reorderSibling(els, 'g2', null) // g2 before its first sibling (a)
eq('reorder to front', childrenOf(r1, 'g1').map((e) => e.id), ['g2', 'a'])
eq('reorder keeps others', rootsOf(r1).map((e) => e.id), ['r1', 'g1', 'r2'])

const r2 = reorderSibling(els, 'r1', 'r2') // r1 after r2 (roots)
eq('reorder roots', rootsOf(r2).map((e) => e.id), ['g1', 'r2', 'r1'])
eq('reorder roots keeps children', childrenOf(r2, 'g1').map((e) => e.id), ['a', 'g2'])

eq('reorder unknown anchor = noop', reorderSibling(els, 'a', 'nope'), els)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
