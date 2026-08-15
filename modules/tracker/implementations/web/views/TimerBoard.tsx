// The button board: a grid of always-square timer tiles with play/pause.
// CSS auto-fill columns give 2 columns at mobile widths with zero JS. The
// per-second tick is component-local state and runs only while the timer is
// running — it must never touch grid persistence.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { YTimerDef, YTimeEntry } from '../../../types.ts'
import { elapsedMs, formatElapsed, runningEntry, totalTodayMs } from '../../../time.ts'
import { useTracker } from '../trackerStore.ts'

function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

export function TimerTile({
  timer,
  entries,
  interactive,
  onToggle,
  footer,
}: {
  timer: YTimerDef
  entries: YTimeEntry[]
  interactive?: boolean
  onToggle?: (timer: YTimerDef, running: boolean) => void
  /** Optional extra row under the readout (e.g. the project-mural chip). */
  footer?: ReactNode
}) {
  const open = runningEntry(entries, timer.id)
  const running = !!open
  const nowMs = useNowTick(running)
  const today = totalTodayMs(entries, timer.id, new Date(nowMs))
  const current = open ? elapsedMs(open, nowMs) : 0

  return (
    <div
      style={{
        aspectRatio: '1 / 1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: 12,
        border: running ? '1px solid var(--accent, #6c8cff)' : '1px solid var(--border)',
        background: running ? 'var(--accent-dim, rgba(108,140,255,0.12))' : 'var(--bg)',
        padding: 8,
        boxSizing: 'border-box',
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 26, lineHeight: 1 }}>{timer.emoji ?? '⏱️'}</span>
      <span
        title={timer.title}
        style={{ maxWidth: '92%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}
      >
        {timer.title}
      </span>
      <span style={{ fontSize: 12, color: running ? 'var(--accent, #6c8cff)' : 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>
        {running ? formatElapsed(current) : formatElapsed(today)}
      </span>
      <button
        onClick={interactive ? (e) => { e.stopPropagation(); onToggle?.(timer, running) } : undefined}
        disabled={!interactive}
        title={running ? 'Pausar' : 'Iniciar'}
        style={{
          marginTop: 2,
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: running ? 'var(--accent, #6c8cff)' : 'var(--bg-elevated)',
          color: running ? '#fff' : 'var(--fg)',
          cursor: interactive ? 'pointer' : 'default',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: interactive ? 1 : 0.6,
        }}
      >
        {running ? '⏸' : '▶'}
      </button>
      {footer}
    </div>
  )
}

export function TimerBoard({ interactive = true }: { interactive?: boolean }) {
  const timers = useTracker((s) => s.timers)
  const entries = useTracker((s) => s.entries)
  const loaded = useTracker((s) => s.loaded)
  const loadAll = useTracker((s) => s.loadAll)
  const createTimer = useTracker((s) => s.createTimer)
  const start = useTracker((s) => s.start)
  const stop = useTracker((s) => s.stop)

  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])

  const visible = useMemo(() => timers.filter((t) => !t.archived), [timers])

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 10, boxSizing: 'border-box', background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
        {visible.map((t) => (
          <TimerTile
            key={t.id}
            timer={t}
            entries={entries}
            interactive={interactive}
            onToggle={(timer, running) => void (running ? stop(timer.id) : start(timer.id))}
          />
        ))}
        {interactive && (
          <button
            onClick={() => void createTimer()}
            title="Nuevo cronómetro"
            style={{
              aspectRatio: '1 / 1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              borderRadius: 12,
              border: '1px dashed var(--border)',
              background: 'transparent',
              color: 'var(--fg-faint)',
              cursor: 'pointer',
              fontSize: 22,
            }}
          >
            ＋
            <span style={{ fontSize: 10 }}>Cronómetro</span>
          </button>
        )}
        {visible.length === 0 && !interactive && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--fg-faint)', fontSize: 12, padding: 12 }}>
            Sin cronómetros
          </div>
        )}
      </div>
    </div>
  )
}
