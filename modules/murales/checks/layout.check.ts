// Assertions for engine/muralLayout.ts (document view geometry + markdown
// chunking). Run: npx tsx checks/layout.check.ts

import {
  visibleColumns,
  originOffset,
  elementRect,
  clampLocked,
  growExtents,
  splitBlocks,
  splitAroundBlock,
  mergeMarkdown,
} from '../implementations/web/engine/muralLayout.ts'

let failures = 0
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) console.log(`ok   ${name}`)
  else { failures++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`) }
}

const base = { locked: true, columns: 5, extendLeft: 0, extendRight: 0, extendUp: 0, rowUnit: 48 }

eq('visibleColumns locked', visibleColumns(base), 5)
eq('visibleColumns extended', visibleColumns({ ...base, extendLeft: 2, extendRight: 1 }), 8)
eq('originOffset', originOffset({ ...base, extendLeft: 2, extendUp: 3 }), { col: 2, row: 3 })

eq('elementRect basic', elementRect({ x: 2.5, y: 1.5, w: 1.5 }, base, 100), { left: 250, top: 72, width: 150, height: undefined })
eq('elementRect origin shift', elementRect({ x: -1, y: -2, w: 1 }, { ...base, extendLeft: 2, extendUp: 2 }, 100), { left: 100, top: 0, width: 100, height: undefined })
eq('elementRect fixed h', elementRect({ x: 0, y: 0, w: 2, h: 3 }, base, 100).height, 144)

eq('clampLocked inside', clampLocked({ x: 2, y: 1 }, 2, base), { x: 2, y: 1 })
eq('clampLocked right edge', clampLocked({ x: 4.5, y: 0 }, 2, base), { x: 3, y: 0 })
eq('clampLocked negatives', clampLocked({ x: -1, y: -2 }, 1, base), { x: 0, y: 0 })

const unlocked = { ...base, locked: false }
eq('growExtents noop', growExtents(unlocked, { x: 1, y: 2 }, 1), unlocked)
eq('growExtents left', growExtents(unlocked, { x: -0.5, y: 0 }, 1).extendLeft, 1)
eq('growExtents right', growExtents(unlocked, { x: 5.5, y: 0 }, 2).extendRight, 3)
eq('growExtents up', growExtents(unlocked, { x: 0, y: -1.5 }, 1).extendUp, 2)
eq('growExtents identity when fits', growExtents(unlocked, { x: 0, y: 0 }, 5) === unlocked, true)

const md = '# Título\ntexto\n\npárrafo dos\n\n```js\ncode\n\nmore code\n```\n\nfinal'
const blocks = splitBlocks(md)
eq('splitBlocks count', blocks.length, 4)
eq('splitBlocks first', blocks[0]!.text, '# Título\ntexto')
eq('splitBlocks fence whole', blocks[2]!.text, '```js\ncode\n\nmore code\n```')
eq('splitBlocks last', blocks[3]!.text, 'final')
eq('splitBlocks single', splitBlocks('solo una línea').length, 1)
eq('splitBlocks empty', splitBlocks('').length, 0)

const around = splitAroundBlock(md, blocks[2]!)
eq('splitAround before', around.before, '# Título\ntexto\n\npárrafo dos')
eq('splitAround block', around.block, '```js\ncode\n\nmore code\n```')
eq('splitAround after', around.after, 'final')

eq('mergeMarkdown', mergeMarkdown('a\n\n', '\nb'), 'a\n\nb')
eq('mergeMarkdown empty left', mergeMarkdown('', 'b'), 'b')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
