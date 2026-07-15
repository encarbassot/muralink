// Folder shares — each is a static file server on its own port, managed as a
// `share`-driver service in the orchester. Lives in the daemon so any client
// (CLI or Electron) sees and controls the same shares.

import { randomUUID } from 'node:crypto'
import type { Orchester } from './orchester'
import { FrontendServerPool } from './frontend-server'

export interface ShareDef {
  id: string
  label: string
  path: string
  port: number
  domain?: string
}

export class ShareManager {
  private defs = new Map<string, ShareDef>()
  private pool = new FrontendServerPool()

  constructor(private orchester: Orchester) {}

  list(): ShareDef[] {
    return Array.from(this.defs.values())
  }

  // Register a share as an orchester service without starting it.
  #register(def: ShareDef): void {
    const srv = this.pool.get(def.id)
    this.orchester.register({
      id: `share:${def.id}`,
      label: def.label,
      description: 'Folder share',
      port: def.port,
      path: def.path,
      domain: def.domain,
      driver: 'share',
      configurable: true,
      mode: 'embedded',
      async start() {
        const { port } = await srv.start({ servePath: def.path, port: def.port })
        return { port }
      },
      stop: () => srv.stop(),
      currentStatus: () => ({ running: srv.isRunning(), port: srv.port }),
    })
  }

  restore(defs: ShareDef[]): void {
    for (const def of defs) {
      this.defs.set(def.id, def)
      this.#register(def)
    }
  }

  add(opts: { label: string; path: string; port: number; domain?: string }): ShareDef {
    const def: ShareDef = { id: randomUUID(), ...opts }
    this.defs.set(def.id, def)
    this.#register(def)
    return def
  }

  async remove(id: string): Promise<void> {
    await this.orchester.stop(`share:${id}`)
    this.orchester.unregister(`share:${id}`)
    await this.pool.remove(id)
    this.defs.delete(id)
  }

  update(id: string, patch: Partial<Omit<ShareDef, 'id'>>): void {
    const def = this.defs.get(id)
    if (!def) return
    Object.assign(def, patch)
    this.orchester.configure(`share:${id}`, {
      port: patch.port,
      path: patch.path,
      domain: patch.domain,
    })
  }
}
