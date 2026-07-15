// VS Code-style text editor with platform-agnostic data loading.
// Each platform provides an adapter implementing FileAdapter interface.

import { useEffect, useRef, useState } from 'react'

export interface FileAdapter {
  load(path: string): Promise<{ text: string; truncated: boolean; isText: boolean }>
  save(path: string, content: string): Promise<void>
}

interface EditorState {
  text: string
  isDirty: boolean
  lineNumbers: boolean
  wordWrap: boolean
  fontSize: number
  findOpen: boolean
  findQuery: string
  findIndex: number
  loading: boolean
  error: string | null
  truncated: boolean
}

interface TextEditorProps {
  path: string
  adapter: FileAdapter
  onSave?: () => void
  context?: any // ModuleContext for future use
}

const INIT: EditorState = {
  text: '',
  isDirty: false,
  lineNumbers: true,
  wordWrap: false,
  fontSize: 12,
  findOpen: false,
  findQuery: '',
  findIndex: -1,
  loading: true,
  error: null,
  truncated: false,
}

export function TextEditor({ path, adapter, onSave }: TextEditorProps) {
  const [state, setState] = useState<EditorState>(INIT)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)

  // Load file via adapter
  useEffect(() => {
    let alive = true
    setState(INIT)
    adapter
      .load(path)
      .then((result) => {
        if (alive) {
          if (!result.isText) {
            setState((s) => ({
              ...s,
              loading: false,
              error: 'Binary file — cannot edit.',
            }))
            return
          }
          setState((s) => ({
            ...s,
            text: result.text,
            loading: false,
            truncated: result.truncated,
          }))
        }
      })
      .catch((e) => {
        if (alive) {
          setState((s) => ({
            ...s,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          }))
        }
      })

    return () => {
      alive = false
    }
  }, [path, adapter])

  // Keyboard shortcuts
  useEffect(() => {
    if (!textareaRef.current) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
      const mod = isMac ? e.metaKey : e.ctrlKey

      // Ctrl/Cmd+S: Save
      if (mod && e.key === 's') {
        e.preventDefault()
        if (state.isDirty) {
          adapter.save(path, state.text).then(() => {
            setState((s) => ({ ...s, isDirty: false }))
            onSave?.()
          })
        }
      }

      // Ctrl/Cmd+F: Open find
      if (mod && e.key === 'f') {
        e.preventDefault()
        setState((s) => ({ ...s, findOpen: !s.findOpen }))
        if (!state.findOpen) {
          setTimeout(() => findInputRef.current?.focus(), 0)
        }
      }

      // Escape: Close find
      if (e.key === 'Escape' && state.findOpen) {
        e.preventDefault()
        setState((s) => ({ ...s, findOpen: false }))
      }

      // Tab indentation
      if (e.key === 'Tab') {
        e.preventDefault()
        const ta = textareaRef.current
        if (!ta) return
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const newText = state.text.substring(0, start) + '\t' + state.text.substring(end)
        setState((s) => ({ ...s, text: newText, isDirty: true }))
        setTimeout(() => {
          ta.selectionStart = ta.selectionEnd = start + 1
        }, 0)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state.isDirty, state.findOpen, path, state.text, adapter])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setState((s) => ({ ...s, text: e.target.value, isDirty: true }))
  }

  const handleFindChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setState((s) => ({
      ...s,
      findQuery: query,
      findIndex: query ? state.text.indexOf(query) : -1,
    }))
  }

  if (state.loading) {
    return <Centered>loading…</Centered>
  }

  if (state.error) {
    return <Centered>{state.error}</Centered>
  }

  const lineCount = state.text.split('\n').length
  const lineNumberWidth = Math.max(40, String(lineCount).length * 8)

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      {/* Header with controls */}
      <div
        className="flex items-center justify-between border-b px-3 py-2 gap-2"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-bar)' }}
      >
        <div className="flex items-center gap-2 text-[11px]">
          {state.isDirty && <span style={{ color: 'var(--fg-dim)' }}>●</span>}
          <span style={{ color: 'var(--fg-faint)' }}>{lineCount} lines</span>
          {state.truncated && (
            <span style={{ color: 'var(--sync-external-blocked, #d2554e)' }}>~1 MB truncated</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-[11px]">
            <input
              type="checkbox"
              checked={state.lineNumbers}
              onChange={(e) => setState((s) => ({ ...s, lineNumbers: e.target.checked }))}
              style={{ cursor: 'pointer' }}
            />
            numbers
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <input
              type="checkbox"
              checked={state.wordWrap}
              onChange={(e) => setState((s) => ({ ...s, wordWrap: e.target.checked }))}
              style={{ cursor: 'pointer' }}
            />
            wrap
          </label>
          <div className="flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setState((s) => ({ ...s, fontSize: Math.max(10, s.fontSize - 1) }))}
              style={{ padding: '2px 6px', cursor: 'pointer' }}
            >
              −
            </button>
            <span>{state.fontSize}</span>
            <button
              onClick={() => setState((s) => ({ ...s, fontSize: Math.min(20, s.fontSize + 1) }))}
              style={{ padding: '2px 6px', cursor: 'pointer' }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Find bar */}
      {state.findOpen && (
        <div
          className="flex items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-bar)' }}
        >
          <input
            ref={findInputRef}
            type="text"
            placeholder="Find…"
            value={state.findQuery}
            onChange={handleFindChange}
            style={{
              padding: '4px 6px',
              fontSize: 12,
              borderRadius: 2,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--fg)',
            }}
          />
          {state.findQuery && (
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
              {state.findIndex >= 0 ? `found` : 'not found'}
            </span>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="min-h-0 flex-1 flex overflow-hidden">
        {state.lineNumbers && (
          <div
            className="select-none border-r overflow-hidden px-2 py-2 text-[12px] text-right"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--fg-dim)',
              width: lineNumberWidth,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {Array.from({ length: lineCount }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={state.text}
          onChange={handleTextChange}
          className="min-h-0 flex-1 p-3 text-[12px] outline-none resize-none"
          style={{
            fontFamily: 'ui-monospace, monospace',
            whiteSpace: state.wordWrap ? 'pre-wrap' : 'pre',
            overflowWrap: state.wordWrap ? 'break-word' : 'normal',
            color: 'var(--fg)',
            background: 'var(--bg)',
            tabSize: 2,
          }}
          spellCheck="false"
        />
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-full items-center justify-center p-4 text-[12px]"
      style={{ color: 'var(--fg-faint)' }}
    >
      {children}
    </div>
  )
}

