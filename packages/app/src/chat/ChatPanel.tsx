// The chat panel anchored above the bubble. Message list (user right,
// assistant left) with a streaming caret, proposal cards inline, textarea +
// send. Esc closes. Styled with the app's tokens via .mural-chat-* classes.

import { useEffect, useRef, useState } from 'react'
import { useChat } from './chatStore.ts'
import { ProposalCard, AppliedChip } from './ProposalCard.tsx'

export function ChatPanel() {
  const messages = useChat((s) => s.messages)
  const busy = useChat((s) => s.busy)
  const currentTool = useChat((s) => s.currentTool)
  const proposals = useChat((s) => s.proposals)
  const send = useChat((s) => s.send)
  const cancelStream = useChat((s) => s.cancelStream)
  const toggle = useChat((s) => s.toggle)

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, proposals, busy])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  async function submit() {
    const text = draft.trim()
    if (!text || busy !== 'idle') return
    setDraft('')
    await send(text)
  }

  const visible = messages.filter(
    (m) => !m.hidden && (m.role === 'user' || m.role === 'assistant') && (m.content || m.role === 'user'),
  )

  return (
    <div className="mural-chat-panel">
      <div className="mural-chat-header">
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Asistente</span>
        <span style={{ flex: 1 }} />
        {busy !== 'idle' && (
          <button className="mural-chat-btn" onClick={cancelStream}>
            Detener
          </button>
        )}
        <button
          className="mural-chat-btn"
          onClick={toggle}
          title="Cerrar (Esc)"
          style={{ width: 24, padding: 0 }}
        >
          ✕
        </button>
      </div>

      <div ref={listRef} className="mural-chat-messages">
        {visible.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--fg-faint)', textAlign: 'center', padding: '24px 12px' }}>
            Pregunta lo que quieras. Con una ficha de contacto abierta puedo leerla,
            editar su mensaje preparado y apuntar tareas.
          </div>
        )}
        {visible.map((m, i) => {
          const isLast = i === visible.length - 1
          return (
            <div key={i} className={m.role === 'user' ? 'mural-chat-msg mural-chat-msg-user' : 'mural-chat-msg'}>
              {m.content}
              {m.role === 'assistant' && isLast && busy === 'streaming' && (
                <span className="mural-chat-caret" />
              )}
            </div>
          )
        })}
        {busy === 'tool' && (
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', padding: '2px 6px' }}>
            ⚙︎ {currentTool ?? 'tool'}…
          </div>
        )}
        {proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
        <AppliedChip />
      </div>

      <div className="mural-chat-inputrow">
        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          placeholder="Escribe un mensaje…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <button
          className="mural-chat-btn mural-chat-btn-primary"
          disabled={busy !== 'idle' || !draft.trim()}
          onClick={() => void submit()}
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
