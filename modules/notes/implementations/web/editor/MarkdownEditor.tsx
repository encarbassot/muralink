// @ts-nocheck — vendored from the mural.ink playground. Kept verbatim; its types
// are looser than this repo's strict config. Behavior validated at runtime.
/**
 * MarkdownEditor
 *
 * A single-surface markdown editor built on CodeMirror 6.
 * Markdown syntax is visible but decorated in-place — there is no
 * separate preview panel.
 *
 * This is the ONLY file the rest of the app imports from src/editor/.
 * All @codemirror/* imports are contained within src/editor/.
 *
 * Public API:
 *   <MarkdownEditor
 *     value={string}
 *     onChange={(value: string) => void}
 *     placeholder?: string
 *     autoFocus?: boolean
 *     readOnly?: boolean
 *     richFormatting?: boolean                         // default: true
 *     className?: string
 *   />
 *
 * richFormatting controls both formatting and syntax visibility:
 *   • true: rich mode with syntax markers (e.g. <h1><span># </span>Title</h1>)
 *   • false: pretty mode with formatting only (e.g. <h1>Title</h1>)
 */

import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { createEditorState } from './engine/createEditorState'
import { decoConfigCompartment, makeDecoExtension } from './engine/decorations'
import styles from './MarkdownEditor.module.css'
import './editor.css'

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  readOnly?: boolean
  richFormatting?: boolean
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

  // ── Mount / unmount ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: createEditorState({
        doc: value,
        onChange: (val) => onChangeRef.current(val),
        placeholder,
        readOnly,
        decoConfig: { richFormatting },
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    if (editorRef) editorRef.current = view
    // Expose current mode to CSS-based widgets (bullet glyph toggle)
    if (containerRef.current) containerRef.current.setAttribute('data-rich', richFormatting ? 'true' : 'false')

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
        decoConfig: { richFormatting },
      }),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  // ── Hot-swap decoration config (no remount) ───────────────────────
  // When richFormatting changes, reconfigure the Compartment in-place
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: decoConfigCompartment.reconfigure(
        makeDecoExtension({ richFormatting }),
      ),
    })
    if (containerRef.current) containerRef.current.setAttribute('data-rich', richFormatting ? 'true' : 'false')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richFormatting])

  const cls = [styles.editor, className].filter(Boolean).join(' ')

  return <div ref={containerRef} className={cls} />
}
