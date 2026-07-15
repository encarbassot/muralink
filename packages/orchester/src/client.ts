// Client for the orchester control socket.
// Used by both the Ink CLI and the Electron main-process adapter so they drive
// the exact same daemon. CLI is the master; this is just a thin dialer.

import * as net from 'node:net'
import * as fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ManagedService } from './orchester'
import type { AccountStatus, LinkParams } from './account'
import type { RpcRequest, RpcMessage, RpcResponse, LogLine } from './protocol'
import { isEvent } from './protocol'
import { paths } from './paths'

export type StatusListener = (status: ManagedService[]) => void
export type LogListener = (entry: LogLine) => void

export class OrchesterClient {
  private sock: net.Socket | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private statusListeners = new Set<StatusListener>()
  private logListeners = new Set<LogListener>()
  private buf = ''

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = net.connect(paths.socket)
      sock.once('connect', () => {
        this.sock = sock
        resolve()
      })
      sock.once('error', reject)
      sock.on('data', (chunk) => this.#onData(chunk))
      sock.on('close', () => {
        this.sock = null
        for (const { reject: rej } of this.pending.values()) rej(new Error('socket closed'))
        this.pending.clear()
      })
    })
  }

  #onData(chunk: Buffer): void {
    this.buf += chunk.toString('utf-8')
    let nl: number
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim()
      this.buf = this.buf.slice(nl + 1)
      if (!line) continue
      let msg: RpcMessage
      try {
        msg = JSON.parse(line) as RpcMessage
      } catch {
        continue
      }
      if (isEvent(msg)) {
        if (msg.event === 'log') {
          for (const l of this.logListeners) l(msg.data)
        } else {
          for (const l of this.statusListeners) l(msg.data)
        }
        continue
      }
      const res = msg as RpcResponse
      const p = this.pending.get(res.id)
      if (!p) continue
      this.pending.delete(res.id)
      if (res.ok) p.resolve(res.result)
      else p.reject(new Error(res.error ?? 'rpc error'))
    }
  }

  #call(method: RpcRequest['method'], params?: Record<string, unknown>): Promise<unknown> {
    if (!this.sock) return Promise.reject(new Error('not connected'))
    const id = this.nextId++
    const req: RpcRequest = { id, method, params }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.sock!.write(JSON.stringify(req) + '\n')
    })
  }

  ping(): Promise<string> {
    return this.#call('ping') as Promise<string>
  }

  status(): Promise<ManagedService[]> {
    return this.#call('status') as Promise<ManagedService[]>
  }

  start(id: string): Promise<ManagedService[]> {
    return this.#call('start', { id }) as Promise<ManagedService[]>
  }

  stop(id: string): Promise<ManagedService[]> {
    return this.#call('stop', { id }) as Promise<ManagedService[]>
  }

  restart(id: string): Promise<ManagedService[]> {
    return this.#call('restart', { id }) as Promise<ManagedService[]>
  }

  configure(id: string, opts: { port?: number; path?: string; domain?: string }): Promise<ManagedService[]> {
    return this.#call('configure', { id, ...opts }) as Promise<ManagedService[]>
  }

  addShare(opts: { label: string; path: string; port: number; domain?: string }): Promise<ManagedService[]> {
    return this.#call('addShare', opts) as Promise<ManagedService[]>
  }

  removeShare(id: string): Promise<ManagedService[]> {
    return this.#call('removeShare', { id }) as Promise<ManagedService[]>
  }

  updateShare(id: string, patch: { label?: string; port?: number; path?: string; domain?: string }): Promise<ManagedService[]> {
    return this.#call('updateShare', { id, ...patch }) as Promise<ManagedService[]>
  }

  // Recent log lines for a service (oldest first).
  logs(id: string): Promise<string[]> {
    return this.#call('logs', { id }) as Promise<string[]>
  }

  // Account link (anonymous-first): status, login (link this instance to a
  // Tunnel account), logout (revoke + go anonymous).
  accountStatus(): Promise<AccountStatus> {
    return this.#call('accountStatus') as Promise<AccountStatus>
  }

  accountLogin(params: LinkParams): Promise<AccountStatus> {
    return this.#call('accountLogin', { ...params }) as Promise<AccountStatus>
  }

  accountLogout(): Promise<AccountStatus> {
    return this.#call('accountLogout') as Promise<AccountStatus>
  }

  // Subscribe to live status-change events. Returns an unsubscribe fn.
  subscribe(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    void this.#call('subscribe').then((initial) => listener(initial as ManagedService[]))
    return () => this.statusListeners.delete(listener)
  }

  // Subscribe to live log lines (all services). Returns an unsubscribe fn.
  // Requires an active subscription (call subscribe() once first).
  subscribeLogs(listener: LogListener): () => void {
    this.logListeners.add(listener)
    return () => this.logListeners.delete(listener)
  }

  close(): void {
    this.sock?.end()
    this.sock = null
  }
}

// Connect to a running daemon, spawning one (detached) if the socket is dead.
// This is what makes Electron "seamless": opening the app on the same machine
// transparently brings up the shared orchester.
export async function ensureDaemon(timeoutMs = 8000): Promise<OrchesterClient> {
  const client = new OrchesterClient()
  try {
    await client.connect()
    return client
  } catch {
    // no live daemon — spawn one
  }

  try { fs.unlinkSync(paths.socket) } catch { /* ignore */ }

  const here = dirname(fileURLToPath(import.meta.url))
  const daemonMain = join(here, 'daemon-main.ts')
  const child = spawn('npx', ['tsx', daemonMain], {
    detached: true,
    stdio: 'ignore',
    cwd: here,
  })
  child.unref()

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const c = new OrchesterClient()
      await c.connect()
      return c
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error('could not start orchester daemon')
}
