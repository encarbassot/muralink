import { useState, useEffect, useCallback } from 'react'
import { Card, Button, BentoGrid, BentoCell } from '@muralink/ui'
import { CalendarWidget } from '@muralink/module-calendar/web'
import { api, type Instance } from '../api.ts'

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000
}

export function Dashboard() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [showRegister, setShowRegister] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newKey, setNewKey] = useState<{ id: string; label: string; apiKey: string } | null>(null)
  const [registering, setRegistering] = useState(false)

  const load = useCallback((): void => {
    api.instances.list()
      .then(({ instances: list }) => setInstances(list))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function register() {
    if (!newLabel.trim()) return
    setRegistering(true)
    try {
      const result = await api.instances.register(newLabel.trim())
      setNewKey(result)
      setNewLabel('')
      load()
    } catch {
      // ignore
    } finally {
      setRegistering(false)
    }
  }

  async function remove(id: string) {
    await api.instances.delete(id).catch(() => null)
    load()
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <BentoGrid cols={1} cellSize={180} gap={10}>
          <BentoCell cols={1} rows={2}>
            <CalendarWidget size="1x2" events={[]} />
          </BentoCell>
        </BentoGrid>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Instances</h1>
        <Button size="sm" onClick={() => setShowRegister(v => !v)}>
          + Register instance
        </Button>
      </div>

      {showRegister && (
        <Card style={{ marginBottom: 20 }} padding={16}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-fg)', display: 'block', marginBottom: 4 }}>
                Instance label
              </label>
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Home laptop, Office server"
                style={{
                  height: 36, padding: '0 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--fg)', fontSize: 14, outline: 'none', width: '100%',
                }}
                onKeyDown={e => { if (e.key === 'Enter') { void register() } }}
              />
            </div>
            <Button onClick={() => { void register() }} loading={registering}>Register</Button>
            <Button variant="ghost" onClick={() => { setShowRegister(false); setNewKey(null) }}>Cancel</Button>
          </div>

          {newKey && (
            <div style={{
              marginTop: 16, padding: 12, borderRadius: 8,
              background: 'var(--muted)', border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--accent)' }}>
                Instance registered — copy your API key now (shown once only)
              </div>
              <code style={{
                display: 'block', fontSize: 12, wordBreak: 'break-all',
                fontFamily: 'JetBrains Mono, monospace', padding: '8px 10px',
                background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)',
              }}>
                {newKey.apiKey}
              </code>
            </div>
          )}
        </Card>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted-fg)', fontSize: 14 }}>Loading…</div>
      ) : instances.length === 0 ? (
        <div style={{ color: 'var(--muted-fg)', fontSize: 14 }}>No instances registered yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {instances.map(inst => (
            <Card key={inst.id} padding={14} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: isOnline(inst.lastSeen) ? '#22c55e' : 'var(--border)',
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{inst.label}</div>
                <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginTop: 2 }}>
                  {inst.lastSeen ? `Last seen ${timeSince(inst.lastSeen)}` : 'Never connected'}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { void remove(inst.id) }}>
                Revoke
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
