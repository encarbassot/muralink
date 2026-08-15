import { useEffect, useRef } from 'react'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers } from '@codemirror/view'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'

// A generic code editor — the reusable CodeMirror 6 surface behind calcsheet's
// code boxes (user-defined functions) and the "edit block source" view. Extracted
// from the notes markdown engine into a language-agnostic component. Theme-driven
// via CSS vars so it matches the app in light/dark.

export interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: 'javascript' | 'plain'
  readOnly?: boolean
  placeholder?: string
  minHeight?: number
}

const themeCompartment = new Compartment()
const readOnlyCompartment = new Compartment()

function baseTheme(minHeight: number): Extension {
  return EditorView.theme({
    '&': { fontSize: '12px', background: 'var(--bg-elevated)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: '6px' },
    '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minHeight: `${minHeight}px` },
    '.cm-gutters': { background: 'transparent', color: 'var(--fg-faint)', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { background: 'color-mix(in srgb, var(--fg) 5%, transparent)' },
    '&.cm-focused': { outline: '2px solid var(--primary, #3b82f6)' },
    '.cm-cursor': { borderLeftColor: 'var(--fg)' },
  })
}

export function CodeEditor({ value, onChange, language = 'javascript', readOnly = false, placeholder, minHeight = 60 }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Mount once.
  useEffect(() => {
    if (!hostRef.current) return
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      baseTheme(minHeight),
      themeCompartment.of([]),
      readOnlyCompartment.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current?.(u.state.doc.toString())
      }),
    ]
    if (language === 'javascript') extensions.push(javascript())
    if (placeholder) extensions.push(cmPlaceholder(placeholder))

    const view = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Mount-only: value/readOnly are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (without clobbering the cursor on self-edits).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  // Reconfigure read-only without a remount.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
    })
  }, [readOnly])

  return <div ref={hostRef} style={{ width: '100%' }} />
}
