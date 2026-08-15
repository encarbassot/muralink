// The main column of the MURAL view: root elements WITHOUT a mural placement,
// rendered as a plain vertical document flow (array order) at the lienzo
// origin. Groups render as stacked sections. Dragging a block sideways past a
// threshold pulls it OUT of the column (the surface stamps `mural` on drop);
// doc order is never touched.

import { useRef } from 'react'
import type { MuralElement } from '../../../../types.ts'
import { MarkdownEditor } from '@muralink/editor'
import { FileCard } from '../../components/FileCard.tsx'
import { MuralRefCard } from '../MuralCanvasView.tsx'
import { groupTitle } from '../semantics.ts'
import { childrenOf } from './muralPlacement.ts'

/** Horizontal px before a column block becomes a pull-out drag. */
const PULL_THRESHOLD = 24

export interface MainColumnCtx {
  els: MuralElement[]
  readOnly: boolean
  editingId: string | null
  selfMuralId: string
  onEdit: (id: string | null) => void
  onText: (id: string, text: string) => void
  /** Root block pulled sideways out of the column. */
  onPullOut: (el: MuralElement, e: PointerEvent) => void
  onOpenMural?: (muralId: string) => void
}

function Block({ el, ctx, depth }: { el: MuralElement; ctx: MainColumnCtx; depth: number }) {
  const editing = ctx.editingId === el.id
  const pull = useRef<{ id: number; x: number; y: number } | null>(null)

  // Pull-out tracking: only root blocks (depth 0), only when not editing.
  function onPointerDown(e: React.PointerEvent) {
    if (ctx.readOnly || editing || depth > 0) return
    pull.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  function onPointerMove(e: React.PointerEvent) {
    const st = pull.current
    if (!st || st.id !== e.pointerId) return
    if (Math.abs(e.clientX - st.x) > PULL_THRESHOLD) {
      pull.current = null
      ctx.onPullOut(el, e.nativeEvent)
    }
  }
  function onPointerEnd() {
    pull.current = null
  }

  let body: React.ReactNode = null
  if (el.kind === 'markdown') {
    body = (
      <div onKeyDownCapture={(e) => { if (e.key === 'Escape') ctx.onEdit(null) }}>
        <MarkdownEditor
          key={`${el.id}:${editing ? 'edit' : 'read'}`}
          value={el.text ?? ''}
          onChange={(text: string) => ctx.onText(el.id, text)}
          readOnly={!editing}
          richFormatting
          autoFocus={editing}
          placeholder="Escribe algo…"
        />
      </div>
    )
  } else if (el.kind === 'file' && el.file) {
    body = <FileCard file={el.file} />
  } else if (el.kind === 'mural-ref') {
    body = <MuralRefCard refId={el.refId} selfId={ctx.selfMuralId} onOpen={ctx.onOpenMural} />
  } else if (el.kind === 'group') {
    const kids = childrenOf(ctx.els, el.id)
    const title = groupTitle(el, kids)
    body = (
      <section className="mural-column-group">
        {title && <div className="mural-column-group-title">{title}</div>}
        {kids.map((child) => <Block key={child.id} el={child} ctx={ctx} depth={depth + 1} />)}
      </section>
    )
  }

  return (
    <div
      className={`mural-column-block${editing ? ' editing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={(e) => {
        if (ctx.readOnly || el.kind !== 'markdown') return
        e.stopPropagation()
        ctx.onEdit(el.id)
      }}
    >
      {body}
    </div>
  )
}

export function MainColumn({ ctx }: { ctx: MainColumnCtx }) {
  const roots = ctx.els.filter((e) => e.parentId === undefined && e.mural === undefined)
  return (
    <div className="mural-main-column">
      {roots.map((el) => <Block key={el.id} el={el} ctx={ctx} depth={0} />)}
      {roots.length === 0 && (
        <div className="mural-column-empty">Columna vacía — añade texto con ＋</div>
      )}
    </div>
  )
}
