// Browser sync client for the video-editor module. This is the reference
// implementation of the wire contract (REST for durable ops + WS for live
// push) — the Android client is a from-scratch reimplementation of the exact
// same contract, not a port of this file, since they don't share a runtime.
// Keep the two in lockstep if either changes: apps/vid-media-lab's
// SyncManager.kt documents the mirrored shape at the top of the file.

import type { YProject, YOp, YAsset, LamportStamp } from '../../types.ts'

export interface VideoEditorClientConfig {
  /** Same value as AppEnv.apiBaseUrl: '' for same-origin, absolute for electron/tunnel. */
  apiBaseUrl: string
  apiToken: string
  /** Stable per-device id used as the Lamport actorId. Persist this — a
   *  device that changes actorId loses causal ordering continuity with its
   *  own past ops (harmless, just resets its "clock identity"). */
  actorId: string
}

export type OpListener = (op: YOp) => void

export class VideoEditorClient {
  #cfg: VideoEditorClientConfig
  #counter = 0
  #ws: WebSocket | undefined
  #wsListeners = new Map<string, Set<OpListener>>() // topic -> listeners

  constructor(cfg: VideoEditorClientConfig) {
    this.#cfg = cfg
  }

  /** Mint a stamp for a new local op — always strictly ahead of anything
   *  this client has produced or observed so far. */
  nextStamp(): LamportStamp {
    this.#counter += 1
    return { counter: this.#counter, actorId: this.#cfg.actorId }
  }

  /** Fold in a stamp seen from a remote op, so the next local op sorts after it. */
  observeStamp(stamp: LamportStamp): void {
    if (stamp.counter > this.#counter) this.#counter = stamp.counter
  }

  async listProjects(): Promise<YProject[]> {
    return this.#get<YProject[]>('/projects')
  }

  async createProject(name: string): Promise<YProject> {
    return this.#post<YProject>('/projects', { name })
  }

  async getProject(id: string): Promise<YProject> {
    return this.#get<YProject>(`/projects/${id}`)
  }

  async getOps(projectId: string, sinceCounter = 0): Promise<YOp[]> {
    const { ops } = await this.#get<{ ops: YOp[] }>(`/projects/${projectId}/ops?since=${sinceCounter}`)
    for (const op of ops) this.observeStamp(op.stamp)
    return ops
  }

  async getAssets(projectId: string): Promise<YAsset[]> {
    const { assets } = await this.#get<{ assets: YAsset[] }>(`/projects/${projectId}/assets`)
    return assets
  }

  /** Durably appends ops (REST). Safe to retry on network failure — server
   *  dedupes by op id. Does NOT wait for the WS echo; other devices learn of
   *  these ops via the hub's publish, triggered server-side after this call
   *  returns 201. */
  async appendOps(projectId: string, ops: YOp[]): Promise<YOp[]> {
    const { ops: accepted } = await this.#post<{ ops: YOp[] }>(`/projects/${projectId}/ops`, { ops })
    return accepted
  }

  /** Opens (or reuses) the realtime socket and subscribes to a project's
   *  topic. Returns an unsubscribe function. Reconnects with backoff on
   *  drop; callers don't need to handle that themselves. */
  subscribe(projectId: string, onOp: OpListener): () => void {
    const topic = `video-editor:${projectId}`
    let set = this.#wsListeners.get(topic)
    if (!set) {
      set = new Set()
      this.#wsListeners.set(topic, set)
    }
    set.add(onOp)
    this.#ensureSocket(topic)

    return () => {
      set!.delete(onOp)
      if (set!.size === 0) this.#wsListeners.delete(topic)
    }
  }

  #ensureSocket(topicToSub: string): void {
    if (this.#ws && (this.#ws.readyState === WebSocket.OPEN || this.#ws.readyState === WebSocket.CONNECTING)) {
      if (this.#ws.readyState === WebSocket.OPEN) this.#send({ type: 'sub', topic: topicToSub })
      return
    }

    const origin = this.#cfg.apiBaseUrl || window.location.origin
    const wsUrl = origin.replace(/^http/, 'ws') + `/api/realtime?token=${encodeURIComponent(this.#cfg.apiToken)}`
    const ws = new WebSocket(wsUrl)
    this.#ws = ws

    ws.addEventListener('open', () => {
      for (const topic of this.#wsListeners.keys()) this.#send({ type: 'sub', topic })
    })

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as
        | { type: 'event'; topic: string; payload: { ops?: YOp[] } }
        | { type: 'ack' | 'error'; [k: string]: unknown }
      if (msg.type !== 'event') return
      const listeners = this.#wsListeners.get(msg.topic)
      if (!listeners) return
      for (const op of msg.payload.ops ?? []) {
        this.observeStamp(op.stamp)
        for (const listener of listeners) listener(op)
      }
    })

    ws.addEventListener('close', () => {
      this.#ws = undefined
      if (this.#wsListeners.size > 0) setTimeout(() => this.#ensureSocket(topicToSub), 1500)
    })
  }

  #send(msg: unknown): void {
    this.#ws?.send(JSON.stringify(msg))
  }

  async #get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.#cfg.apiBaseUrl}/api/video-editor${path}`, {
      headers: { Authorization: `Bearer ${this.#cfg.apiToken}` },
    })
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
    return res.json() as Promise<T>
  }

  async #post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.#cfg.apiBaseUrl}/api/video-editor${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.#cfg.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`)
    return res.json() as Promise<T>
  }
}
