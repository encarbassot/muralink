// Tunnel agent — the host side of the external-folder-share relay.
//
// Holds a persistent OUTBOUND WebSocket to the Tunnel (NAT-friendly: the host
// dials out, no inbound port). For each shared folder it:
//   1. mints a SCOPED TOKEN from its own core (POST /api/shares, master-authed),
//      which pins the folder + role and is enforced by the core,
//   2. registers the share with the Tunnel over the link (share-add),
//   3. on each relayed `req` frame, calls its local core with the scoped token
//      and returns the response.
//
// The scoped token never leaves this process — the Tunnel forwards guest
// requests credential-free. See tunnel/docs/folder-share-relay.md.

import WebSocket from 'ws'

export type Role = 'viewer' | 'editor' | 'admin'

export interface TunnelAgentConfig {
  // ws(s)://host:port/agent/connect
  tunnelWsUrl: string
  instanceId: string
  instanceKey: string
  // Local core base, e.g. http://127.0.0.1:3001
  coreBaseUrl: string
  // Master token for the local core (mint scoped tokens).
  masterToken: string
}

export interface ShareSpec {
  rootPath: string
  role: Role
  // Empty/omitted = public link (no password gate).
  password?: string
  pathLabel: string
  // Set = only that signed-in account may open the share.
  targetEmail?: string | null
  expiresAt?: string | null
  // 'mural' shares one mural entity (rootPath = its file folder); default 'folder'.
  kind?: 'folder' | 'mural'
  // Mural shares: the mural id the scoped token may read via /api/murales/shared.
  muralId?: string
  // Contact-location shares: grants GET /api/contacts/shared-locations,
  // filtered server-side by canView(viewerEmail). No real folder involved —
  // rootPath is just the owner root, to satisfy the scoped-token mint.
  contactLocations?: boolean
  // Any signed-in tunnel account may access (non-public murals).
  requireAccount?: boolean
}

interface RegisteredShare {
  spec: ShareSpec
  scopedToken: string
  tunnelShareId?: string
  url?: string
}

// Response headers worth relaying back (range/stream/download metadata).
const PASS_RES_HEADERS = [
  'content-type', 'content-length', 'content-range',
  'accept-ranges', 'content-disposition', 'cache-control',
]

export class TunnelAgent {
  #ws: WebSocket | null = null
  #shares: RegisteredShare[] = []
  #pendingAdds = new Map<string, (r: { shareId: string; url: string }) => void>()
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null
  #closed = false

  constructor(private cfg: TunnelAgentConfig) {}

  // Snapshot of the shares this agent has registered (for status UIs).
  get shares(): { pathLabel: string; rootPath: string; role: Role; url?: string; tunnelShareId?: string }[] {
    return this.#shares.map((s) => ({
      pathLabel: s.spec.pathLabel,
      rootPath: s.spec.rootPath,
      role: s.spec.role,
      url: s.url,
      tunnelShareId: s.tunnelShareId,
    }))
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.cfg.tunnelWsUrl, {
        headers: {
          'x-instance-id': this.cfg.instanceId,
          'x-instance-key': this.cfg.instanceKey,
        },
      })
      this.#ws = ws

      ws.on('open', () => {
        console.log('[tunnel-agent] link up')
        // Re-register any shares (first connect or reconnect).
        void this.#reregisterAll()
        resolve()
      })
      ws.on('message', (data: WebSocket.RawData) => void this.#onMessage(data))
      ws.on('error', (err: Error) => {
        if (!this.#ws || this.#ws.readyState === WebSocket.CONNECTING) reject(err)
      })
      ws.on('close', () => {
        console.log('[tunnel-agent] link down')
        this.#ws = null
        if (!this.#closed) this.#scheduleReconnect()
      })
    })
  }

  close(): void {
    this.#closed = true
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
    this.#ws?.close()
  }

  #scheduleReconnect(): void {
    if (this.#reconnectTimer) return
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      this.connect().catch(() => this.#scheduleReconnect())
    }, 3000)
  }

  // Public: share a folder. Mints the scoped token, registers with the Tunnel,
  // resolves with the public guest URL.
  async shareFolder(spec: ShareSpec): Promise<{ url: string; tunnelShareId: string }> {
    const scopedToken = await this.#mintScopedToken(spec)
    const reg: RegisteredShare = { spec, scopedToken }
    this.#shares.push(reg)
    const { shareId, url } = await this.#registerWithTunnel(spec)
    reg.tunnelShareId = shareId
    reg.url = url
    return { url, tunnelShareId: shareId }
  }

  // Public: share one mural. The share's folder is the mural's file directory
  // (murales/<id> under the NAS root) so its files ride the storage relay; the
  // scoped token additionally grants reading the mural JSON via
  // /api/murales/shared. Non-public murals require any signed-in account.
  async shareMural(opts: {
    muralId: string
    title: string
    isPublic: boolean
    // Absolute path of the mural's file folder inside the served root.
    filesRoot: string
    expiresAt?: string | null
  }): Promise<{ url: string; tunnelShareId: string }> {
    return this.shareFolder({
      rootPath: opts.filesRoot,
      role: 'viewer',
      pathLabel: opts.title,
      kind: 'mural',
      muralId: opts.muralId,
      requireAccount: !opts.isPublic,
      expiresAt: opts.expiresAt ?? null,
    })
  }

  // Public: invite one contact to poll my published locations. The scoped
  // token grants GET /api/contacts/shared-locations, filtered server-side to
  // whatever that contact's account (targetEmail) may see — see
  // modules/contacts/implementations/server/routes.ts.
  async shareContactLocations(opts: {
    targetEmail: string
    label: string
    // Absolute path inside the served root — no real folder is read; this
    // only satisfies the scoped-token mint's rootPath requirement.
    ownerRoot: string
    expiresAt?: string | null
  }): Promise<{ url: string; tunnelShareId: string }> {
    return this.shareFolder({
      rootPath: opts.ownerRoot,
      role: 'viewer',
      pathLabel: opts.label,
      kind: 'folder',
      contactLocations: true,
      targetEmail: opts.targetEmail,
      requireAccount: true,
      expiresAt: opts.expiresAt ?? null,
    })
  }

  // Mint a scoped token from the local core for this folder + role.
  async #mintScopedToken(spec: ShareSpec): Promise<string> {
    const res = await fetch(`${this.cfg.coreBaseUrl}/api/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.masterToken}` },
      body: JSON.stringify({
        rootPath: spec.rootPath,
        role: spec.role,
        expiresAt: spec.expiresAt ?? null,
        muralId: spec.muralId,
        contactLocations: spec.contactLocations,
        viewerEmail: spec.targetEmail ?? undefined,
      }),
    })
    if (!res.ok) throw new Error(`mint scoped token failed: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as { token: string }
    return data.token
  }

  #registerWithTunnel(spec: ShareSpec): Promise<{ shareId: string; url: string }> {
    return new Promise((resolve, reject) => {
      const ws = this.#ws
      if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('link not open')); return }
      const reqId = Math.random().toString(36).slice(2)
      const timer = setTimeout(() => { this.#pendingAdds.delete(reqId); reject(new Error('share-add timeout')) }, 10_000)
      this.#pendingAdds.set(reqId, (r) => { clearTimeout(timer); resolve(r) })
      ws.send(JSON.stringify({
        t: 'share-add',
        reqId,
        role: spec.role,
        pathLabel: spec.pathLabel,
        password: spec.password ?? '',
        targetEmail: spec.targetEmail ?? null,
        expiresAt: spec.expiresAt ?? null,
        kind: spec.kind ?? 'folder',
        requireAccount: spec.requireAccount === true,
      }))
    })
  }

  async #reregisterAll(): Promise<void> {
    for (const reg of this.#shares) {
      try {
        // Core may have restarted — re-mint to be safe.
        reg.scopedToken = await this.#mintScopedToken(reg.spec)
        const { shareId, url } = await this.#registerWithTunnel(reg.spec)
        reg.tunnelShareId = shareId
        reg.url = url
      } catch (e) {
        console.warn('[tunnel-agent] re-register failed:', String(e))
      }
    }
  }

  async #onMessage(data: WebSocket.RawData): Promise<void> {
    let msg: { t?: string; [k: string]: unknown }
    try { msg = JSON.parse(data.toString()) } catch { return }

    if (msg['t'] === 'share-added') {
      const cb = this.#pendingAdds.get(String(msg['reqId']))
      if (cb) { this.#pendingAdds.delete(String(msg['reqId'])); cb({ shareId: String(msg['shareId']), url: String(msg['url']) }) }
      return
    }
    if (msg['t'] === 'share-error') {
      const reqId = String(msg['reqId'])
      this.#pendingAdds.delete(reqId)
      console.warn('[tunnel-agent] share-error:', msg['error'])
      return
    }
    if (msg['t'] === 'req') {
      await this.#handleRelayedRequest(msg as unknown as RelayReqFrame)
      return
    }
  }

  // Execute a relayed guest request against the local core with the scoped token.
  async #handleRelayedRequest(frame: RelayReqFrame): Promise<void> {
    const ws = this.#ws
    if (!ws) return
    const reg = this.#shares.find((s) => s.tunnelShareId === frame.shareId)
    if (!reg) {
      ws.send(JSON.stringify({ t: 'res', id: frame.id, status: 404, bodyB64: Buffer.from('unknown share').toString('base64') }))
      return
    }

    const qs = frame.query ? `?${frame.query}` : ''
    const url = `${this.cfg.coreBaseUrl}${frame.path}${qs}`
    const headers: Record<string, string> = { ...frame.headers, Authorization: `Bearer ${reg.scopedToken}` }

    try {
      const res = await fetch(url, {
        method: frame.method,
        headers,
        body: frame.bodyB64 ? Buffer.from(frame.bodyB64, 'base64') : undefined,
      })
      const resHeaders: Record<string, string> = {}
      for (const h of PASS_RES_HEADERS) {
        const v = res.headers.get(h)
        if (v) resHeaders[h] = v
      }
      const buf = Buffer.from(await res.arrayBuffer())
      ws.send(JSON.stringify({ t: 'res', id: frame.id, status: res.status, headers: resHeaders, bodyB64: buf.toString('base64') }))
    } catch (e) {
      ws.send(JSON.stringify({ t: 'res', id: frame.id, status: 502, bodyB64: Buffer.from(String(e)).toString('base64') }))
    }
  }
}

interface RelayReqFrame {
  t: 'req'
  id: string
  shareId: string
  method: string
  path: string
  query: string
  headers: Record<string, string>
  bodyB64?: string
}
