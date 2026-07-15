import type { ConnectedDevice } from '@/shared/fsApi'

function browserIcon(agent: string): string {
  const a = agent.toLowerCase()
  if (a.includes('firefox')) return '🦊'
  if (a.includes('edg/') || a.includes('edge')) return '🌐'
  if (a.includes('safari') && !a.includes('chrome')) return '🧭'
  if (a.includes('chrome') || a.includes('chromium')) return '🟡'
  return '🌐'
}

function browserName(agent: string): string {
  const a = agent.toLowerCase()
  if (a.includes('firefox')) return 'Firefox'
  if (a.includes('edg/') || a.includes('edge')) return 'Edge'
  if (a.includes('safari') && !a.includes('chrome')) return 'Safari'
  if (a.includes('chromium')) return 'Chromium'
  if (a.includes('chrome')) return 'Chrome'
  return 'Browser'
}

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

interface Props {
  devices: ConnectedDevice[]
}

export function ConnectedDevicesPanel({ devices }: Props) {
  return (
    <div
      style={{
        marginTop: 4,
        borderRadius: 8,
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '6px 12px',
          background: 'var(--bg-elevated)',
          borderBottom: devices.length > 0 ? '1px solid var(--border)' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#4ade80',
            boxShadow: '0 0 5px #4ade80',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {devices.length} connected {devices.length === 1 ? 'device' : 'devices'}
        </span>
      </div>
      {devices.map((d) => (
        <div
          key={d.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 16, flexShrink: 0 }}>{browserIcon(d.agent)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 500 }}>
              {browserName(d.agent)}
              {d.platform && (
                <span style={{ fontWeight: 400, color: 'var(--fg-faint)', marginLeft: 5, fontSize: 11 }}>
                  {d.platform}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 1, display: 'flex', gap: 8 }}>
              <span style={{ fontFamily: 'monospace' }}>{d.ip}</span>
              <span>connected {elapsed(d.connectedAt)} ago</span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
            seen {elapsed(d.lastSeen)}
          </span>
        </div>
      ))}
    </div>
  )
}
