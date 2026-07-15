// Presence — browser tabs / devices announce themselves to the instance so the
// orchester (CLI or Electron) can show "connected devices". Moved out of the
// Electron main process into the core so there is one source of truth.
//
// Mounted BEFORE auth middleware: the injected presence script is anonymous.

import { EventEmitter } from 'node:events'
import { Router, type Request, type Response } from 'express'

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

export function createPresenceRouter(): Router {
  const router = Router()

  router.post('/hello', (req: Request, res: Response) => {
    const { id, agent = '', platform = '' } = req.body as { id?: string; agent?: string; platform?: string }
    if (!id) { res.status(400).json({ error: 'missing id' }); return }
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown'
    presenceService.hello(id, agent, platform, ip)
    res.json({ ok: true })
  })

  router.post('/bye', (req: Request, res: Response) => {
    const { id } = req.body as { id?: string }
    if (id) presenceService.bye(id)
    res.json({ ok: true })
  })

  router.get('/devices', (_req: Request, res: Response) => {
    res.json({ devices: presenceService.list() })
  })

  return router
}
