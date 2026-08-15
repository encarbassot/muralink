// Inline markdown editor for a mural file card — the SAME edit-in-place
// editor as the mural document, rendered INSIDE the expanded card (the user
// never leaves the mural). Saves back to the file itself, debounced, via the
// host storage seam (read-only when the host can't write, e.g. a guest).

import { useEffect, useRef, useState } from 'react'
import { MarkdownEditor } from '@muralink/editor'
import type { MuralFileRef } from '../../../types.ts'
import { getMuralStorage } from '../storage.ts'

const SAVE_DELAY = 800

interface Props {
  file: MuralFileRef
  saveStateChanged?: (state: 'saved' | 'dirty' | 'saving') => void
}

export function MarkdownFileEditor({ file, saveStateChanged }: Props) {
  const storage = getMuralStorage()
  const canWrite = Boolean(storage?.saveText)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const url = storage?.serveUrl(file.path)
    if (!url) { setError('Sin conexión con el servidor.'); return }
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudo leer el archivo (${r.status})`)
        return r.text()
      })
      .then((t) => { latest.current = t; setText(t) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error de red'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.path])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  function onChange(next: string) {
    latest.current = next
    saveStateChanged?.('dirty')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveStateChanged?.('saving')
      storage!.saveText!(file.path, latest.current)
        .then(() => saveStateChanged?.('saved'))
        .catch(() => saveStateChanged?.('dirty'))
    }, SAVE_DELAY)
  }

  if (error) return <div style={{ padding: 12, fontSize: 11, color: 'var(--fg-faint)' }}>{error}</div>
  if (text === null) return <div style={{ padding: 12, fontSize: 11, color: 'var(--fg-faint)' }}>Cargando…</div>

  return (
    <MarkdownEditor
      value={text}
      onChange={onChange}
      readOnly={!canWrite}
      richFormatting
      autoFocus={canWrite}
      placeholder="Documento vacío…"
    />
  )
}
