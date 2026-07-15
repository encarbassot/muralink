import { useEffect, useState } from 'react'
import type { BentoSize } from '@muralink/ui'

interface Props {
  size: BentoSize
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ── 1×1: compact square ───────────────────────────────────────────────────────

function Clock1x1({ now }: { now: Date }) {
  const h = pad(now.getHours())
  const m = pad(now.getMinutes())
  const s = pad(now.getSeconds())
  const date = now.toLocaleDateString('en', { month: 'short', day: 'numeric' })

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 8px',
        gap: 3,
      }}
    >
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 34,
          fontWeight: 300,
          color: 'var(--fg)',
          letterSpacing: '0.03em',
          lineHeight: 1,
        }}
      >
        {h}:{m}
      </div>
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          color: 'var(--accent)',
          letterSpacing: '0.06em',
          opacity: 0.7,
        }}
      >
        :{s}
      </div>
      <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 2 }}>
        {date}
      </div>
    </div>
  )
}

// ── 1×2: tall portrait ────────────────────────────────────────────────────────

function Clock1x2({ now }: { now: Date }) {
  const h = pad(now.getHours())
  const m = pad(now.getMinutes())
  const s = pad(now.getSeconds())
  const weekday = now.toLocaleDateString('en', { weekday: 'long' })
  const month = now.toLocaleDateString('en', { month: 'long' })
  const day = now.getDate()
  const year = now.getFullYear()

  // Seconds progress bar: 0→1 within the current minute
  const secFraction = now.getSeconds() / 59

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '18px 12px',
        gap: 0,
      }}
    >
      {/* Time */}
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 44,
          fontWeight: 300,
          color: 'var(--fg)',
          letterSpacing: '0.03em',
          lineHeight: 1,
        }}
      >
        {h}:{m}
      </div>

      {/* Seconds */}
      <div
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: 20,
          fontWeight: 300,
          color: 'var(--accent)',
          letterSpacing: '0.06em',
          marginTop: 4,
          opacity: 0.75,
        }}
      >
        :{s}
      </div>

      {/* Progress bar — seconds within current minute */}
      <div
        style={{
          width: '60%',
          height: 2,
          borderRadius: 1,
          background: 'var(--border)',
          marginTop: 14,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${secFraction * 100}%`,
            background: 'var(--accent)',
            borderRadius: 1,
            transition: 'width 0.9s linear',
          }}
        />
      </div>

      {/* Date */}
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', fontWeight: 500 }}>
          {weekday}
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 400 }}>
          {month} {day}
        </div>
        <div style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
          {year}
        </div>
      </div>
    </div>
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function ClockWidget({ size }: Props) {
  const now = useClock()
  if (size === '1x2') return <Clock1x2 now={now} />
  return <Clock1x1 now={now} />
}
