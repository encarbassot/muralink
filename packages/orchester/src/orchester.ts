// The orchester core — platform-neutral service manager.
// Moved out of the Electron main process so a headless instance (CLI / daemon)
// owns it and Electron becomes just another client. No Electron imports here.

import { EventEmitter } from 'node:events'
import { type ChildProcess, spawn } from 'node:child_process'

export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'error'
export type ServiceDriver = 'embedded' | 'process' | 'docker' | 'pm2' | 'web-frontend' | 'share'

export interface ManagedService {
  id: string
  label: string
  description?: string
  port?: number
  domain?: string
  path?: string
  status: ServiceStatus
  pid?: number
  error?: string
  driver: ServiceDriver
  configurable?: boolean
}

export type EmbeddedConfig = {
  id: string
  label: string
  description?: string
  port?: number
  domain?: string
  path?: string
  driver?: ServiceDriver
  configurable?: boolean
  mode: 'embedded'
  start(): Promise<{ port?: number }>
  stop(): Promise<void>
  currentStatus(): { running: boolean; port: number | null }
}

export type ProcessConfig = {
  id: string
  label: string
  description?: string
  port?: number
  domain?: string
  path?: string
  driver?: ServiceDriver
  configurable?: boolean
  mode: 'process'
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

export type ServiceConfig = EmbeddedConfig | ProcessConfig

interface ServiceState {
  config: ServiceConfig
  status: ServiceStatus
  pid?: number
  proc?: ChildProcess
  error?: string
  intentionalStop?: boolean
}

export class Orchester extends EventEmitter {
  private services = new Map<string, ServiceState>()
  private logs = new Map<string, string[]>()
  static readonly LOG_CAP = 200

  // Recent log lines for a service (oldest first).
  getLogs(serviceId: string): string[] {
    return this.logs.get(serviceId) ?? []
  }

  // Append one or more lines to a service log and emit a `log` event per line.
  #log(serviceId: string, chunk: string): void {
    const arr = this.logs.get(serviceId) ?? []
    for (const raw of chunk.split(/\r?\n/)) {
      const line = raw.trimEnd()
      if (!line) continue
      arr.push(line)
      this.emit('log', { id: serviceId, line })
    }
    while (arr.length > Orchester.LOG_CAP) arr.shift()
    this.logs.set(serviceId, arr)
  }

  register(config: ServiceConfig): void {
    if (this.services.has(config.id)) return
    let initialStatus: ServiceStatus = 'stopped'
    let initialPid: number | undefined
    if (config.mode === 'embedded') {
      const cur = config.currentStatus()
      if (cur.running) {
        initialStatus = 'running'
        initialPid = process.pid
      }
    }
    this.services.set(config.id, { config, status: initialStatus, pid: initialPid })
    this.emit('status-change', this.getStatus())
  }

  has(serviceId: string): boolean {
    return this.services.has(serviceId)
  }

  getStatus(): ManagedService[] {
    return Array.from(this.services.values()).map(({ config, status, pid, error }) => ({
      id: config.id,
      label: config.label,
      description: config.description,
      port: config.port,
      domain: config.domain,
      path: config.path,
      status,
      pid,
      error,
      driver: config.driver ?? (config.mode === 'process' ? 'process' : 'embedded'),
      configurable: config.configurable ?? false,
    }))
  }

  unregister(serviceId: string): void {
    this.services.delete(serviceId)
    this.emit('status-change', this.getStatus())
  }

  configure(serviceId: string, opts: { port?: number; path?: string; domain?: string }): void {
    const state = this.services.get(serviceId)
    if (!state) return
    if (opts.port !== undefined) state.config.port = opts.port
    if (opts.path !== undefined) state.config.path = opts.path
    if (opts.domain !== undefined) state.config.domain = opts.domain
    this.emit('status-change', this.getStatus())
  }

  async start(serviceId: string): Promise<void> {
    const state = this.services.get(serviceId)
    if (!state) throw new Error(`Unknown service: ${serviceId}`)
    if (state.status === 'running' || state.status === 'starting') return

    this.#setStatus(serviceId, 'starting')

    try {
      if (state.config.mode === 'embedded') {
        const result = await state.config.start()
        state.config.port = result.port ?? state.config.port
        state.pid = process.pid
        this.#setStatus(serviceId, 'running')
      } else {
        await this.#spawnProcess(serviceId, state)
      }
    } catch (err) {
      this.#setStatus(serviceId, 'error', String(err))
    }
  }

  async stop(serviceId: string): Promise<void> {
    const state = this.services.get(serviceId)
    if (!state) throw new Error(`Unknown service: ${serviceId}`)
    if (state.status === 'stopped') return

    try {
      if (state.config.mode === 'embedded') {
        await state.config.stop()
      } else {
        state.intentionalStop = true
        this.#killProcessTree(state)
        state.proc = undefined
      }
      state.pid = undefined
      this.#setStatus(serviceId, 'stopped')
    } catch (err) {
      this.#setStatus(serviceId, 'error', String(err))
    }
  }

  // Kill a spawned process and its whole group. Processes are spawned detached
  // (own process group), so a process runner like tsx that forks a child node
  // is reaped together — no orphan left holding the port.
  #killProcessTree(state: ServiceState): void {
    const pid = state.proc?.pid
    if (!pid) return
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      try { state.proc?.kill('SIGTERM') } catch { /* already gone */ }
    }
  }

  async restart(serviceId: string): Promise<void> {
    await this.stop(serviceId)
    await this.start(serviceId)
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.services.keys()).map((id) => this.stop(id)),
    )
  }

  // ── Private ────────────────────────────────────────────────────────────────

  #setStatus(serviceId: string, status: ServiceStatus, error?: string) {
    const state = this.services.get(serviceId)
    if (!state) return
    state.status = status
    state.error = error
    this.#log(serviceId, `[status] ${status}${error ? ` — ${error}` : ''}`)
    this.emit('status-change', this.getStatus())
  }

  async #spawnProcess(serviceId: string, state: ServiceState): Promise<void> {
    const cfg = state.config as ProcessConfig
    state.intentionalStop = false
    return new Promise((resolve, reject) => {
      const proc = spawn(cfg.command, cfg.args, {
        cwd: cfg.cwd,
        env: { ...process.env, ...cfg.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        // Own process group so stop() can kill the whole tree (tsx + its child).
        detached: true,
      })

      state.proc = proc
      state.pid = proc.pid

      proc.stdout?.on('data', (d: Buffer) => {
        this.#log(serviceId, d.toString())
        if (state.status === 'starting') {
          this.#setStatus(serviceId, 'running')
          resolve()
        }
      })

      proc.stderr?.on('data', (d: Buffer) => {
        this.#log(serviceId, d.toString())
      })

      proc.on('error', (err) => {
        if (state.proc !== proc) return // superseded by a newer spawn
        this.#setStatus(serviceId, 'error', err.message)
        reject(err)
      })

      proc.on('exit', (code) => {
        // A fast restart can leave this old process's exit arriving after a new
        // one is already running — ignore it so it doesn't clobber the new state.
        if (state.proc !== proc) { resolve(); return }
        state.proc = undefined
        state.pid = undefined
        // Killed on purpose by stop()/restart() — already handled there.
        if (state.intentionalStop) {
          state.intentionalStop = false
          resolve()
          return
        }
        if (state.status === 'starting') {
          const msg = `Process exited with code ${code ?? 'null'} before ready`
          this.#setStatus(serviceId, 'error', msg)
          reject(new Error(msg))
        } else {
          this.#setStatus(serviceId, 'stopped')
        }
      })

      // Assume process is running after 2s if no stdout yet (silent daemon)
      setTimeout(() => {
        if (state.status === 'starting') {
          this.#setStatus(serviceId, 'running')
          resolve()
        }
      }, 2000)
    })
  }
}
