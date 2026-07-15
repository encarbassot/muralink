// ServiceBar — shows live status for the embedded API server and Playwright
// scraper. Polls every 5 s so the display stays fresh without IPC event
// plumbing in v1. Clicking the server URL opens it in the default browser.

import { useState, useEffect, useCallback } from 'react'
import type { ServerStatus, ScraperStatus } from '@/shared/fsApi'

interface ServiceState {
  server: ServerStatus
  scraper: { status: ScraperStatus; error: string | null }
}

const IDLE: ServiceState = {
  server: { running: false, port: null, lanUrl: null },
  scraper: { status: 'not-installed', error: null },
}

export function ServiceBar() {
  const [state, setState] = useState<ServiceState>(IDLE)
  const [scraperLog, setScraperLog] = useState<string[]>([])
  const [showLog, setShowLog] = useState(false)

  const refresh = useCallback(async () => {
    const [server, scraper] = await Promise.all([
      window.serviceApi.status(),
      window.scraperApi.status(),
    ])
    setState({ server, scraper })
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 5000)
    return () => clearInterval(id)
  }, [refresh])

  async function toggleServer() {
    if (state.server.running) {
      await window.serviceApi.stop()
    } else {
      await window.serviceApi.start()
    }
    await refresh()
  }

  async function installScraper() {
    setScraperLog([])
    setShowLog(true)
    const unsub = window.scraperApi.onProgress((line) =>
      setScraperLog((prev) => {
        const next = prev.concat(line)
        return next.length > 500 ? next.slice(-500) : next
      }),
    )
    try {
      await window.scraperApi.install()
    } finally {
      unsub()
      await refresh()
    }
  }

  const { server, scraper } = state
  const serverColor = server.running ? 'var(--fg-dim)' : '#888'
  const scraperColor =
    scraper.status === 'ready' ? 'var(--fg-dim)' :
    scraper.status === 'installing' ? '#c4932b' : '#888'

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-t px-3 text-[11px]"
      style={{
        height: 26,
        background: 'var(--bg-bar)',
        borderColor: 'var(--border)',
        color: 'var(--fg-dim)',
      }}
    >
      {/* API server pill */}
      <button
        onClick={() => void toggleServer()}
        title={server.running ? 'Stop local API' : 'Start local API'}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-opacity hover:opacity-80"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: server.running ? '#4caf74' : '#888' }}
        />
        <span style={{ color: serverColor }}>
          {server.running ? `API :${server.port}` : 'API off'}
        </span>
      </button>

      {/* LAN URL */}
      {server.lanUrl && (
        <span
          className="cursor-pointer truncate underline"
          style={{ color: 'var(--fg-dim)', maxWidth: 160 }}
          onClick={() => window.open(server.lanUrl!, '_blank')}
          title={`LAN: ${server.lanUrl}`}
        >
          {server.lanUrl}
        </span>
      )}

      <span style={{ flex: 1 }} />

      {/* Scraper pill */}
      <button
        onClick={scraper.status === 'not-installed' ? () => void installScraper() : undefined}
        title={
          scraper.status === 'not-installed' ? 'Install Playwright Chromium' :
          scraper.status === 'installing' ? 'Installing…' :
          scraper.status === 'ready' ? 'Scraper ready' :
          `Scraper error: ${scraper.error}`
        }
        className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-opacity hover:opacity-80"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: scraper.status === 'not-installed' ? 'pointer' : 'default' }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background:
              scraper.status === 'ready' ? '#4caf74' :
              scraper.status === 'installing' ? '#c4932b' : '#888',
          }}
        />
        <span style={{ color: scraperColor }}>
          {scraper.status === 'not-installed' ? 'install scraper' :
           scraper.status === 'installing' ? 'installing…' :
           scraper.status === 'ready' ? 'scraper ready' : 'scraper error'}
        </span>
      </button>

      {/* Playwright install log overlay */}
      {showLog && (
        <div
          className="absolute bottom-8 right-3 flex flex-col rounded-md border p-2 text-[10px]"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border)',
            color: 'var(--fg-dim)',
            width: 340,
            maxHeight: 180,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            zIndex: 50,
          }}
        >
          <button
            className="mb-1 self-end text-[10px] hover:opacity-70"
            onClick={() => setShowLog(false)}
          >
            close
          </button>
          {scraperLog.join('')}
        </div>
      )}
    </div>
  )
}
