// Root of the MURAL view: camera plane → root lienzo frame → main column +
// loose nodes (recursive MuralNode trees). All geometry is data-driven via
// muralPlacement.ts — pointer math divides by the captured frame scale, never
// reads DOM rects. Writes flow through onChange({ elements }) into MuralView's
// debounced apply pipeline; doc/canvas placements are never touched here.

import { useMemo, useRef, useState } from 'react'
import type { MuralElement, MuralPlacement, YMural } from '../../../../types.ts'
import { CellMenu, type CellMenuItem } from '@muralink/ui'
import { makeMarkdownElement } from '../../muralesStore.ts'
import type { Pt } from '../canvasLayout.ts'
import { MainColumn, type MainColumnCtx } from './MainColumn.tsx'
import { MuralNode, type MuralNodeCtx } from './MuralNode.tsx'
import { frameScaleOf, isLoose, placementsOf, LIENZO_W } from './muralPlacement.ts'
import { useMuralCamera } from './useMuralCamera.ts'

/** Default width (lienzo units) for a block pulled loose or quick-added. */
const LOOSE_W = 420

interface Props {
  mural: YMural
  onChange: (patch: Partial<YMural>) => void
  readOnly?: boolean
  onOpenMural?: (muralId: string) => void
}

export function MuralSurface({ mural, onChange, readOnly = false, onOpenMural }: Props) {
  const elements = mural.elements
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const cam = useMuralCamera(mural.id, containerRef, frameRef)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ el: MuralElement; anchor: { top: number; right: number } } | null>(null)
  const [quickAdd, setQuickAdd] = useState<{ at: Pt } | null>(null)
  const [quickText, setQuickText] = useState('')
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [pullGhost, setPullGhost] = useState<{ el: MuralElement; screen: Pt } | null>(null)

  const placements = useMemo(() => placementsOf(elements), [elements])

  function patchElements(next: MuralElement[]) {
    onChange({ elements: next })
  }
  function updateElement(id: string, patch: Partial<MuralElement>) {
    patchElements(elements.map((el) => (el.id === id ? { ...el, ...patch } : el)))
  }

  // ── Drag a node inside its parent frame ────────────────────────────────────
  function onDragStart(el: MuralElement, e: React.PointerEvent) {
    if (e.button !== 0) return
    const got = placements.get(el.id)
    if (!got) return
    const pl: MuralPlacement = got // hoisted closures below don't see the narrowing
    const fs = frameScaleOf(elements, el.parentId, cam.viewport.scale) || 1
    const start = { px: e.clientX, py: e.clientY, x: pl.x, y: pl.y }
    let moved = false
    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - start.px) / fs
      const dy = (ev.clientY - start.py) / fs
      if (!moved && Math.hypot(ev.clientX - start.px, ev.clientY - start.py) < 4) return
      moved = true
      setDragPos({ id: el.id, x: start.x + dx, y: start.y + dy })
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragPos(null)
      if (!moved) return
      const dx = (ev.clientX - start.px) / fs
      const dy = (ev.clientY - start.py) / fs
      updateElement(el.id, { mural: { ...pl, x: start.x + dx, y: start.y + dy } })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ── Uniform scale via the corner handle ────────────────────────────────────
  function onScaleStart(el: MuralElement, e: React.PointerEvent) {
    if (e.button !== 0) return
    const got = placements.get(el.id)
    if (!got) return
    const pl: MuralPlacement = got // hoisted closures below don't see the narrowing
    const parentFs = frameScaleOf(elements, el.parentId, cam.viewport.scale) || 1
    const startApparent = (pl.w ?? LOOSE_W) * parentFs * pl.scale
    if (startApparent <= 0) return
    const start = { px: e.clientX, scale: pl.scale }
    function onMove(ev: PointerEvent) {
      const factor = (startApparent + (ev.clientX - start.px)) / startApparent
      if (factor <= 0.01) return
      setDragPos(null) // scale renders through data below via live patch
      updateLive(factor)
    }
    let liveFactor = 1
    function updateLive(f: number) {
      liveFactor = f
      // Live feedback through a transient element patch would re-render the
      // tree each frame anyway — write-through is fine at this scale.
      updateElement(el.id, { mural: { ...pl, scale: start.scale * f } })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      updateElement(el.id, { mural: { ...pl, scale: Math.max(0.001, start.scale * liveFactor) } })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ── Pull a block out of the main column ────────────────────────────────────
  function onPullOut(el: MuralElement, e: PointerEvent) {
    setPullGhost({ el, screen: { x: e.clientX, y: e.clientY } })
    function onMove(ev: PointerEvent) {
      setPullGhost({ el, screen: { x: ev.clientX, y: ev.clientY } })
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setPullGhost(null)
      const at = cam.toLienzo(ev)
      updateElement(el.id, { mural: { x: at.x, y: at.y, scale: 1, w: LOOSE_W } })
      setSelectedId(el.id)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ── Menu / delete / quick add ──────────────────────────────────────────────
  function subtreeIds(rootId: string): Set<string> {
    const ids = new Set<string>([rootId])
    let grew = true
    while (grew) {
      grew = false
      for (const e of elements) {
        if (e.parentId !== undefined && ids.has(e.parentId) && !ids.has(e.id)) {
          ids.add(e.id)
          grew = true
        }
      }
    }
    return ids
  }
  function deleteElement(id: string) {
    const ids = subtreeIds(id)
    patchElements(elements.filter((e) => !ids.has(e.id)))
    setSelectedId(null)
    setEditingId(null)
  }
  function menuItemsFor(el: MuralElement): CellMenuItem[] {
    const items: CellMenuItem[] = []
    if (isLoose(el)) {
      items.push({
        id: 'return-to-column',
        label: 'Devolver a la columna',
        onSelect: () => updateElement(el.id, { mural: undefined }),
      })
    }
    items.push({ id: 'delete', label: 'Eliminar', danger: true, onSelect: () => deleteElement(el.id) })
    return items
  }
  function addLoose(text: string, at: Pt) {
    const el = { ...makeMarkdownElement(text, undefined, elements), mural: { x: at.x, y: at.y, scale: 1, w: LOOSE_W } }
    patchElements([...elements, el])
    setSelectedId(el.id)
  }

  const nodeCtx: MuralNodeCtx = {
    els: elements,
    placements,
    readOnly,
    selectedId,
    editingId,
    selfMuralId: mural.id,
    dragPos,
    onSelect: setSelectedId,
    onEdit: setEditingId,
    onText: (id, text) => updateElement(id, { text }),
    onDragStart,
    onScaleStart,
    onMenu: (el, e) => setMenu({ el, anchor: { top: e.clientY, right: window.innerWidth - e.clientX } }),
    onOpenMural,
  }
  const columnCtx: MainColumnCtx = {
    els: elements,
    readOnly,
    editingId,
    selfMuralId: mural.id,
    onEdit: setEditingId,
    onText: (id, text) => updateElement(id, { text }),
    onPullOut: readOnly ? () => {} : onPullOut,
    onOpenMural,
  }

  const loose = elements.filter(isLoose)

  return (
    <div
      ref={containerRef}
      className="mural-surface"
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          setSelectedId(null)
          setEditingId(null)
        }
        cam.bindBackground.onPointerDown(e)
      }}
      onDoubleClick={(e) => {
        if (readOnly || e.target !== e.currentTarget) return
        setQuickAdd({ at: cam.toLienzo(e) })
      }}
      onKeyDown={(e) => {
        if (readOnly || editingId) return
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
          e.preventDefault()
          deleteElement(selectedId)
        }
      }}
    >
      <div style={cam.planeStyle}>
        <div ref={frameRef} className="mural-lienzo" style={{ width: LIENZO_W, position: 'relative' }}>
          <MainColumn ctx={columnCtx} />
        </div>
        {/* Loose roots live in lienzo coords, over the column. */}
        {loose.map((el) => (
          <MuralNode key={el.id} el={el} effScale={cam.viewport.scale} ctx={nodeCtx} />
        ))}
      </div>

      <div className="mural-canvas-toolbar">
        <button
          className="mural-tool-btn"
          title={cam.locked ? 'Desbloquear zoom (lienzo infinito)' : 'Bloquear al lienzo'}
          onClick={cam.toggleLock}
        >
          {cam.locked ? '🔒' : '🔓'}
        </button>
        {!readOnly && (
          <button
            className="mural-tool-btn"
            title="Añadir texto"
            onClick={() => setQuickAdd({ at: cam.toLienzo({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }) })}
          >
            ＋
          </button>
        )}
        {!cam.locked && (
          <button className="mural-tool-btn" title="Volver al lienzo" onClick={() => { cam.refit() }}>⛶</button>
        )}
      </div>

      {quickAdd && !readOnly && (
        <div
          className="mural-quickadd-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              setQuickText('')
              setQuickAdd(null)
            }
          }}
        >
          <div className="mural-quickadd">
            <input
              autoFocus
              value={quickText}
              placeholder="Escribe una idea…"
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && quickText.trim()) {
                  addLoose(quickText.trim(), quickAdd.at)
                  setQuickText('')
                  setQuickAdd(null)
                }
                if (e.key === 'Escape') {
                  setQuickText('')
                  setQuickAdd(null)
                }
              }}
            />
            <div className="mural-quickadd-hint">Enter crea un texto suelto · Esc cancela</div>
          </div>
        </div>
      )}

      {pullGhost && (
        <div
          className="mural-pull-ghost"
          style={{ position: 'fixed', left: pullGhost.screen.x + 8, top: pullGhost.screen.y + 8 }}
        >
          {(pullGhost.el.text ?? '').slice(0, 60) || '…'}
        </div>
      )}

      {menu && (
        <CellMenu items={menuItemsFor(menu.el)} anchor={menu.anchor} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
