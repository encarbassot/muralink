// Assertions for engine/semantics.ts. Run: npx tsx checks/semantics.check.ts

import type { MuralElement } from '../types.ts'
import {
  nominalArea,
  plainLength,
  densidad,
  fontScaleFor,
  canvasFontScale,
  groupTitle,
  sizeForNewChild,
  DEFAULT_GROUP_R,
  DEFAULT_TEXT_W,
} from '../implementations/web/engine/semantics.ts'

let failures = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok   ${name}`)
  else { failures++; console.log(`FAIL ${name} ${detail}`) }
}
function eq(name: string, got: unknown, want: unknown) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

// nominalArea
eq('area group', Math.round(nominalArea({ x: 0, y: 0, r: 100 }, 'group')), Math.round(Math.PI * 10000))
eq('area text w only', nominalArea({ x: 0, y: 0, w: 100 }, 'markdown'), 100 * 62)
eq('area text w+h', nominalArea({ x: 0, y: 0, w: 100, h: 50 }, 'markdown'), 5000)
ok('area defaults group', nominalArea({ x: 0, y: 0 }, 'group') === Math.PI * DEFAULT_GROUP_R * DEFAULT_GROUP_R)

// plainLength strips syntax, keeps content
eq('plain heading', plainLength('# Hola'), 4)
eq('plain list', plainLength('- uno\n- dos'), 'uno\ndos'.length)
eq('plain link', plainLength('[texto](https://x.com)'), 5)
eq('plain emphasis', plainLength('**a** _b_'), 3)
ok('plain fence strips markers', plainLength('```js\ncode\n```') === 4)

// densidad + continuum
ok('densidad grows with text', densidad(200, 10000) > densidad(20, 10000))
ok('densidad shrinks with area', densidad(100, 40000) < densidad(100, 10000))
const scales = [0, 0.5, 1, 2, 5, 10, 40].map(fontScaleFor)
ok('fontScale monotone decreasing', scales.every((s, i) => i === 0 || s <= scales[i - 1]!))
ok('fontScale clamped', fontScaleFor(0) <= 2.2 && fontScaleFor(1000) >= 0.8)
ok('fontScale continuous-ish', Math.abs(fontScaleFor(1.0) - fontScaleFor(1.1)) < 0.1)

// canvasFontScale: linear with width (fill the rectangle), content sets the base
ok('canvasFontScale doubles with width', Math.abs(canvasFontScale(10, DEFAULT_TEXT_W * 2) / canvasFontScale(10, DEFAULT_TEXT_W) - 2) < 1e-9)
ok('canvasFontScale shrinks with width', canvasFontScale(10, DEFAULT_TEXT_W / 2) < canvasFontScale(10, DEFAULT_TEXT_W))
ok('canvasFontScale short > long at same width', canvasFontScale(8, DEFAULT_TEXT_W) > canvasFontScale(400, DEFAULT_TEXT_W))
ok('canvasFontScale base = continuum at default', Math.abs(canvasFontScale(50, DEFAULT_TEXT_W) - fontScaleFor(densidad(50, DEFAULT_TEXT_W * DEFAULT_TEXT_W * 0.62))) < 1e-9)

// groupTitle
const g: MuralElement = { id: 'g', kind: 'group', doc: { placement: 'flow' }, canvas: { x: 0, y: 0, r: 120 } }
const title: MuralElement = { id: 't', kind: 'markdown', parentId: 'g', text: 'Vacaciones 2026', doc: { placement: 'flow' }, canvas: { x: 0, y: 0, w: 100 } }
const body: MuralElement = { id: 'b', kind: 'markdown', parentId: 'g', text: 'Un texto mucho más largo que describe con detalle todo lo que pasó aquel verano, día por día, con anécdotas y observaciones que claramente no son un título de nada.', doc: { placement: 'flow' }, canvas: { x: 0, y: 0, w: 100 } }
const multi: MuralElement = { id: 'm', kind: 'markdown', parentId: 'g', text: 'corto\n\npero dos bloques', doc: { placement: 'flow' }, canvas: { x: 0, y: 0, w: 100 } }
const fileEl: MuralElement = { id: 'f', kind: 'file', parentId: 'g', doc: { placement: 'flow' }, canvas: { x: 0, y: 0, w: 100 } }

eq('title = shortest text', groupTitle(g, [body, title, fileEl]), 't')
eq('no candidates → null', groupTitle(g, [body, fileEl]), null)
eq('multi-block excluded', groupTitle(g, [multi, body]), null)
eq('empty group → null', groupTitle(g, []), null)
eq('empty text excluded', groupTitle(g, [{ ...title, text: '' }]), null)

// sizeForNewChild
eq('child half of parent at parity', sizeForNewChild(200, 2, 2), 100)
ok('denser child gets less', sizeForNewChild(200, 2, 8) < sizeForNewChild(200, 2, 2))
ok('ratio clamped', sizeForNewChild(200, 100, 0.001) <= 0.5 * 200 * 1.4 + 1e-9)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
