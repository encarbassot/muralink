// One element of the MURAL view, rendered recursively: the node is positioned
// at its mural placement (center, parent units) and its children render INSIDE
// its DOM node, so the browser composes translate/scale down the tree — no
// world-flattening, no global unit. Geometry must never be read from DOM
// rects; all math lives in muralPlacement.ts.

import type { MuralElement, MuralPlacement } from '../../../../types.ts'
import { MarkdownEditor } from '@muralink/editor'
import { FileCard } from '../../components/FileCard.tsx'
import { MuralRefCard } from '../MuralCanvasView.tsx'
import { groupTitle } from '../semantics.ts'
import { childrenOf } from './muralPlacement.ts'

/** Apparent width (screen px) below which a subtree collapses to a dot. */
const CULL_PX = 2

export interface MuralNodeCtx {
  els: MuralElement[]
  placements: Map<string, MuralPlacement>
  readOnly: boolean
  selectedId: string | null
  editingId: string | null
  selfMuralId: string
  /** Live drag override: element id → center in its parent's units. */
  dragPos: { id: string; x: number; y: number } | null
  onSelect: (id: string) => void
  onEdit: (id: string | null) => void
  onText: (id: string, text: string) => void
  onDragStart: (el: MuralElement, e: React.PointerEvent) => void
  onScaleStart: (el: MuralElement, e: React.PointerEvent) => void
  onMenu: (el: MuralElement, e: React.MouseEvent) => void
  onOpenMural?: (muralId: string) => void
}

export function MuralNode({ el, effScale, ctx }: {
  el: MuralElement
  /** camera.scale × ∏ ancestor scales — the parent frame's screen px per unit. */
  effScale: number
  ctx: MuralNodeCtx
}) {
  const p = ctx.placements.get(el.id)
  if (!p) return null
  const editing = ctx.editingId === el.id
  const selected = ctx.selectedId === el.id
  const eff = effScale * p.scale
  const w = p.w ?? 180
  const live = ctx.dragPos?.id === el.id ? ctx.dragPos : p

  // Trivial culling: too small to matter — placeholder dot, no children. Never
  // cull what the user is interacting with.
  const keepVisible = editing || selected
  if (!keepVisible && w * eff < CULL_PX) {
    return (
      <div
        className="mural-node-dot"
        style={{
          position: 'absolute',
          left: live.x,
          top: live.y,
          transform: `translate(-50%, -50%) scale(${p.scale})`,
        }}
      />
    )
  }

  let content: React.ReactNode = null
  if (el.kind === 'markdown') {
    content = (
      <div onKeyDownCapture={(e) => { if (e.key === 'Escape') ctx.onEdit(null) }}>
        <MarkdownEditor
          key={`${el.id}:${editing ? 'edit' : 'read'}`}
          value={el.text ?? ''}
          onChange={(text: string) => ctx.onText(el.id, text)}
          readOnly={!editing}
          richFormatting
          autoFocus={editing}
          placeholder="Texto…"
          density="compact"
        />
      </div>
    )
  } else if (el.kind === 'file' && el.file) {
    content = <FileCard file={el.file} />
  } else if (el.kind === 'mural-ref') {
    content = <MuralRefCard refId={el.refId} selfId={ctx.selfMuralId} onOpen={ctx.onOpenMural} />
  } else if (el.kind === 'group') {
    const kids = childrenOf(ctx.els, el.id)
    const title = groupTitle(el, kids)
    content = title ? <div className="mural-frame-title">{title}</div> : null
  }

  const kids = childrenOf(ctx.els, el.id)

  return (
    <div
      className={[
        'mural-node',
        el.kind === 'group' ? 'mural-frame' : 'mural-loose-box',
        selected ? 'selected' : '',
        editing ? 'editing' : '',
      ].filter(Boolean).join(' ')}
      style={{
        position: 'absolute',
        left: live.x,
        top: live.y,
        width: w,
        transform: `translate(-50%, -50%) scale(${p.scale})`,
        transformOrigin: '50% 50%',
      }}
      onPointerDown={(e) => {
        if (ctx.readOnly || editing) return
        e.stopPropagation()
        ctx.onSelect(el.id)
        ctx.onDragStart(el, e)
      }}
      onDoubleClick={(e) => {
        if (ctx.readOnly || el.kind !== 'markdown') return
        e.stopPropagation()
        ctx.onEdit(el.id)
      }}
      onContextMenu={(e) => {
        if (ctx.readOnly) return
        e.preventDefault()
        e.stopPropagation()
        ctx.onMenu(el, e)
      }}
    >
      {content}
      {kids.length > 0 && (
        <div className="mural-node-kids" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
          {kids.map((child) => (
            <MuralNode key={child.id} el={child} effScale={eff} ctx={ctx} />
          ))}
        </div>
      )}
      {selected && !ctx.readOnly && (
        <div
          className="mural-resize-handle mural-scale-handle"
          title="Escalar (uniforme)"
          onPointerDown={(e) => {
            e.stopPropagation()
            ctx.onScaleStart(el, e)
          }}
        />
      )}
    </div>
  )
}
