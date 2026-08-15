import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import type { OmnibarContext, OmnibarModule, ModuleRenderProps } from './types.js'
import { getActiveModule } from './types.js'
import './omnibar.css'

const CONTEXT_MAX = 160

export interface OmnibarProps {
  /** Invocation context captured by the host (selection, note, grid slot…). */
  context?: OmnibarContext
  /** Pluggable modules (translate, …). Prefix-matched against the query. */
  modules: OmnibarModule[]
  /** Deliver a module result back to the host (clipboard, inject, …). */
  onInject: (text: string) => void
  onClose: () => void
  /** Host content shown when no module is active (e.g. the widget grid). */
  renderDefaultResults?: (query: string) => ReactNode
  /** Host Enter handler when no module is active (pick widget / create note). */
  onDefaultEnter?: (query: string) => void
  placeholder?: string
}

export function Omnibar({
  context,
  modules,
  onInject,
  onClose,
  renderDefaultResults,
  onDefaultEnter,
  placeholder = 'Buscar…',
}: OmnibarProps) {
  const [query, setQuery] = useState('')
  const [activatedModule, setActivatedModule] = useState<OmnibarModule | null>(null)
  const [contextDismissed, setContextDismissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Query-detected module (prefix) unless one was explicitly activated.
  const activeModule = activatedModule ?? getActiveModule(modules, query)
  const isFullscreen = activeModule?.layout === 'fullscreen'
  const ctxText = contextDismissed ? undefined : context?.text

  useEffect(() => {
    if (!isFullscreen) requestAnimationFrame(() => inputRef.current?.focus())
  }, [isFullscreen])

  const renderProps: ModuleRenderProps = { query, context, onInject, onClose }

  const activate = useCallback(
    (m: OmnibarModule) => {
      const q = m.getActivationQuery(context)
      if (q === null) setActivatedModule(m)
      else setQuery(q)
    },
    [context],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (activatedModule) setActivatedModule(null)
        else if (query) setQuery('')
        else onClose()
        return
      }
      if (e.key === 'Enter') {
        if (activeModule?.handleEnter) {
          e.preventDefault()
          activeModule.handleEnter(query, renderProps)
          return
        }
        if (activeModule === null) {
          e.preventDefault()
          onDefaultEnter?.(query)
        }
      }
    },
    [activatedModule, activeModule, query, onClose, onDefaultEnter, renderProps],
  )

  const backdropClick = useCallback(
    (e: MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  const translateModule = modules.find((m) => m.id === 'translate')

  // ── Fullscreen module (e.g. translate) ──────────────────────────────────────
  if (isFullscreen && activeModule) {
    return (
      <div className="omni-overlay" onClick={backdropClick}>
        <div className="omni-modal" onClick={(e) => e.stopPropagation()}>
          <div className="omni-input-row">
            <span className="omni-badge">{activeModule.label.toUpperCase()}</span>
            <span className="omni-badge-hint">{activeModule.icon}</span>
            <button className="omni-clear" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>
          {activeModule.render(renderProps)}
        </div>
      </div>
    )
  }

  // ── Normal view ─────────────────────────────────────────────────────────────
  return (
    <div className="omni-overlay" onClick={backdropClick}>
      <div className="omni-stack" onClick={(e) => e.stopPropagation()}>
        {ctxText && (
          <div className={`omni-context omni-context--${context?.source ?? 'none'}`}>
            <span className="omni-context-label">{context?.label ?? context?.source ?? 'contexto'}</span>
            <span className="omni-context-text">
              {ctxText.length > CONTEXT_MAX ? ctxText.slice(0, CONTEXT_MAX) + '…' : ctxText}
            </span>
            {translateModule && (
              <button
                className="omni-context-action"
                onClick={() => activate(translateModule)}
                title="Abrir en Traducir"
              >
                ⇄ traducir
              </button>
            )}
            <button className="omni-context-dismiss" onClick={() => setContextDismissed(true)} aria-label="Descartar">
              ✕
            </button>
          </div>
        )}

        <div className="omni-modal">
          <div className="omni-input-row">
            <span className="omni-badge">{activeModule ? activeModule.label.toUpperCase() : '＋'}</span>
            <input
              ref={inputRef}
              className="omni-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={activeModule ? `${activeModule.label.toLowerCase()}…` : placeholder}
              spellCheck={false}
              autoComplete="off"
            />
            {query && (
              <button className="omni-clear" onClick={() => setQuery('')} aria-label="Limpiar">
                ✕
              </button>
            )}
          </div>

          {activeModule ? activeModule.render(renderProps) : renderDefaultResults?.(query)}
        </div>
      </div>
    </div>
  )
}
