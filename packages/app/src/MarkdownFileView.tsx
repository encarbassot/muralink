// Markdown file viewer/editor over the storage module. The SAME edit-in-place
// editor the mural document and notes use (CodeMirror, syntax revealed at the
// cursor) — one editing experience everywhere. Saves back to the file itself,
// debounced, via the storage upload route.

import { useEffect, useRef, useState } from 'react'
import { MarkdownEditor } from '@muralink/module-notes/web'
import { storageApi, type StorageEntry } from './storageApi.ts'

const SAVE_DELAY = 800

interface Props {
  entry: StorageEntry
  readOnly?: boolean
  onClose: () => void
}

export function MarkdownFileView({ entry, readOnly, onClose }: Props) {
  // The loaded text seeds the editor ONCE; keystrokes live in the editor and a
  // ref (feeding them back through `value` would reset the CodeMirror state).
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved')
  const latest = useRef<string>('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dir = entry.path.slice(0, entry.path.length - entry.name.length - 1)

  useEffect(() => {
    fetch(storageApi.serveUrl(entry.path))
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudo leer el archivo (${r.status})`)
        return r.text()
      })
      .then((t) => { latest.current = t; setText(t) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error de red'))
  }, [entry.path])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  function onChange(next: string) {
    latest.current = next
    setSaveState('dirty')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaveState('saving')
      const file = new File([latest.current], entry.name, { type: 'text/markdown' })
      storageApi.upload(dir, file)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('dirty'))
    }, SAVE_DELAY)
  }

  // Capture-phase: the app panel also listens for Escape on window (back to
  // dashboard) — swallow it here so Esc only closes this viewer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onClose])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 14 }}>📄</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.name}
        </span>
        {!readOnly && (
          <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
            {saveState === 'saved' ? 'guardado' : saveState === 'saving' ? 'guardando…' : 'sin guardar'}
          </span>
        )}
        <button
          onClick={onClose}
          title="Cerrar (Esc)"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {error && <div style={{ padding: 24, fontSize: 12, color: 'var(--fg-faint)' }}>{error}</div>}
        {text === null && !error && <div style={{ padding: 24, fontSize: 12, color: 'var(--fg-faint)' }}>Cargando…</div>}
        {text !== null && (
          <MarkdownEditor
            value={text}
            onChange={onChange}
            readOnly={readOnly}
            richFormatting
            autoFocus={!readOnly}
            placeholder="Documento vacío…"
          />
        )}
      </div>
    </div>
  )
}
