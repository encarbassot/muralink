import { EventEmitter } from 'node:events'

export interface ConnectedDevice {
  id: string
  agent: string
  platform: string
  ip: string
  connectedAt: string
  lastSeen: string
}

class PresenceService extends EventEmitter {
  private devices = new Map<string, ConnectedDevice>()
  private expiry: NodeJS.Timeout | null = null
  private readonly TTL_MS = 90_000

  start(): void {
    if (this.expiry) return
    this.expiry = setInterval(() => this.#evict(), 15_000)
    this.expiry.unref()
  }

  stop(): void {
    if (this.expiry) {
      clearInterval(this.expiry)
      this.expiry = null
    }
    this.devices.clear()
  }

  hello(id: string, agent: string, platform: string, ip: string): void {
    const existing = this.devices.get(id)
    this.devices.set(id, {
      id,
      agent,
      platform,
      ip,
      connectedAt: existing?.connectedAt ?? new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    })
    this.emit('change', this.list())
  }

  bye(id: string): void {
    if (this.devices.has(id)) {
      this.devices.delete(id)
      this.emit('change', this.list())
    }
  }

  list(): ConnectedDevice[] {
    return Array.from(this.devices.values())
  }

  #evict(): void {
    const cutoff = Date.now() - this.TTL_MS
    let changed = false
    for (const [id, d] of this.devices) {
      if (new Date(d.lastSeen).getTime() < cutoff) {
        this.devices.delete(id)
        changed = true
      }
    }
    if (changed) this.emit('change', this.list())
  }
}

export const presenceService = new PresenceService()
