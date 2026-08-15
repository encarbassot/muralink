// The mural CANVAS view: an assisted mind-map plane with nested Venn/agar.io
// circles. Groups are circles containing sub-groups and texts, recursively.
// Interaction model:
//   click        select (ring + corner resize handle; groups drag whole subtree)
//   double click empty → quick-add omnibar; on a text → edit it in place
//   drag         move; drop onto a block edge stacks a column, into a group
//                reparents as content
//   corner drag  resize freely on both axes; the text refits the box
//   select tool  a marquee (square / ellipse / lasso) selects everything it
//                covers; a bottom action row then groups/deletes the selection
//
// All elements render FLAT at computed world centers (worldCenterOf); nesting
// is data (parentId), not DOM containment — hit-testing runs on data.

import { useEffect, useMemo, useRef, useState } from 'react'
import { CellMenu, type CellMenuItem } from '@muralink/ui'
import { MarkdownEditor } from '@muralink/editor'
import type { MuralElement, YMural } from '../../../types.ts'
import { FileCard } from '../components/FileCard.tsx'
import {
  applyResize,
  columnRectOf,
  dissolveThinColumns,
  groupElements,
  hitBlock,
  hitColumnSlot,
  hitGroup,
  insertIntoColumn,
  makeColumnFromTexts,
  reparent,
  setGroupLayout,
  toParentFrame,
  worldBounds,
  worldCenterOf,
  type Pt,
} from './canvasLayout.ts'
import { childrenOf, subtreeIds } from './muralTree.ts'
import { DEFAULT_COLUMN_W, DEFAULT_GROUP_R, DEFAULT_TEXT_W, canvasFontScale, fitFontScale, plainLength } from './semantics.ts'
import { computeLayout, isColumn } from './packLayout.ts'
import { makeArrow, makeGroupElement, makeMarkdownElement, makeMuralRefElement, muralElementsFromMarkdown, newElementId, useMurales } from '../muralesStore.ts'
import { useCanvasDrag } from './useCanvasDrag.ts'
import { useCanvasViewport } from './useCanvasViewport.ts'

const CLICK_TOLERANCE = 3 // world units: below this, a "drag" is a click

// Selection-tool marquee shapes. 'square'/'ellipse' use the a→b box; 'draw' is
// a freehand lasso (the full point path). Coords are WORLD units.
type SelTool = 'square' | 'ellipse' | 'draw'
interface Marquee { tool: SelTool; a: Pt; b: Pt; pts: Pt[] }

// Level of detail: an element's apparent on-screen size (world size × zoom).
// Below LOD_HIDE px it isn't drawn; it ramps to full opacity by LOD_FULL. This
// is what makes deeper (smaller) content dissolve as you pull the camera back —
// no depth cap needed, the small things simply fade out of the frame.
const LOD_HIDE = 5
const LOD_FULL = 24

// Smoothly animate a node from its old packed slot to its new one — this is
// what turns the deterministic re-pack into visible fluid reflow. Disabled on
// the node being dragged so it tracks the pointer 1:1.
const REFLOW_TRANSITION =
  'left 280ms cubic-bezier(0.4, 0, 0.2, 1), top 280ms cubic-bezier(0.4, 0, 0.2, 1), width 200ms ease, height 200ms ease'

// Ray-casting point-in-polygon for the freehand lasso selection.
function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function lodOpacity(worldSize: number, scale: number): number {
  const apparent = worldSize * scale
  if (apparent >= LOD_FULL) return 1
  if (apparent <= LOD_HIDE) return 0
  return (apparent - LOD_HIDE) / (LOD_FULL - LOD_HIDE)
}

interface MuralCanvasViewProps {
  mural: YMural
  onChange: (patch: Partial<YMural>) => void
  readOnly?: boolean
  /** Navigate to another mural (from an embedded mural-ref card). */
  onOpenMural?: (muralId: string) => void
}

export function MuralCanvasView({ mural, onChange, readOnly, onOpenMural }: MuralCanvasViewProps) {
  const { elements } = mural
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { viewport, toWorld, planeStyle, bindBackground, fit } = useCanvasViewport(containerRef)
  // Multi-select: the ordered list of selected element ids. Single-select is
  // just a length-1 list; a marquee tool fills it with everything it covers.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const isSelected = (id: string) => selectedIds.includes(id)
  const selectOne = (id: string | null) => setSelectedIds(id ? [id] : [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ elementId: string; anchor: { top: number; right: number } } | null>(null)
  const [quickAdd, setQuickAdd] = useState(false)
  const [quickText, setQuickText] = useState('')
  const dragStartRef = useRef<Pt | null>(null)
  // Selection tool: null = normal move mode; otherwise a marquee shape drawn on
  // the background selects every element it covers.
  const [selTool, setSelTool] = useState<SelTool | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const marqueeRef = useRef<Marquee | null>(null)
  const setMarq = (m: Marquee | null) => { marqueeRef.current = m; setMarquee(m) }
  // For the "/m <texto>" embed search in the quick-add.
  const allMurales = useMurales((s) => s.murales)

  // Measured rendered heights of auto-height leaf boxes, so a column stacks its
  // children flush (0 gap) against their REAL heights, not a width estimate.
  const heightsRef = useRef(new Map<string, number>())
  const [heightTick, setHeightTick] = useState(0)
  function measure(id: string, node: HTMLElement | null) {
    if (!node) return
    const h = node.offsetHeight
    if (h <= 0) return
    const prev = heightsRef.current.get(id)
    if (prev === undefined || Math.abs(prev - h) > 1) {
      heightsRef.current.set(id, h)
      setHeightTick((t) => t + 1)
    }
  }

  // The fluid pack layout: every unpinned element's position (and group size)
  // is computed here, not stored — this is the reflow. Geometry, hit-testing
  // and rendering all read `baseLayout`, never the raw `elements`.
  const baseLayout = useMemo(() => computeLayout(elements, heightsRef.current, mural.arrows), [elements, heightTick, mural.arrows])
  const layoutRef = useRef(baseLayout)
  layoutRef.current = baseLayout

  // Frame all content once, the first time the mural has both elements and a
  // laid-out container. The button re-frames on demand thereafter.
  const didFitRef = useRef(false)
  useEffect(() => {
    if (didFitRef.current || baseLayout.length === 0) return
    let raf = 0
    const tryFit = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) { raf = requestAnimationFrame(tryFit); return }
      didFitRef.current = true
      fit(worldBounds(baseLayout))
    }
    tryFit()
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLayout])

  function fitAll() {
    fit(worldBounds(baseLayout))
  }

  function patchElements(next: MuralElement[]) {
    // A column that drops to a single child dissolves back to a lone element.
    onChange({ elements: dissolveThinColumns(next) })
  }

  function updateElement(id: string, patch: Partial<MuralElement>) {
    patchElements(elements.map((el) => (el.id === id ? { ...el, ...patch } : el)))
  }

  // ── Drag / click ───────────────────────────────────────────────────────────

  // Dropping an element PINS it where it lands (auto + manual pin model): its
  // x/y freeze and the rest of the pack flows around it. Hit-testing runs on
  // the computed layout so containment matches what's on screen.
  const { dragState, startDrag } = useCanvasDrag(viewport.scale, (elementId, world) => {
    const el = elements.find((e) => e.id === elementId)
    if (!el) return
    const layout = layoutRef.current
    const start = dragStartRef.current
    dragStartRef.current = null
    // A no-move drop is a click: select.
    if (start && Math.hypot(world.x - start.x, world.y - start.y) < CLICK_TOLERANCE) {
      if (!readOnly) selectOne(elementId)
      return
    }

    // 1. Snapped onto another block → stack into a column (above/below the
    //    block the pointer is over). Loose blocks form a new column; a block
    //    already in a column takes the dragged one in as a sibling.
    if (el.kind !== 'group') {
      const slot = hitColumnSlot(layout, world, elementId)
      if (slot) {
        patchElements(
          slot.parentColumnId
            ? insertIntoColumn(elements, elementId, slot.parentColumnId, slot.anchorId, slot.place)
            : makeColumnFromTexts(elements, slot.anchorId, elementId, newElementId(), slot.place),
        )
        return
      }
    }
    // 2. Dropped inside a group (circle or column card) → reparent as content;
    //    else move+pin within the same parent.
    const groupHit = hitGroup(layout, world, elementId)
    const local = toParentFrame(layout, world, groupHit)
    if (groupHit === el.parentId) {
      updateElement(elementId, { canvas: { ...el.canvas, x: local.x, y: local.y, pinned: true } })
    } else {
      // Reparent for structure, then overwrite the moved node's position with
      // the layout-derived local drop point and pin it.
      const moved = reparent(elements, elementId, groupHit, world).map((e) =>
        e.id === elementId ? { ...e, canvas: { ...e.canvas, x: local.x, y: local.y, pinned: true } } : e,
      )
      patchElements(moved)
    }
  })

  function beginDrag(el: MuralElement, e: React.PointerEvent) {
    if (readOnly) return
    e.stopPropagation()
    e.preventDefault()
    const world = worldCenterOf(layoutRef.current, el.id)
    dragStartRef.current = world
    startDrag(el.id, world, e)
  }

  // ── Corner resize (free on both axes; the text refits the box) ─────────────

  function beginResize(el: MuralElement, e: React.PointerEvent) {
    if (readOnly) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const startCanvas = el.canvas
    const id = el.id
    const kind = el.kind
    const scale = viewport.scale || 1
    function onMove(ev: PointerEvent) {
      const dw = (ev.clientX - startX) / scale
      const dh = (ev.clientY - startY) / scale
      // Resizing pins: a manual size only survives the pack when frozen.
      updateElement(id, { canvas: { ...applyResize(startCanvas, kind, dw, dh), pinned: true } })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // While dragging, everything else stays STATIC — only the dragged node (and
  // its subtree, via parent-relative coords) tracks the pointer over the frozen
  // base layout. The pack reorganizes once, on drop (the onDrop patch pins the
  // node and baseLayout recomputes).
  const liveElements = useMemo(() => {
    if (!dragState) return baseLayout
    const el = baseLayout.find((e) => e.id === dragState.elementId)
    if (!el) return baseLayout
    const local = toParentFrame(baseLayout, dragState.world, el.parentId)
    return baseLayout.map((e) =>
      e.id === dragState.elementId
        ? { ...e, canvas: { ...e.canvas, x: local.x, y: local.y } }
        : e,
    )
  }, [dragState, baseLayout])

  // The dragged element + all its descendants move as ONE UNIT (no per-child
  // reflow transition — they track the parent 1:1 instead of easing after it).
  const draggedSubtree = useMemo(
    () => (dragState ? subtreeIds(elements, dragState.elementId) : null),
    [dragState, elements],
  )
  const inDrag = (id: string) => !!draggedSubtree?.has(id)

  function depthOf(el: MuralElement): number {
    let d = 0
    let cur = el.parentId
    const byId = new Map(elements.map((e) => [e.id, e]))
    while (cur !== undefined) {
      d++
      cur = byId.get(cur)?.parentId
    }
    return d
  }

  // ── Creation ───────────────────────────────────────────────────────────────

  // Everything created lands in one default grouping (the first root circle),
  // created on demand. New content is unpinned, so the pack places it.
  function rootGroups(): MuralElement[] {
    return elements.filter((e) => e.parentId === undefined && e.kind === 'group')
  }

  function ensureDefaultGroup(): { els: MuralElement[]; parentId: string } {
    const existing = rootGroups()[0]
    if (existing) return { els: elements, parentId: existing.id }
    const g = makeGroupElement(undefined, elements.filter((e) => e.parentId === undefined))
    return { els: [...elements, g], parentId: g.id }
  }

  function addText(text = '', edit = true) {
    const { els, parentId } = ensureDefaultGroup()
    const el = makeMarkdownElement(text, parentId, childrenOf(els, parentId))
    patchElements([...els, el])
    selectOne(el.id)
    if (edit) setEditingId(el.id)
    return el
  }

  // Embed another mural as a root-level mural-ref block (recursion). It lands
  // loose so the user can drag it into a column/circle.
  function addMuralRef(refId: string) {
    const roots = elements.filter((e) => e.parentId === undefined)
    const el = makeMuralRefElement(refId, undefined, roots)
    patchElements([...elements, el])
    selectOne(el.id)
  }

  // Murales matching a "/m <texto>" quick-add query (title contains).
  function refSearch(query: string): YMural[] {
    const q = query.trim().toLowerCase()
    return allMurales.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 8)
  }
  const refMatch = quickAdd ? quickText.match(/^\/m\s+(.*)$/i) : null
  const refResults = refMatch ? refSearch(refMatch[1] ?? '') : []

  // Enter: "/m …" embeds the first matching mural; otherwise send the text to
  // the mural. The pack places new content; it stays selected.
  function submitQuickAdd() {
    if (refMatch) {
      const hit = refResults[0]
      if (hit) { addMuralRef(hit.id); setQuickText(''); setQuickAdd(false) }
      return
    }
    const text = quickText.trim()
    if (!text) return
    addText(text, false)
    setQuickText('')
    setQuickAdd(false)
  }

  // "Convertir a mind-map": rebuild the canvas from the document's markdown,
  // split into columns by heading. Reorganizes the existing markdown blocks.
  function convertToColumns() {
    const md = elements
      .filter((e) => e.kind === 'markdown')
      .map((e) => e.text ?? '')
      .filter((t) => t.trim())
      .join('\n\n')
    if (!md.trim()) return
    if (!confirm('¿Convertir a mind-map? Los bloques de texto se reorganizan en columnas por título.')) return
    patchElements(muralElementsFromMarkdown(md))
    setSelectedIds([])
    setEditingId(null)
  }

  // ── Selection tool (marquee) + contextual grouping ──────────────────────────

  function toggleTool(t: SelTool) {
    setSelTool((cur) => (cur === t ? null : t))
    setMarq(null)
  }

  // Elements whose center falls inside the marquee shape (world coords).
  function selectInMarquee(m: Marquee) {
    const minX = Math.min(m.a.x, m.b.x)
    const maxX = Math.max(m.a.x, m.b.x)
    const minY = Math.min(m.a.y, m.b.y)
    const maxY = Math.max(m.a.y, m.b.y)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const rx = Math.max(1, (maxX - minX) / 2)
    const ry = Math.max(1, (maxY - minY) / 2)
    const inside = (p: Pt): boolean => {
      if (m.tool === 'square') return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
      if (m.tool === 'ellipse') return ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 <= 1
      return pointInPolygon(p, m.pts)
    }
    const ids: string[] = []
    for (const el of layoutRef.current) {
      if (inside(worldCenterOf(layoutRef.current, el.id))) ids.push(el.id)
    }
    setSelectedIds(ids)
  }

  function startMarquee(e: React.PointerEvent) {
    if (!selTool) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const a = toWorld(e)
    setMarq({ tool: selTool, a, b: a, pts: [a] })
    function onMove(ev: PointerEvent) {
      const p = toWorld(ev)
      const cur = marqueeRef.current
      if (!cur) return
      setMarq(cur.tool === 'draw' ? { ...cur, b: p, pts: [...cur.pts, p] } : { ...cur, b: p })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const cur = marqueeRef.current
      if (cur) selectInMarquee(cur)
      setMarq(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ── Connections (mind-map graph edges) ──────────────────────────────────────

  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const connectFromRef = useRef<string | null>(null)
  const [connectTo, setConnectTo] = useState<Pt | null>(null)

  function addArrow(from: string, to: string) {
    const existing = mural.arrows ?? []
    if (existing.some((a) => (a.from === from && a.to === to) || (a.from === to && a.to === from))) return
    onChange({ arrows: [...existing, makeArrow(from, to)] })
  }

  // Drag from a node's connect port to another node → create an edge.
  function beginConnect(el: MuralElement, e: React.PointerEvent) {
    if (readOnly) return
    e.stopPropagation()
    e.preventDefault()
    connectFromRef.current = el.id
    setConnectFrom(el.id)
    setConnectTo(worldCenterOf(layoutRef.current, el.id))
    function onMove(ev: PointerEvent) { setConnectTo(toWorld(ev)) }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const from = connectFromRef.current
      connectFromRef.current = null
      setConnectFrom(null)
      setConnectTo(null)
      if (!from) return
      const world = toWorld(ev)
      const target = hitBlock(layoutRef.current, world, from) ?? hitGroup(layoutRef.current, world, from)
      if (target && target !== from) addArrow(from, target)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function connectHandle(el: MuralElement) {
    if (readOnly || selectedIds.length !== 1 || !isSelected(el.id)) return null
    return (
      <div
        className="mural-connect-handle"
        title="Conectar a otro nodo"
        onPointerDown={(e) => beginConnect(el, e)}
      />
    )
  }

  function groupSelected(layout: 'column' | 'mindmap') {
    if (selectedIds.length < 2) return
    const gid = newElementId()
    patchElements(groupElements(elements, selectedIds, gid, layout))
    setSelectedIds([gid])
  }

  function removeElement(el: MuralElement) {
    const doomed = subtreeIds(elements, el.id)
    patchElements(elements.filter((e) => !doomed.has(e.id)))
    setSelectedIds((ids) => ids.filter((id) => !doomed.has(id)))
    if (editingId && doomed.has(editingId)) setEditingId(null)
  }

  function removeSelected() {
    if (selectedIds.length === 0) return
    const doomed = new Set<string>()
    for (const id of selectedIds) for (const x of subtreeIds(elements, id)) doomed.add(x)
    patchElements(elements.filter((e) => !doomed.has(e.id)))
    setSelectedIds([])
    if (editingId && doomed.has(editingId)) setEditingId(null)
  }

  // Delete/Backspace removes the selection; Esc clears it (or exits the tool).
  useEffect(() => {
    if (readOnly) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSelTool(null); setSelectedIds([]); return }
      if (editingId || quickAdd || selectedIds.length === 0) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      e.preventDefault()
      removeSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, editingId, quickAdd, elements, readOnly])

  function menuItemsFor(el: MuralElement): CellMenuItem[] {
    const items: CellMenuItem[] = []
    // Convert a group between the two groupings (block ↔ mind-map).
    if (el.kind === 'group') {
      const toMindmap = isColumn(el)
      items.push({
        id: 'convert',
        label: toMindmap ? 'Convertir a mind-map' : 'Convertir a bloque',
        icon: toMindmap ? '◯' : '▤',
        onSelect: () => patchElements(setGroupLayout(elements, el.id, toMindmap ? 'mindmap' : 'column')),
      })
    }
    if (el.canvas.pinned) {
      items.push({
        id: 'unpin',
        label: 'Auto-ordenar',
        icon: '🧲',
        onSelect: () => updateElement(el.id, { canvas: { ...el.canvas, pinned: false } }),
      })
    }
    items.push({ id: 'delete', label: 'Eliminar', icon: '🗑️', danger: true, onSelect: () => removeElement(el) })
    return items
  }

  function openMenu(el: MuralElement, e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    selectOne(el.id)
    setMenu({ elementId: el.id, anchor: { top: e.clientY + 4, right: window.innerWidth - e.clientX } })
  }

  function resizeHandle(el: MuralElement) {
    // One selection at a time gets a handle; column cards auto-size so they don't.
    if (readOnly || selectedIds.length !== 1 || !isSelected(el.id)) return null
    if (el.kind === 'group' && isColumn(el)) return null
    return (
      <div
        className="mural-resize-handle"
        title="Redimensionar (libre en ambos ejes)"
        onPointerDown={(e) => beginResize(el, e)}
      />
    )
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  const sorted = [...liveElements].sort((a, b) => depthOf(a) - depthOf(b))
  const menuElement = menu ? elements.find((e) => e.id === menu.elementId) : undefined

  return (
    <div
      ref={containerRef}
      className="mural-canvas-view"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none', cursor: selTool ? 'crosshair' : undefined }}
      onPointerDown={(e) => {
        if (selTool && e.target === e.currentTarget) { startMarquee(e); return }
        bindBackground.onPointerDown(e)
      }}
      onDoubleClick={(e) => {
        if (readOnly || e.target !== e.currentTarget) return
        setQuickAdd(true)
        setQuickText('')
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !selTool) {
          setSelectedIds([])
          setEditingId(null)
        }
      }}
    >
      {/* Action row (top-left). Future: categorized into groups. */}
      {!readOnly && (
        <div className="mural-canvas-toolbar">
          <button className="mural-tool-btn" title="Nuevo elemento (abre el buscador)" onClick={() => { setQuickAdd(true); setQuickText('') }}>＋</button>
          <span className="mural-tool-sep" />
          <button className={`mural-tool-btn${selTool === 'square' ? ' active' : ''}`} title="Selección rectangular" onClick={() => toggleTool('square')}>▭</button>
          <button className={`mural-tool-btn${selTool === 'ellipse' ? ' active' : ''}`} title="Selección elíptica" onClick={() => toggleTool('ellipse')}>⬭</button>
          <button className={`mural-tool-btn${selTool === 'draw' ? ' active' : ''}`} title="Selección a mano alzada (lazo)" onClick={() => toggleTool('draw')}>✎</button>
          <span className="mural-tool-sep" />
          <button className="mural-tool-btn" title="Convertir a mind-map: dividir el documento en columnas por título" onClick={convertToColumns}>⤵</button>
          <button className="mural-tool-btn" title="Centrar todo en la vista" onClick={fitAll}>⛶</button>
        </div>
      )}

      {/* The transformed plane */}
      <div style={planeStyle}>
        {/* Edges (mind-map connections) + the live connect line, in world coords */}
        <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', left: 0, top: 0 }} width="1" height="1">
          {(mural.arrows ?? []).map((a) => {
            if (!elements.some((e) => e.id === a.from) || !elements.some((e) => e.id === a.to)) return null
            const p1 = worldCenterOf(liveElements, a.from)
            const p2 = worldCenterOf(liveElements, a.to)
            return (
              <line
                key={a.id}
                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke="var(--accent)" strokeWidth={1.5} opacity={0.55}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
          {connectFrom && connectTo && (() => {
            const p1 = worldCenterOf(liveElements, connectFrom)
            return (
              <line
                x1={p1.x} y1={p1.y} x2={connectTo.x} y2={connectTo.y}
                stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
            )
          })()}
        </svg>

        {/* Marquee preview (world coords, so it rides the pan/zoom) */}
        {marquee && (() => {
          const minX = Math.min(marquee.a.x, marquee.b.x)
          const minY = Math.min(marquee.a.y, marquee.b.y)
          const w = Math.abs(marquee.b.x - marquee.a.x)
          const h = Math.abs(marquee.b.y - marquee.a.y)
          if (marquee.tool === 'draw') {
            return (
              <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', left: 0, top: 0 }} width="1" height="1">
                <polygon
                  points={marquee.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="color-mix(in srgb, var(--accent) 12%, transparent)"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )
          }
          return (
            <div
              className="mural-marquee"
              style={{
                position: 'absolute',
                left: minX,
                top: minY,
                width: w,
                height: h,
                borderRadius: marquee.tool === 'ellipse' ? '50%' : 4,
                pointerEvents: 'none',
              }}
            />
          )
        })()}

        {sorted.map((el) => {
          const c = worldCenterOf(liveElements, el.id)
          const depth = depthOf(el)
          const isDragged = dragState?.elementId === el.id
          const selected = isSelected(el.id)

          // Level of detail: cull below LOD_HIDE apparent px. Anything the user
          // is acting on stays pinned visible regardless of zoom.
          const keepVisible = selected || isDragged || editingId === el.id
          const column = el.kind === 'group' && isColumn(el)
          const worldSize = el.kind === 'group'
            ? (column ? (el.canvas.w ?? DEFAULT_COLUMN_W) : 2 * (el.canvas.r ?? DEFAULT_GROUP_R))
            : (el.canvas.w ?? DEFAULT_TEXT_W)
          const lod = keepVisible ? 1 : lodOpacity(worldSize, viewport.scale)
          if (lod === 0) return null
          const faint = lod < 0.3 // too dim to click through — let the plane pan

          if (el.kind === 'group') {
            // Column card (markdown document) — a rounded rectangle behind the
            // stacked children, which render as their own boxes on top.
            if (column) {
              const { w, h } = columnRectOf(liveElements, el)
              return (
                <div
                  key={el.id}
                  className={`mural-column${selected ? " selected" : ""}`}
                  style={{
                    position: 'absolute',
                    left: c.x - w / 2,
                    top: c.y - h / 2,
                    width: w,
                    height: h,
                    zIndex: depth,
                    opacity: (isDragged ? 0.75 : 1) * lod,
                    pointerEvents: faint ? 'none' : undefined,
                    transition: inDrag(el.id) ? 'none' : REFLOW_TRANSITION,
                  }}
                  onPointerDown={(e) => beginDrag(el, e)}
                  onContextMenu={(e) => openMenu(el, e)}
                >
                  {resizeHandle(el)}
                  {connectHandle(el)}
                </div>
              )
            }
            const r = el.canvas.r ?? DEFAULT_GROUP_R
            return (
              <div
                key={el.id}
                className={`mural-circle${selected ? " selected" : ""}`}
                style={{
                  position: 'absolute',
                  left: c.x - r,
                  top: c.y - r,
                  width: 2 * r,
                  height: 2 * r,
                  zIndex: depth,
                  opacity: (isDragged ? 0.75 : 1) * lod,
                  pointerEvents: faint ? 'none' : undefined,
                  transition: inDrag(el.id) ? 'none' : REFLOW_TRANSITION,
                }}
                onPointerDown={(e) => beginDrag(el, e)}
                onContextMenu={(e) => openMenu(el, e)}
              >
                {resizeHandle(el)}
                  {connectHandle(el)}
              </div>
            )
          }

          const w = el.canvas.w ?? DEFAULT_TEXT_W
          const editing = editingId === el.id && !readOnly
          // Resized boxes (explicit height) fit the text to the box on both
          // axes; auto boxes keep the width-based content scale.
          const scale = el.kind === 'markdown'
            ? (el.canvas.h !== undefined
                ? fitFontScale(plainLength(el.text ?? ''), w, el.canvas.h)
                : canvasFontScale(plainLength(el.text ?? ''), w))
            : 1
          return (
            <div
              key={el.id}
              ref={el.canvas.h === undefined ? (n) => measure(el.id, n) : undefined}
              className={`mural-canvas-box${editing ? ' focused' : ''}${selected ? " selected" : ""}`}
              style={{
                position: 'absolute',
                left: c.x - w / 2,
                top: c.y,
                transform: 'translateY(-50%)',
                width: w,
                height: el.canvas.h,
                overflow: el.canvas.h !== undefined ? 'hidden' : undefined,
                zIndex: depth + 1,
                opacity: (isDragged ? 0.85 : 1) * lod,
                pointerEvents: faint ? 'none' : undefined,
                transition: inDrag(el.id) ? 'none' : REFLOW_TRANSITION,
              }}
              onPointerDown={(e) => { if (!editing) beginDrag(el, e) }}
              onDoubleClick={(e) => {
                if (readOnly || el.kind !== 'markdown') return
                e.stopPropagation()
                setEditingId(el.id)
              }}
              onContextMenu={(e) => openMenu(el, e)}
            >
              {el.kind === 'mural-ref' ? (
                <MuralRefCard refId={el.refId} selfId={mural.id} onOpen={onOpenMural} />
              ) : el.kind === 'file' && el.file ? (
                <FileCard file={el.file} />
              ) : (
                <div
                  style={{ fontSize: `${scale}em` }}
                  onKeyDownCapture={(e) => { if (e.key === 'Escape') setEditingId(null) }}
                >
                  <MarkdownEditor
                    key={`${el.id}:${editing ? 'edit' : 'read'}`}
                    value={el.text ?? ''}
                    onChange={(text: string) => updateElement(el.id, { text })}
                    readOnly={!editing}
                    richFormatting
                    autoFocus={editing}
                    placeholder="Texto…"
                    density="compact"
                  />
                </div>
              )}
              {resizeHandle(el)}
                  {connectHandle(el)}
            </div>
          )
        })}
      </div>

      {/* Contextual bottom action row — appears while there's a selection. It
          acts on the selection (group when ≥2, delete, clear). Future: more
          context-aware actions here. */}
      {!readOnly && selectedIds.length > 0 && (
        <div className="mural-context-bar">
          <span className="mural-context-count">{selectedIds.length} seleccionado{selectedIds.length > 1 ? 's' : ''}</span>
          {selectedIds.length >= 2 && (
            <>
              <span className="mural-tool-sep" />
              <button className="mural-context-btn" title="Agrupar en bloque (documento)" onClick={() => groupSelected('column')}>▤ Bloque</button>
              <button className="mural-context-btn" title="Agrupar en mind-map" onClick={() => groupSelected('mindmap')}>◯ Mind-map</button>
            </>
          )}
          <span className="mural-tool-sep" />
          <button className="mural-context-btn danger" title="Eliminar selección" onClick={removeSelected}>🗑️</button>
          <button className="mural-context-btn" title="Deseleccionar" onClick={() => setSelectedIds([])}>✕</button>
        </div>
      )}

      {/* Quick-add omnibar */}
      {quickAdd && !readOnly && (
        <div
          className="mural-quickadd-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setQuickAdd(false) }}
        >
          <div className="mural-quickadd">
            <input
              autoFocus
              value={quickText}
              placeholder="Escribe una idea, o /m para embeber un mural…"
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitQuickAdd() }
                if (e.key === 'Escape') setQuickAdd(false)
              }}
            />
            {refMatch ? (
              <div className="mural-ref-results">
                {refResults.length === 0 ? (
                  <div className="mural-ref-result empty">Sin murales que coincidan</div>
                ) : (
                  refResults.map((m) => (
                    <button
                      key={m.id}
                      className="mural-ref-result"
                      onClick={() => { addMuralRef(m.id); setQuickText(''); setQuickAdd(false) }}
                    >
                      <span>{m.emoji ?? '🧱'} {m.title || 'Sin título'}</span>
                      {m.id === mural.id && <span className="mural-ref-self">este mural</span>}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <span className="mural-quickadd-hint">Enter envía al mural · <b>/m</b> embebe otro mural · Esc cierra</span>
            )}
          </div>
        </div>
      )}

      {menu && menuElement && (
        <CellMenu items={menuItemsFor(menuElement)} anchor={menu.anchor} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}

// An embedded reference to another mural. Renders a shallow card (emoji, title,
// block count) — deliberately NOT a live nested canvas, so recursion can never
// loop: you open the target to descend into it. Self-references are labelled.
export function MuralRefCard({ refId, selfId, onOpen }: {
  refId?: string
  selfId: string
  onOpen?: (muralId: string) => void
}) {
  const target = useMurales((s) => (refId ? s.murales.find((m) => m.id === refId) : undefined))
  if (!refId) return <div className="mural-ref-card missing">Referencia vacía</div>
  if (!target) return <div className="mural-ref-card missing">🔗 Mural no encontrado</div>
  const blocks = target.elements.filter((e) => e.kind === 'markdown' && (e.text ?? '').trim() !== '').length
  const isSelf = refId === selfId
  return (
    <div className="mural-ref-card">
      <div className="mural-ref-head">
        <span className="mural-ref-title">{target.emoji ?? '🧱'} {target.title || 'Sin título'}</span>
        {onOpen && (
          <button
            className="mural-ref-open"
            title="Abrir mural"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onOpen(refId) }}
          >
            ↗
          </button>
        )}
      </div>
      <div className="mural-ref-meta">
        {blocks > 0 ? `📝 ${blocks} bloques` : 'vacío'}{isSelf ? ' · ↻ este mural' : ''}
      </div>
    </div>
  )
}
