// The mural DOCUMENT view: a document flow mixed with a free grid, in one
// canvas. v2: elements form a tree (parentId) — groups render as nested
// sections whose title is chosen by the shared semantics (densidad continuum),
// so the same group reads as a circle in the canvas view and a titled section
// here.
//
// Two layers share one relative container:
//   1. Flow layer — normal CSS vertical flow of ROOT elements, order = array
//      order. Groups nest recursively inside as sections.
//   2. Absolute layer — ROOT elements pinned at fractional grid coordinates
//      (0.5 lattice). Absolute pinning is root-only in v1; nested children
//      always flow inside their group (the canvas view is the spatial view
//      for nested content).
//
// Locked (default): 5 base columns, drops clamp inside them. Unlocked: extra
// columns left/right and rows above via extents; the canonical origin never
// moves, so re-locking never rewrites element positions.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CellMenu, type CellMenuItem } from '@muralink/ui'
import { MarkdownEditor } from '@muralink/editor'
import type { MuralElement, YMural } from '../../../types.ts'
import { FileCard } from '../components/FileCard.tsx'
import {
  clampLocked,
  elementRect,
  growExtents,
  mergeMarkdown,
  originOffset,
  splitBlocks,
  visibleColumns,
} from './muralLayout.ts'
import { childrenOf, reorderSibling, rootsOf, subtreeIds } from './muralTree.ts'
import { isColumn } from './packLayout.ts'
import { insertIntoColumn, makeColumnFromTexts } from './canvasLayout.ts'
import { densidad, fontScaleFor, groupTitle, nominalArea, plainLength } from './semantics.ts'
import { makeGroupElement, makeMarkdownElement, newElementId } from '../muralesStore.ts'
import { useMuralDrag } from './useMuralDrag.ts'

const FLOW_GAP = 8
const DEFAULT_ABS_WIDTH = 2

interface MuralCanvasProps {
  mural: YMural
  onChange: (patch: Partial<YMural>) => void
  readOnly?: boolean
  /** Host-provided upload flow; button hidden when absent. */
  onAddFile?: () => void
  /** Uploads in flight — rendered as instant placeholder cards with a spinner. */
  pendingFiles?: { id: string; name: string }[]
}

export function MuralCanvas({ mural, onChange, readOnly, onAddFile, pendingFiles }: MuralCanvasProps) {
  const { grid, elements } = mural
  const containerRef = useRef<HTMLDivElement | null>(null)
  const flowItemRefs = useRef(new Map<string, HTMLDivElement>())
  const [width, setWidth] = useState(0)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ elementId: string; anchor: { top: number; right: number } } | null>(null)

  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return
    const ro = new ResizeObserver(() => setWidth(node.clientWidth))
    ro.observe(node)
    setWidth(node.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!readOnly) return
    setFocusedId(null)
    setMenu(null)
  }, [readOnly])

  const cols = visibleColumns(grid)
  const colW = width > 0 ? width / cols : 0
  const origin = originOffset(grid)

  function patchElements(next: MuralElement[], gridPatch?: Partial<YMural['grid']>) {
    onChange(gridPatch ? { elements: next, grid: { ...grid, ...gridPatch } } : { elements: next })
  }

  function updateElement(id: string, patch: Partial<MuralElement>) {
    patchElements(elements.map((el) => (el.id === id ? { ...el, ...patch } : el)))
  }

  // ── Drag (root elements only; nested content is spatial in the canvas view) ─

  const startRenderRef = useRef<{ x: number; y: number } | null>(null)

  const { dragState, startDrag } = useMuralDrag(grid, colW || 1, (elementId, canonical) => {
    const el = elements.find((e) => e.id === elementId)
    if (!el) return
    const w = el.doc.placement === 'absolute' ? (el.doc.abs?.w ?? DEFAULT_ABS_WIDTH) : DEFAULT_ABS_WIDTH

    // A flow element dragged mostly vertically is a reorder, not a promotion.
    if (el.doc.placement === 'flow' && startRenderRef.current) {
      const dx = Math.abs(canonical.x + origin.col - startRenderRef.current.x)
      if (dx < 0.75) {
        reorderFlow(elementId, canonical.y + origin.row)
        return
      }
    }

    const abs = { x: canonical.x, y: canonical.y, w, h: el.doc.abs?.h }
    if (grid.locked) {
      const clamped = clampLocked(abs, w, grid)
      updateElement(elementId, { doc: { placement: 'absolute', abs: { ...abs, ...clamped } } })
    } else {
      const nextGrid = growExtents(grid, abs, w)
      patchElements(
        elements.map((e) => (e.id === elementId ? { ...e, doc: { placement: 'absolute' as const, abs } } : e)),
        nextGrid !== grid ? nextGrid : undefined,
      )
    }
  })

  function beginDrag(el: MuralElement, e: React.PointerEvent) {
    if (readOnly || colW === 0 || el.parentId !== undefined) return
    let startRender: { x: number; y: number }
    if (el.doc.placement === 'absolute' && el.doc.abs) {
      startRender = { x: el.doc.abs.x + origin.col, y: el.doc.abs.y + origin.row }
    } else {
      const node = flowItemRefs.current.get(el.id)
      const canvas = containerRef.current
      if (!node || !canvas) return
      const nodeRect = node.getBoundingClientRect()
      const canvasRect = canvas.getBoundingClientRect()
      startRender = {
        x: (nodeRect.left - canvasRect.left) / colW,
        y: (nodeRect.top - canvasRect.top) / grid.rowUnit,
      }
    }
    startRenderRef.current = startRender
    const w = el.doc.placement === 'absolute' ? (el.doc.abs?.w ?? DEFAULT_ABS_WIDTH) : DEFAULT_ABS_WIDTH
    startDrag(el.id, startRender, w, e)
  }

  /** Reinsert a root flow element at the drop's vertical position among its root flow siblings. */
  function reorderFlow(elementId: string, dropRenderY: number) {
    const canvas = containerRef.current
    if (!canvas) return
    const canvasRect = canvas.getBoundingClientRect()
    const flowIds = rootsOf(elements)
      .filter((e) => e.doc.placement === 'flow' && e.id !== elementId)
      .map((e) => e.id)
    let insertAfter: string | null = null
    for (const id of flowIds) {
      const node = flowItemRefs.current.get(id)
      if (!node) continue
      const rect = node.getBoundingClientRect()
      const midY = (rect.top + rect.height / 2 - canvasRect.top) / grid.rowUnit
      if (dropRenderY > midY) insertAfter = id
    }
    patchElements(reorderSibling(elements, elementId, insertAfter))
  }

  // ── Left-gutter reorder (drag any element among its siblings) ───────────────
  // The left padding of every document element is a drag handle. Dragging
  // reorders the element within its parent's flow — and since sibling order is
  // the shared array order, the change is mirrored in the canvas (a column
  // restacks, a bubble is unaffected spatially). Circles/columns both reorder.

  const [reorderId, setReorderId] = useState<string | null>(null)
  const [dropY, setDropY] = useState<number | null>(null)
  const [mergeId, setMergeId] = useState<string | null>(null)

  // A sibling whose box CENTER band the pointer is over → merge into a block,
  // not reorder. (The edges/gaps stay a reorder.) Returns the target + which
  // side the dragged block joins on.
  function hitMergeTarget(clientY: number, parentId: string | undefined, selfId: string): { id: string; place: 'above' | 'below' } | null {
    const sibs = childrenOf(elements, parentId).filter((s) => s.id !== selfId && s.doc.placement === 'flow' && s.kind !== 'group')
    for (const s of sibs) {
      const node = flowItemRefs.current.get(s.id)
      if (!node) continue
      const r = node.getBoundingClientRect()
      const band = r.height * 0.25
      if (clientY > r.top + band && clientY < r.bottom - band) {
        return { id: s.id, place: clientY < r.top + r.height / 2 ? 'above' : 'below' }
      }
    }
    return null
  }

  // Insertion point among `parentId`'s flow siblings for a pointer at clientY:
  // the sibling to insert AFTER (null = before all), plus a container-relative
  // Y for the drop indicator line.
  function computeInsert(clientY: number, parentId: string | undefined, selfId: string) {
    const canvas = containerRef.current
    if (!canvas) return { insertAfter: null as string | null, lineY: null as number | null }
    const crect = canvas.getBoundingClientRect()
    const sibs = childrenOf(elements, parentId).filter((s) => s.id !== selfId && s.doc.placement === 'flow')
    let insertAfter: string | null = null
    let lineY: number | null = null
    for (const s of sibs) {
      const node = flowItemRefs.current.get(s.id)
      if (!node) continue
      const r = node.getBoundingClientRect()
      if (clientY > r.top + r.height / 2) { insertAfter = s.id; lineY = r.bottom - crect.top }
    }
    if (insertAfter === null && sibs[0]) {
      const first = flowItemRefs.current.get(sibs[0].id)
      if (first) lineY = first.getBoundingClientRect().top - crect.top
    }
    return { insertAfter, lineY }
  }

  function beginReorder(el: MuralElement, e: React.PointerEvent) {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    setReorderId(el.id)
    const parentId = el.parentId
    function onMove(ev: PointerEvent) {
      const merge = el.kind !== 'group' ? hitMergeTarget(ev.clientY, parentId, el.id) : null
      setMergeId(merge?.id ?? null)
      setDropY(merge ? null : computeInsert(ev.clientY, parentId, el.id).lineY)
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setReorderId(null)
      setDropY(null)
      setMergeId(null)
      // Dropped onto a sibling's body → merge the two into a block (column);
      // dropped in a gap → reorder. Merge reuses the canvas column helpers so
      // the resulting order matches both views.
      const merge = el.kind !== 'group' ? hitMergeTarget(ev.clientY, parentId, el.id) : null
      if (merge) {
        const target = elements.find((x) => x.id === merge.id)!
        const targetParent = target.parentId !== undefined ? elements.find((x) => x.id === target.parentId) : undefined
        patchElements(
          targetParent && isColumn(targetParent)
            ? insertIntoColumn(elements, el.id, targetParent.id, merge.id, merge.place)
            : makeColumnFromTexts(elements, merge.id, el.id, newElementId(), merge.place),
        )
        return
      }
      patchElements(reorderSibling(elements, el.id, computeInsert(ev.clientY, parentId, el.id).insertAfter))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function dragGutter(el: MuralElement) {
    if (readOnly) return null
    return (
      <div
        className="mural-drag-gutter"
        title="Arrastrar para reordenar"
        onPointerDown={(e) => beginReorder(el, e)}
      >
        ⠿
      </div>
    )
  }

  // ── Element actions ────────────────────────────────────────────────────────

  function promoteToGrid(el: MuralElement) {
    const roots = rootsOf(elements)
    const maxY = roots
      .filter((e) => e.doc.placement === 'absolute' && e.doc.abs)
      .reduce((m, e) => Math.max(m, e.doc.abs!.y + (e.doc.abs!.h ?? 2)), 0)
    updateElement(el.id, {
      doc: { placement: 'absolute', abs: { x: 0, y: Math.ceil(maxY), w: DEFAULT_ABS_WIDTH } },
    })
  }

  function demoteToFlow(el: MuralElement) {
    updateElement(el.id, { doc: { placement: 'flow' } })
  }

  function popFromGroup(el: MuralElement) {
    if (el.parentId === undefined) return
    const parent = elements.find((e) => e.id === el.parentId)
    patchElements(elements.map((e) => (e.id === el.id ? { ...e, parentId: parent?.parentId } : e)))
  }

  function splitElement(el: MuralElement) {
    if (el.kind !== 'markdown' || !el.text) return
    const blocks = splitBlocks(el.text)
    if (blocks.length < 2) return
    const idx = elements.findIndex((e) => e.id === el.id)
    const parts: MuralElement[] = blocks.map((b, i) => ({
      id: i === 0 ? el.id : `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`,
      kind: 'markdown',
      text: b.text,
      parentId: el.parentId,
      doc: i === 0 ? el.doc : { placement: 'flow' },
      canvas: i === 0 ? el.canvas : { ...el.canvas, y: el.canvas.y + i * 40 },
    }))
    patchElements([...elements.slice(0, idx), ...parts, ...elements.slice(idx + 1)])
  }

  function mergeWithPrevious(el: MuralElement) {
    const siblings = childrenOf(elements, el.parentId).filter((e) => e.doc.placement === 'flow')
    const pos = siblings.findIndex((e) => e.id === el.id)
    const prev = siblings[pos - 1]
    if (!prev || prev.kind !== 'markdown' || el.kind !== 'markdown') return
    const merged = elements
      .filter((e) => e.id !== el.id)
      .map((e) => (e.id === prev.id ? { ...e, text: mergeMarkdown(prev.text ?? '', el.text ?? '') } : e))
    patchElements(merged)
  }

  function removeElement(el: MuralElement) {
    const doomed = subtreeIds(elements, el.id)
    patchElements(elements.filter((e) => !doomed.has(e.id)))
  }

  function addMarkdown(parentId?: string) {
    const el = makeMarkdownElement('', parentId, childrenOf(elements, parentId))
    patchElements([...insertUnderParent(el, parentId)])
    setFocusedId(el.id)
  }

  function addGroup() {
    const el = makeGroupElement(undefined, rootsOf(elements))
    patchElements([...elements, el])
  }

  /** Append into the flat array right after the parent's subtree (or at end). */
  function insertUnderParent(el: MuralElement, parentId?: string): MuralElement[] {
    if (parentId === undefined) return [...elements, el]
    const subtree = subtreeIds(elements, parentId)
    let at = -1
    elements.forEach((e, i) => {
      if (subtree.has(e.id)) at = i
    })
    return [...elements.slice(0, at + 1), el, ...elements.slice(at + 1)]
  }

  function menuItemsFor(el: MuralElement): CellMenuItem[] {
    const items: CellMenuItem[] = []
    if (el.parentId !== undefined) {
      items.push({ id: 'pop', label: 'Sacar del grupo', icon: '⬆️', group: 'place', onSelect: () => popFromGroup(el) })
    } else if (el.doc.placement === 'flow') {
      items.push({ id: 'pin', label: 'Fijar en cuadrícula', icon: '📌', group: 'place', onSelect: () => promoteToGrid(el) })
    } else {
      items.push({ id: 'unpin', label: 'Volver al flujo', icon: '↩️', group: 'place', onSelect: () => demoteToFlow(el) })
    }
    if (el.kind === 'markdown') {
      const blocks = splitBlocks(el.text ?? '')
      items.push({
        id: 'split',
        label: 'Dividir bloques',
        icon: '✂️',
        group: 'edit',
        disabled: blocks.length < 2,
        onSelect: () => splitElement(el),
      })
      if (el.doc.placement === 'flow') {
        const siblings = childrenOf(elements, el.parentId).filter((e) => e.doc.placement === 'flow')
        const pos = siblings.findIndex((e) => e.id === el.id)
        const prev = siblings[pos - 1]
        items.push({
          id: 'merge',
          label: 'Unir con anterior',
          icon: '🔗',
          group: 'edit',
          disabled: !prev || prev.kind !== 'markdown',
          onSelect: () => mergeWithPrevious(el),
        })
      }
    }
    if (el.kind === 'group') {
      items.push({ id: 'add-text', label: 'Añadir texto al grupo', icon: '📝', group: 'edit', onSelect: () => addMarkdown(el.id) })
    }
    items.push({ id: 'delete', label: 'Eliminar', icon: '🗑️', danger: true, group: 'danger', onSelect: () => removeElement(el) })
    return items
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function renderMarkdown(el: MuralElement, fontScale?: number) {
    const focused = focusedId === el.id && !readOnly
    return (
      <div
        onClick={() => { if (!readOnly && !focused) setFocusedId(el.id) }}
        onKeyDownCapture={(e) => { if (e.key === 'Escape') setFocusedId(null) }}
        className="mural-element-md"
        style={{ minHeight: 24, fontSize: fontScale ? `${fontScale}em` : undefined }}
      >
        <MarkdownEditor
          key={`${el.id}:${focused ? 'edit' : 'read'}`}
          value={el.text ?? ''}
          onChange={(text: string) => updateElement(el.id, { text })}
          readOnly={!focused}
          richFormatting
          autoFocus={focused}
          placeholder="Escribe algo…"
        />
      </div>
    )
  }

  function renderContent(el: MuralElement) {
    if (el.kind === 'file' && el.file) return <FileCard file={el.file} />
    if (el.kind === 'markdown') return renderMarkdown(el)
    if (el.kind === 'group') return renderGroup(el)
    // Embedded mural reference — the canvas view renders the live card; the doc
    // view shows a compact chip so the block stays visible here too.
    if (el.kind === 'mural-ref') return <div className="mural-ref-card missing">🔗 Mural embebido</div>
    return null
  }

  /** A group as a nested section: semantic title first (continuum-scaled),
   *  then the remaining children in array order, recursively. */
  function renderGroup(group: MuralElement) {
    const children = childrenOf(elements, group.id)
    // A column is an AUTHORED order (a markdown document): render children
    // strictly in array order, no title hoisting, so a reorder done in the
    // canvas is mirrored here verbatim.
    if (isColumn(group)) {
      return (
        <section className="mural-group mural-column-doc">
          {children.map((child) => (
            <div
              key={child.id}
              ref={(n) => { if (n) flowItemRefs.current.set(child.id, n); else flowItemRefs.current.delete(child.id) }}
              className={`mural-element nested${focusedId === child.id ? ' focused' : ''}${mergeId === child.id ? ' merge-target' : ''}`}
              style={{ position: 'relative', opacity: reorderId === child.id ? 0.4 : 1 }}
            >
              {dragGutter(child)}
              {renderChrome(child)}
              {renderContent(child)}
            </div>
          ))}
          {!readOnly && children.length === 0 && (
            <button className="mural-add-btn" onClick={() => addMarkdown(group.id)}>+ Texto</button>
          )}
        </section>
      )
    }
    const titleId = groupTitle(group, children)
    const title = children.find((c) => c.id === titleId)
    const rest = children.filter((c) => c.id !== titleId)
    return (
      <section className="mural-group">
        {title && renderMarkdown(
          title,
          fontScaleFor(densidad(plainLength(title.text ?? ''), nominalArea(group.canvas, 'group'))),
        )}
        {rest.map((child) => (
          <div
            key={child.id}
            ref={(n) => { if (n) flowItemRefs.current.set(child.id, n); else flowItemRefs.current.delete(child.id) }}
            className={`mural-element nested${focusedId === child.id ? ' focused' : ''}${mergeId === child.id ? ' merge-target' : ''}`}
            style={{ position: 'relative', opacity: reorderId === child.id ? 0.4 : 1 }}
          >
            {dragGutter(child)}
            {renderChrome(child)}
            {renderContent(child)}
          </div>
        ))}
        {title && renderChromeFloating(title)}
        {!readOnly && children.length === 0 && (
          <button className="mural-add-btn" onClick={() => addMarkdown(group.id)}>+ Texto</button>
        )}
      </section>
    )
  }

  // Title rows render without their own wrapper (they lead the section), so
  // their menu affordance floats at the section's top-right corner.
  function renderChromeFloating(el: MuralElement) {
    if (readOnly) return null
    return (
      <button
        className="mural-menu-btn mural-title-menu"
        title="Opciones del título"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setMenu({ elementId: el.id, anchor: { top: rect.bottom + 4, right: window.innerWidth - rect.right } })
        }}
      >
        ⋯
      </button>
    )
  }

  function renderChrome(el: MuralElement) {
    if (readOnly) return null
    const draggable = el.parentId === undefined
    return (
      <div className="mural-element-chrome">
        {draggable && (
          <button
            className="mural-grip"
            title="Arrastrar"
            onPointerDown={(e) => { e.preventDefault(); beginDrag(el, e) }}
          >
            ⠿
          </button>
        )}
        <button
          className="mural-menu-btn"
          title="Opciones"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setMenu({ elementId: el.id, anchor: { top: rect.bottom + 4, right: window.innerWidth - rect.right } })
          }}
        >
          ⋯
        </button>
      </div>
    )
  }

  const roots = rootsOf(elements)
  const flowElements = roots.filter((e) => e.doc.placement === 'flow')
  const absElements = roots.filter((e) => e.doc.placement === 'absolute' && e.doc.abs)

  // Reserve height for pinned elements with a known bottom edge.
  const absBottom = absElements.reduce(
    (m, e) => Math.max(m, (e.doc.abs!.y + origin.row + (e.doc.abs!.h ?? 3)) * grid.rowUnit),
    0,
  )

  const dragging = dragState !== null
  const showGuides = !readOnly && (!grid.locked || dragging)
  const menuElement = menu ? elements.find((e) => e.id === menu.elementId) : undefined

  return (
    <div
      ref={containerRef}
      className="mural-canvas"
      style={{ position: 'relative', minHeight: Math.max(absBottom, 120), paddingBottom: 40 }}
      onClick={(e) => { if (e.target === e.currentTarget) setFocusedId(null) }}
    >
      {/* Reorder drop indicator */}
      {dropY !== null && (
        <div
          style={{
            position: 'absolute',
            left: origin.col * colW,
            width: colW > 0 ? grid.columns * colW : '100%',
            top: dropY,
            height: 2,
            background: 'var(--accent)',
            borderRadius: 2,
            zIndex: 20,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Column guides + extended-zone tint */}
      {showGuides && colW > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          {grid.extendLeft > 0 && (
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: grid.extendLeft * colW, background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }} />
          )}
          {grid.extendRight > 0 && (
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: grid.extendRight * colW, background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }} />
          )}
          {grid.extendUp > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: grid.extendUp * grid.rowUnit, background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }} />
          )}
          {Array.from({ length: cols + 1 }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: i * colW, top: 0, bottom: 0, width: 1, background: 'var(--border)', opacity: 0.5 }} />
          ))}
        </div>
      )}

      {/* Flow layer, anchored at the canonical origin */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          marginLeft: origin.col * colW,
          marginTop: origin.row * grid.rowUnit,
          width: colW > 0 ? grid.columns * colW : '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: FLOW_GAP,
        }}
      >
        {flowElements.map((el) => (
          <div
            key={el.id}
            ref={(n) => {
              if (n) flowItemRefs.current.set(el.id, n)
              else flowItemRefs.current.delete(el.id)
            }}
            className={`mural-element${focusedId === el.id ? ' focused' : ''}${mergeId === el.id ? ' merge-target' : ''}`}
            style={{ position: 'relative', opacity: dragState?.elementId === el.id || reorderId === el.id ? 0.4 : 1 }}
          >
            {dragGutter(el)}
            {renderChrome(el)}
            {renderContent(el)}
          </div>
        ))}
        {pendingFiles?.map((p) => (
          <div key={p.id} className="mural-file-card mural-file-pending">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
              <span className="mural-spinner" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-faint)' }}>subiendo…</div>
              </div>
            </div>
          </div>
        ))}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="mural-add-btn" onClick={() => addMarkdown()}>+ Texto</button>
            <button className="mural-add-btn" onClick={addGroup}>+ Grupo</button>
            {onAddFile && <button className="mural-add-btn" onClick={onAddFile}>+ Archivo</button>}
          </div>
        )}
      </div>

      {/* Absolute layer (root elements only) */}
      {absElements.map((el) => {
        const rect = elementRect(el.doc.abs!, grid, colW)
        const isDragged = dragState?.elementId === el.id
        const live = isDragged && dragState
          ? { left: dragState.current.x * colW, top: dragState.current.y * grid.rowUnit }
          : { left: rect.left, top: rect.top }
        return (
          <div
            key={el.id}
            className={`mural-element pinned${focusedId === el.id ? ' focused' : ''}`}
            style={{
              position: 'absolute',
              zIndex: isDragged ? 3 : 2,
              left: live.left,
              top: live.top,
              width: rect.width,
              height: rect.height,
              overflow: rect.height !== undefined ? 'auto' : undefined,
              opacity: isDragged ? 0.85 : 1,
            }}
          >
            {renderChrome(el)}
            {renderContent(el)}
          </div>
        )
      })}

      {/* Snap ghost while dragging */}
      {dragState?.snapTarget && colW > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 2,
            left: dragState.snapTarget.x * colW,
            top: dragState.snapTarget.y * grid.rowUnit,
            width: dragState.w * colW,
            height: grid.rowUnit * 2,
            border: '2px dashed var(--accent)',
            borderRadius: 8,
            pointerEvents: 'none',
            opacity: 0.6,
          }}
        />
      )}

      {menu && menuElement && (
        <CellMenu items={menuItemsFor(menuElement)} anchor={menu.anchor} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
