import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useExplorer } from '@/stores/explorerStore'

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termIdRef = useRef<string | null>(null)
  const toggleConsole = useExplorer((s) => s.toggleConsole)

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || termRef.current) return

    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background: '#14181d',
        foreground: '#e6e9ee',
        cursor: '#4c9fff',
        selectionBackground: '#2d5a8a',
        black: '#0b0d10',
        red: '#d2554e',
        green: '#4caf74',
        yellow: '#c4932b',
        blue: '#4c9fff',
        magenta: '#b07cc8',
        cyan: '#56c2c0',
        white: '#9aa4b2',
        brightBlack: '#5c6675',
        brightRed: '#e06c75',
        brightGreen: '#6bc98a',
        brightYellow: '#d4a84b',
        brightBlue: '#6cb3ff',
        brightMagenta: '#c88fd8',
        brightCyan: '#70d4d2',
        brightWhite: '#e6e9ee',
      },
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    if (!window.terminalApi) {
      term.writeln('Terminal API not available (running outside Electron)')
      return
    }

    const id = await window.terminalApi.create()
    termIdRef.current = id

    const unsubData = window.terminalApi.onData((_id, data) => {
      if (_id === id) term.write(data)
    })

    const unsubExit = window.terminalApi.onExit((_id) => {
      if (_id === id) {
        term.writeln('\r\n[Process exited]')
        termIdRef.current = null
      }
    })

    term.onData((data) => {
      if (termIdRef.current) {
        window.terminalApi.write(termIdRef.current, data)
      }
    })

    term.onResize(({ cols, rows }) => {
      if (termIdRef.current) {
        window.terminalApi.resize(termIdRef.current, cols, rows)
      }
    })

    const dims = fit.proposeDimensions()
    if (dims && termIdRef.current) {
      window.terminalApi.resize(termIdRef.current, dims.cols, dims.rows)
    }

    ;(term as any)._unsubData = unsubData
    ;(term as any)._unsubExit = unsubExit
  }, [])

  useEffect(() => {
    void initTerminal()

    return () => {
      const term = termRef.current
      if (term) {
        ;(term as any)._unsubData?.()
        ;(term as any)._unsubExit?.()
        term.dispose()
        termRef.current = null
      }
      if (termIdRef.current && window.terminalApi) {
        window.terminalApi.kill(termIdRef.current)
        termIdRef.current = null
      }
      fitRef.current = null
    }
  }, [initTerminal])

  useEffect(() => {
    const fit = fitRef.current
    if (!fit) return

    const ro = new ResizeObserver(() => {
      try { fit.fit() } catch {}
    })
    if (containerRef.current) {
      ro.observe(containerRef.current)
    }
    return () => ro.disconnect()
  }, [])

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        borderRadius: 'var(--bento-radius)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        height: '100%',
      }}
    >
      <div
        className="flex shrink-0 items-center justify-between px-3"
        style={{
          height: 30,
          background: 'var(--bg-bar)',
          borderBottom: '1px solid var(--border)',
          borderRadius: 'var(--bento-radius) var(--bento-radius) 0 0',
        }}
      >
        <span className="text-[11px]" style={{ color: 'var(--fg-dim)' }}>Terminal</span>
        <button
          onClick={toggleConsole}
          className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-blue-500/20"
          style={{ color: 'var(--fg-faint)', fontSize: 12 }}
        >
          ×
        </button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" style={{ padding: '4px 0 0 4px' }} />
    </div>
  )
}
