// Fichar widget — mirror of tracker's TimerTile: one big button, a running
// readout while clocked in. Unlike a tracker timer there is at most ONE
// running span per employee (server-enforced by clock-in reusing the open
// entry), so this widget needs no list, just the current open entry if any.

import { useEffect, useState } from 'react'
import type { YAttendanceEntry } from '../../../types.ts'

interface Props {
  employeeName?: string
  /** The caller's own open (recorded.end undefined) entry, if clocked in. */
  running?: YAttendanceEntry
  onClockIn?: () => void
  onClockOut?: () => void
}

function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function ClockWidget({ employeeName, running, onClockIn, onClockOut }: Props) {
  const isRunning = !!running?.recorded && !running.recorded.end
  const nowMs = useNowTick(isRunning)
  const elapsed = isRunning ? nowMs - new Date(running!.recorded!.start.iso).getTime() : 0

  return (
    <div
      style={{
        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 10, fontFamily: 'inherit', padding: 12, boxSizing: 'border-box',
      }}
    >
      {employeeName && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground, #6b6560)' }}>{employeeName}</div>
      )}
      <div style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums', color: isRunning ? '#4caf50' : 'var(--fg, #1a1a1a)' }}>
        {isRunning ? formatElapsed(elapsed) : '00:00'}
      </div>
      <button
        onClick={isRunning ? onClockOut : onClockIn}
        style={{
          width: 64, height: 64, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: isRunning ? '#e53935' : '#4caf50', color: '#fff',
          fontSize: 12, fontWeight: 700,
        }}
      >
        {isRunning ? 'Salir' : 'Fichar'}
      </button>
    </div>
  )
}
