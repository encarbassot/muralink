// @ts-nocheck — vendored from the mural.ink playground. Kept verbatim; its types
// are looser than this repo's strict config. Behavior validated at runtime.
/**
 * MarkdownEditor
 *
 * A single-surface markdown editor built on CodeMirror 6.
 * Markdown syntax is visible but decorated in-place — there is no
 * separate preview panel.
 *
 * This is the shared editor primitive (@muralink/editor): the same engine
 * powers notes, murales blocks, embed dashboards and any future module.
 * All @codemirror/* imports are contained within this package.
 *
 * Public API:
 *   <MarkdownEditor
 *     value={string}
 *     onChange={(value: string) => void}
 *     placeholder?: string
 *     autoFocus?: boolean
 *     readOnly?: boolean                               // read vs edit surface
 *     richFormatting?: boolean                         // default: true
 *     actionBar?: 'none' | 'compact' | 'full'          // default: 'none'
 *     density?: 'fill' | 'compact'                     // default: 'fill'
 *     aspectRatio?: number                             // optional W/H box
 *     className?: string
 *   />
 *
 * richFormatting controls both formatting and syntax visibility:
 *   • true: rich mode with syntax markers (e.g. <h1><span># </span>Title</h1>)
 *   • false: pretty mode with formatting only (e.g. <h1>Title</h1>)
 *   It is the initial value; the built-in 'full' action bar can toggle it.
 *
 * actionBar mounts the shared format Toolbar above the surface:
 *   • 'none'    — surface only (no chrome)
 *   • 'compact' — format buttons only (Bold/Italic/Code/list/heading)
 *   • 'full'    — format buttons + rich/plain toggle
 *
 * density='compact' densifies the surface (canvas blocks) via the shared
 * `.mde-compact` styles. aspectRatio wraps the surface in an aspect-ratio box.
 */

import { useEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { createEditorState } from './engine/createEditorState'
import { decoConfigCompartment, makeDecoExtension } from './engine/decorations'
import { Toolbar } from './Toolbar'
import styles from './MarkdownEditor.module.css'
import './editor.css'

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  readOnly?: boolean
  richFormatting?: boolean
  /** Built-in format toolbar. Default 'none' (surface only). */
  actionBar?: 'none' | 'compact' | 'full'
  /** Surface density. 'compact' = canvas-block styling (`.mde-compact`). */
  density?: 'fill' | 'compact'
  /** Optional aspect-ratio (width/height) box around the surface. */
  aspectRatio?: number
  className?: string
  // optional external ref to access the underlying EditorView
  editorRef?: React.MutableRefObject<import('@codemirror/view').EditorView | null>
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  autoFocus = false,
  readOnly = false,
  richFormatting = true,
  actionBar = 'none',
  density = 'fill',
  aspectRatio,
  className,
  editorRef,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Keep onChange in a ref so that the editor listener never captures a stale closure
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Semi-controlled rich mode: seeded from the prop, kept in sync when the prop
  // changes, and toggleable in-place by the built-in 'full' action bar.
  const [rich, setRich] = useState(richFormatting)
  useEffect(() => {
    setRich(richFormatting)
  }, [richFormatting])

  // ── Mount / unmount ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: createEditorState({
        doc: value,
        onChange: (val) => onChangeRef.current(val),
        placeholder,
        readOnly,
        decoConfig: { richFormatting: rich },
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    if (editorRef) editorRef.current = view
    // Expose current mode to CSS-based widgets (bullet glyph toggle)
    if (containerRef.current) containerRef.current.setAttribute('data-rich', rich ? 'true' : 'false')

    if (autoFocus) {
      // Defer to allow the DOM to settle (e.g. inside portals/overlays)
      requestAnimationFrame(() => view.focus())
    }

    return () => {
      view.destroy()
      viewRef.current = null
      if (editorRef) editorRef.current = null
    }
    // Intentionally omit `value` — we handle external changes in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── External value changes (e.g. switching notes) ────────────────
  // When the parent supplies a new `value` that differs from what the
  // editor currently holds, we dispatch a replacement transaction.
  // This happens when switching between notes (key remount also works,
  // but this path handles subtle programmatic updates without remounting).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  // ── readOnly changes ──────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // Rebuild state to apply new readOnly — lightweight because document
    // is preserved via the value sync effect above.
    view.setState(
      createEditorState({
        doc: view.state.doc.toString(),
        onChange: (val) => onChangeRef.current(val),
        placeholder,
        readOnly,
        decoConfig: { richFormatting: rich },
      }),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  // ── Hot-swap decoration config (no remount) ───────────────────────
  // When rich mode changes, reconfigure the Compartment in-place
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: decoConfigCompartment.reconfigure(
        makeDecoExtension({ richFormatting: rich }),
      ),
    })
    if (containerRef.current) containerRef.current.setAttribute('data-rich', rich ? 'true' : 'false')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rich])

  const wrapped = actionBar !== 'none' || aspectRatio != null
  const surfaceCls = [styles.editor, density === 'compact' && 'mde-compact', className]
    .filter(Boolean)
    .join(' ')

  const surface = (
    <div
      ref={containerRef}
      className={surfaceCls}
      style={wrapped ? { flex: 1, minHeight: 0 } : undefined}
    />
  )

  // Preserve the original bare-surface behavior when there is no chrome.
  if (!wrapped) return surface

  const column = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {actionBar !== 'none' ? (
        <Toolbar
          editorRef={viewRef}
          rich={rich}
          onToggleRich={() => setRich((v) => !v)}
          showRichToggle={actionBar === 'full'}
        />
      ) : null}
      {surface}
    </div>
  )

  if (aspectRatio != null) {
    return <div style={{ aspectRatio: String(aspectRatio), width: '100%' }}>{column}</div>
  }
  return column
}
