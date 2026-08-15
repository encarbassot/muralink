// The always-floating assistant bubble. Portals to <body> (CellMenu precedent)
// so it escapes any overflow clip and exists in both the dashboard and app
// views. Renders NOTHING when no AI backend is reachable — local-first: an
// optional network feature degrades silently, no dead UI. Re-probes on window
// focus so starting Ollama makes the bubble appear without a reload.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useChat } from './chatStore.ts'
import { ChatPanel } from './ChatPanel.tsx'

export function ChatBubble() {
  const available = useChat((s) => s.available)
  const open = useChat((s) => s.open)
  const toggle = useChat((s) => s.toggle)
  const probe = useChat((s) => s.probe)
  const proposals = useChat((s) => s.proposals)

  useEffect(() => {
    void probe()
    const onFocus = () => void probe()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [probe])

  if (!available) return null

  return createPortal(
    <>
      {open && <ChatPanel />}
      <button
        className="mural-chat-bubble"
        onClick={toggle}
        title={open ? 'Cerrar asistente' : 'Asistente'}
        aria-label="Asistente"
      >
        {open ? '✕' : '✦'}
        {!open && proposals.length > 0 && <span className="mural-chat-badge" />}
      </button>
    </>,
    document.body,
  )
}
