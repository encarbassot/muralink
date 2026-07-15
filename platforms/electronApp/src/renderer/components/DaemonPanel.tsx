import { useEffect, useState } from 'react'
import type { ManagedService } from '../shared/fsApi.js'

const STATUS_COLOR: Record<string, string> = {
  running: '#4ade80',
  starting: '#facc15',
  stopped: '#6b7280',
  error: '#f87171',
}

export function DaemonPanel() {
  const [services, setServices] = useState<ManagedService[]>([])
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    void window.orchesterApi.getStatus().then(setServices)
    return window.orchesterApi.onStatusChange(setServices)
  }, [])

  async function toggle(svc: ManagedService) {
    setLoading((prev) => ({ ...prev, [svc.id]: true }))
    try {
      if (svc.status === 'running' || svc.status === 'starting') {
        await window.orchesterApi.stop(svc.id)
      } else {
        await window.orchesterApi.start(svc.id)
      }
    } finally {
      setLoading((prev) => ({ ...prev, [svc.id]: false }))
    }
  }

  if (services.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '4px 0',
        width: '100%',
      }}
    >
      {services.map((svc) => (
        <ServiceRow
          key={svc.id}
          service={svc}
          busy={loading[svc.id] ?? false}
          onToggle={() => void toggle(svc)}
        />
      ))}
    </div>
  )
}

function ServiceRow({
  service,
  busy,
  onToggle,
}: {
  service: ManagedService
  busy: boolean
  onToggle: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const isActive = service.status === 'running' || service.status === 'starting'
  const dot = STATUS_COLOR[service.status] ?? '#6b7280'

  return (
    <div
      title={
        service.error
          ? `${service.label}: ${service.error}`
          : `${service.label}${service.port ? ` :${service.port}` : ''}`
      }
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 28,
        borderRadius: 6,
        cursor: busy ? 'wait' : 'pointer',
        background: hovered ? 'var(--muted, #1b2026)' : 'transparent',
        transition: 'background 0.1s',
        position: 'relative',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dot,
          boxShadow: isActive ? `0 0 4px ${dot}` : 'none',
          transition: 'background 0.3s, box-shadow 0.3s',
          opacity: busy ? 0.5 : 1,
        }}
      />
    </div>
  )
}
