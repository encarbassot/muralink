// Electron ↔ orchester adapter.
// The orchester now lives in a headless daemon (packages/orchester). Electron is
// just a client: it ensures the daemon is up, then proxies the renderer's
// orchester:* IPC calls to it. This is what makes the desktop UI feel like the
// orchester's own surface while the CLI remains the master.

import { BrowserWindow } from 'electron'
import { ensureDaemon, type OrchesterClient } from '@muralink/orchester/client'
import type { ManagedService, LinkParams } from '@muralink/orchester'

let client: OrchesterClient | null = null
let ready: Promise<OrchesterClient> | null = null

// Connect (spawning the daemon if needed) and forward status changes to all
// renderer windows. Safe to call multiple times — connects once.
export function initOrchester(): Promise<OrchesterClient> {
  if (ready) return ready
  ready = ensureDaemon().then((c) => {
    client = c
    c.subscribe((services: ManagedService[]) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('orchester:status-change', services)
      }
    })
    return c
  })
  return ready
}

async function get(): Promise<OrchesterClient> {
  return client ?? (await initOrchester())
}

export const orchesterAdapter = {
  status: async () => (await get()).status(),
  start: async (id: string) => (await get()).start(id),
  stop: async (id: string) => (await get()).stop(id),
  restart: async (id: string) => (await get()).restart(id),
  configure: async (id: string, opts: { port?: number; path?: string; domain?: string }) =>
    (await get()).configure(id, opts),
  addShare: async (opts: { label: string; path: string; port: number; domain?: string }) =>
    (await get()).addShare(opts),
  removeShare: async (id: string) => (await get()).removeShare(id),
  updateShare: async (id: string, patch: { label?: string; port?: number; path?: string; domain?: string }) =>
    (await get()).updateShare(id, patch),
  accountStatus: async () => (await get()).accountStatus(),
  accountLogin: async (params: LinkParams) => (await get()).accountLogin(params),
  accountLogout: async () => (await get()).accountLogout(),
  close: () => {
    client?.close()
    client = null
    ready = null
  },
}
