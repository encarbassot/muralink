import { useEffect, useState } from 'react'
import type { ManagedService, ConnectedDevice } from '@/shared/fsApi'
import { ServiceCard } from './ServiceCard.js'
import { ServiceConfigModal } from './ServiceConfigModal.js'
import { AddShareModal } from './AddShareModal.js'
import { ConnectedDevicesPanel } from './ConnectedDevicesPanel.js'

export function OrchesterApp() {
  const [services, setServices] = useState<ManagedService[]>([])
  const [devices, setDevices] = useState<ConnectedDevice[]>([])
  const [configTarget, setConfigTarget] = useState<ManagedService | null>(null)
  const [addingShare, setAddingShare] = useState(false)
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    void window.orchesterApi.getStatus().then(setServices)
    return window.orchesterApi.onStatusChange(setServices)
  }, [])

  useEffect(() => {
    void window.presenceApi.getDevices().then(setDevices)
    return window.presenceApi.onDevicesChange(setDevices)
  }, [])

  async function toggle(svc: ManagedService) {
    setLoading((p) => ({ ...p, [svc.id]: true }))
    try {
      if (svc.status === 'running' || svc.status === 'starting') {
        await window.orchesterApi.stop(svc.id)
      } else {
        await window.orchesterApi.start(svc.id)
      }
    } finally {
      setLoading((p) => ({ ...p, [svc.id]: false }))
    }
  }

  async function restart(svc: ManagedService) {
    setLoading((p) => ({ ...p, [svc.id]: true }))
    try {
      await window.orchesterApi.restart(svc.id)
    } finally {
      setLoading((p) => ({ ...p, [svc.id]: false }))
    }
  }

  async function handleConfigure(
    svc: ManagedService,
    opts: { port?: number; path?: string; domain?: string },
  ) {
    await window.orchesterApi.configure(svc.id, opts)
    setConfigTarget(null)
  }

  async function handleRemoveShare(svc: ManagedService) {
    // id is "share:<uuid>"
    const rawId = svc.id.replace(/^share:/, '')
    setLoading((p) => ({ ...p, [svc.id]: true }))
    try {
      await window.orchesterApi.removeShare(rawId)
    } finally {
      setLoading((p) => ({ ...p, [svc.id]: false }))
    }
  }

  // Split into core services and folder shares
  const core = services.filter((s) => s.driver !== 'share')
  const shares = services.filter((s) => s.driver === 'share')
  const runningCount = services.filter((s) => s.status === 'running').length

  function cardProps(svc: ManagedService) {
    return {
      service: svc,
      busy: loading[svc.id] ?? false,
      onToggle: () => void toggle(svc),
      onRestart: () => void restart(svc),
      onConfigure: svc.configurable ? () => setConfigTarget(svc) : undefined,
      onDelete: svc.driver === 'share' ? () => void handleRemoveShare(svc) : undefined,
    }
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '20px 24px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🎛</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Orchester</div>
          <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
            {runningCount} running · {services.length} total
          </div>
        </div>
      </div>

      {/* Core services — api + web-frontend */}
      <Section label="Core">
        {core.map((svc) => (
          <ServiceCard key={svc.id} {...cardProps(svc)} />
        ))}
        {core.length === 0 && (
          <Empty>No core services</Empty>
        )}
        {/* Show connected devices under web-frontend */}
        {devices.length > 0 && (
          <ConnectedDevicesPanel devices={devices} />
        )}
      </Section>

      {/* Folder shares — user-created, N instances */}
      <Section
        label="Folder shares"
        action={
          <button
            onClick={() => setAddingShare(true)}
            style={{
              fontSize: 11,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            + Add share
          </button>
        }
      >
        {shares.map((svc) => (
          <ServiceCard key={svc.id} {...cardProps(svc)} />
        ))}
        {shares.length === 0 && (
          <Empty>No shares — click "+ Add share" to expose a folder over HTTP</Empty>
        )}
      </Section>

      {configTarget && (
        <ServiceConfigModal
          service={configTarget}
          onSave={(opts) => void handleConfigure(configTarget, opts)}
          onClose={() => setConfigTarget(null)}
        />
      )}

      {addingShare && (
        <AddShareModal
          onAdd={async (opts) => {
            await window.orchesterApi.addShare(opts)
            setAddingShare(false)
          }}
          onClose={() => setAddingShare(false)}
        />
      )}
    </div>
  )
}

function Section({
  label,
  action,
  children,
}: {
  label: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 4,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--fg-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--fg-faint)', padding: '8px 4px' }}>
      {children}
    </div>
  )
}
