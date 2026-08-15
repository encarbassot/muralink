// Realtime transport for cloud vaults. Holds one WebSocket to the master's
// /ws/vault; the master pushes a payload-free { type:'change', resource } event
// whenever another device mutates vault data. Subscribers (the cloud layout
// adapter) match the resource to their layout and refetch.
//
// The transport is deliberately thin and swappable: makeCloudLayoutAdapter only
// depends on the `subscribe(layoutId, onInvalidate)` shape, so a later
// decentralized source (orchester relay / p2p) can replace this WS without any
// client change. See CloudLayoutAdapterConfig.subscribe.
//
// Robustness: auto-reconnect with capped backoff, and on every (re)connect a
// full resync — fire every subscriber so adapters pull anything missed while the
// socket was down. LWW on updatedAt makes a redundant refetch harmless.

export interface VaultSync {
  /** Subscribe a layout to remote-change notifications. Returns unsubscribe. */
  subscribe(layoutId: string, onInvalidate: () => void): () => void
  close(): void
}

export interface VaultSyncConfig {
  /** Same base as the API. '' = same-origin; an absolute http(s) URL for Electron. */
  baseUrl: string
  token: string
  /** Test seam. Defaults to the global WebSocket. */
  WebSocketImpl?: typeof WebSocket
}

interface Sub {
  resource: string
  onInvalidate: () => void
}

const MAX_BACKOFF_MS = 15_000

// '' → ws(s)://<page host>; http(s)://host → ws(s)://host.
function wsUrl(baseUrl: string, token: string): string {
  let origin = baseUrl
  if (!origin && typeof location !== 'undefined') origin = location.origin
  const wsOrigin = origin.replace(/^http/, 'ws').replace(/\/$/, '')
  return `${wsOrigin}/ws/vault?token=${encodeURIComponent(token)}`
}

function resourceFor(layoutId: string): string {
  return `/api/vault/layouts/${encodeURIComponent(layoutId)}`
}

export function makeVaultSync(cfg: VaultSyncConfig): VaultSync {
  const WS = cfg.WebSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined)
  const subs = new Set<Sub>()
  let ws: WebSocket | null = null
  let backoff = 500
  let closed = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect(): void {
    if (closed || !WS) return
    let socket: WebSocket
    try {
      socket = new WS(wsUrl(cfg.baseUrl, cfg.token))
    } catch {
      scheduleReconnect()
      return
    }
    ws = socket

    socket.onopen = () => {
      backoff = 500
      // Resync: we may have missed changes while disconnected. Pull everything.
      for (const s of subs) s.onInvalidate()
    }

    socket.onmessage = (ev) => {
      let msg: { type?: string; resource?: string }
      try { msg = JSON.parse(String(ev.data)) } catch { return }
      if (msg.type !== 'change' || typeof msg.resource !== 'string') return
      const resource = msg.resource
      for (const s of subs) {
        if (resource === s.resource || resource.startsWith(s.resource)) s.onInvalidate()
      }
    }

    socket.onclose = () => {
      if (ws === socket) ws = null
      scheduleReconnect()
    }
    // onerror → let onclose drive reconnect; avoid double-scheduling.
    socket.onerror = () => { try { socket.close() } catch { /* already closing */ } }
  }

  function scheduleReconnect(): void {
    if (closed || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, backoff)
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
  }

  connect()

  return {
    subscribe(layoutId, onInvalidate) {
      const sub: Sub = { resource: resourceFor(layoutId), onInvalidate }
      subs.add(sub)
      return () => { subs.delete(sub) }
    },
    close() {
      closed = true
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      try { ws?.close() } catch { /* noop */ }
      ws = null
      subs.clear()
    },
  }
}
