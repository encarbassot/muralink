// Unix-socket control server for the orchester.
// Speaks newline-delimited JSON (see protocol.ts). One Orchester singleton sits
// behind it; the CLI and the Electron adapter are clients.

import * as net from 'node:net'
import * as fs from 'node:fs'
import type { Orchester, ManagedService } from './orchester'
import type { RpcRequest, RpcResponse, RpcEvent, StatusEvent, LogEvent, LogLine } from './protocol'
import type { ShareManager, ShareDef } from './shares'
import { paths, ensureHome } from './paths'
import {
  AccountAgent,
  loadAccount,
  linkAccount,
  unlinkAccount,
  type AccountStatus,
} from './account'

interface PersistedConfig {
  // per-service overrides applied on boot
  services: Record<string, { port?: number; path?: string; domain?: string }>
  // folder shares
  shares: ShareDef[]
}

function loadPersisted(): PersistedConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(paths.state, 'utf-8')) as Partial<PersistedConfig>
    return { services: raw.services ?? {}, shares: raw.shares ?? [] }
  } catch {
    return { services: {}, shares: [] }
  }
}

function persist(status: ManagedService[], shares: ShareDef[]): void {
  const cfg: PersistedConfig = { services: {}, shares }
  for (const s of status) {
    // share services are persisted via `shares`, not here
    if (s.id.startsWith('share:')) continue
    if (s.port !== undefined || s.path !== undefined || s.domain !== undefined) {
      cfg.services[s.id] = { port: s.port, path: s.path, domain: s.domain }
    }
  }
  try {
    fs.writeFileSync(paths.state, JSON.stringify(cfg, null, 2))
  } catch {
    // best-effort persistence
  }
}

export interface Daemon {
  server: net.Server
  close(): Promise<void>
}

// Applies saved overrides, then starts listening. Rejects if the socket is
// already owned by a live daemon (single-instance guarantee).
export function startDaemon(orchester: Orchester, shares?: ShareManager): Promise<Daemon> {
  ensureHome()

  // Re-apply persisted config overrides onto registered services.
  const persisted = loadPersisted()
  for (const [id, opts] of Object.entries(persisted.services)) {
    if (orchester.has(id)) orchester.configure(id, opts)
  }
  // Restore persisted folder shares.
  if (shares) shares.restore(persisted.shares)

  // Anonymous-first: only dials the Tunnel if account.json exists. Bringing the
  // agent link up on boot is what marks a linked instance "online".
  const account = new AccountAgent()
  void account.refresh()

  function accountStatus(): AccountStatus {
    const link = loadAccount()
    if (!link) return { linked: false }
    return {
      linked: true,
      email: link.email,
      instanceId: link.instanceId,
      tunnelBaseUrl: link.tunnelBaseUrl,
      online: account.online,
    }
  }

  const subscribers = new Set<net.Socket>()

  function broadcast(evt: RpcEvent): void {
    const line = JSON.stringify(evt) + '\n'
    for (const sock of subscribers) sock.write(line)
  }

  orchester.on('status-change', (status: ManagedService[]) => {
    persist(status, shares?.list() ?? [])
    broadcast({ id: 0, event: 'status-change', data: status } satisfies StatusEvent)
  })

  orchester.on('log', (data: LogLine) => {
    broadcast({ id: 0, event: 'log', data } satisfies LogEvent)
  })

  async function dispatch(req: RpcRequest): Promise<unknown> {
    const p = req.params ?? {}
    const id = (p['id'] as string) ?? ''
    switch (req.method) {
      case 'ping':
        return 'pong'
      case 'status':
        return orchester.getStatus()
      case 'start':
        await orchester.start(id)
        return orchester.getStatus()
      case 'stop':
        await orchester.stop(id)
        return orchester.getStatus()
      case 'restart':
        await orchester.restart(id)
        return orchester.getStatus()
      case 'configure':
        orchester.configure(id, {
          port: p['port'] as number | undefined,
          path: p['path'] as string | undefined,
          domain: p['domain'] as string | undefined,
        })
        return orchester.getStatus()
      case 'addShare': {
        if (!shares) throw new Error('shares not available')
        shares.add({
          label: p['label'] as string,
          path: p['path'] as string,
          port: p['port'] as number,
          domain: p['domain'] as string | undefined,
        })
        persist(orchester.getStatus(), shares.list())
        return orchester.getStatus()
      }
      case 'removeShare': {
        if (!shares) throw new Error('shares not available')
        await shares.remove(id)
        persist(orchester.getStatus(), shares.list())
        return orchester.getStatus()
      }
      case 'updateShare': {
        if (!shares) throw new Error('shares not available')
        shares.update(id, {
          label: p['label'] as string | undefined,
          port: p['port'] as number | undefined,
          path: p['path'] as string | undefined,
          domain: p['domain'] as string | undefined,
        })
        persist(orchester.getStatus(), shares.list())
        return orchester.getStatus()
      }
      case 'logs':
        return orchester.getLogs(id)
      case 'accountStatus':
        return accountStatus()
      case 'accountLogin': {
        await linkAccount({
          tunnelBaseUrl: p['tunnelBaseUrl'] as string,
          email: p['email'] as string,
          password: p['password'] as string,
          label: (p['label'] as string | undefined) ?? 'instance',
        })
        await account.refresh()
        return accountStatus()
      }
      case 'accountLogout': {
        await unlinkAccount()
        account.stop()
        return accountStatus()
      }
      case 'subscribe':
        return orchester.getStatus()
      default:
        throw new Error(`Unknown method: ${req.method}`)
    }
  }

  const server = net.createServer((sock) => {
    let buf = ''
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf-8')
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let req: RpcRequest
        try {
          req = JSON.parse(line) as RpcRequest
        } catch {
          continue
        }
        if (req.method === 'subscribe') subscribers.add(sock)
        dispatch(req)
          .then((result) => {
            const res: RpcResponse = { id: req.id, ok: true, result }
            sock.write(JSON.stringify(res) + '\n')
          })
          .catch((err: unknown) => {
            const res: RpcResponse = { id: req.id, ok: false, error: String(err) }
            sock.write(JSON.stringify(res) + '\n')
          })
      }
    })
    sock.on('close', () => subscribers.delete(sock))
    sock.on('error', () => subscribers.delete(sock))
  })

  return new Promise((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Stale socket from a dead daemon? Probe it; if dead, unlink and retry.
        const probe = net.connect(paths.socket)
        probe.once('error', () => {
          try { fs.unlinkSync(paths.socket) } catch { /* ignore */ }
          server.listen(paths.socket, () => resolve(makeDaemon()))
        })
        probe.once('connect', () => {
          probe.destroy()
          reject(new Error('orchester daemon already running'))
        })
        return
      }
      reject(err)
    })

    server.listen(paths.socket, () => resolve(makeDaemon()))

    function makeDaemon(): Daemon {
      return {
        server,
        close() {
          return new Promise<void>((res) => {
            account.stop()
            for (const s of subscribers) s.destroy()
            server.close(() => {
              try { fs.unlinkSync(paths.socket) } catch { /* ignore */ }
              res()
            })
          })
        },
      }
    }
  })
}
