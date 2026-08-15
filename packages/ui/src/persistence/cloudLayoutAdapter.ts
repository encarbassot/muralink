// Cloud persistence for a vault dashboard's layout. Reads/writes the grid
// composition to the per-account core (/api/vault/layouts) via the master proxy,
// so every device converges on the same vault. Contrast localStorageAdapter,
// which is device-local.
//
// Convergence is last-write-wins on updatedAt (stamped here, enforced by the
// core with a 409 on stale writes). An unchanged config is not re-sent, so a
// layout pushed in from another device (via `subscribe`) does not echo back out.

import type { GridLayoutConfig, GridPersistenceAdapter } from '@muralink/types'

export interface CloudLayoutAdapterConfig {
  /** Absolute API base, no trailing slash. '' = same-origin (behind the proxy). */
  baseUrl: string
  token: string
  /** Attribution, sent as X-Mural-User. */
  userId?: string
  /**
   * Realtime hook. Given a layoutId and an `onInvalidate` callback, subscribe to
   * remote-change notifications for that layout and return an unsubscribe fn. The
   * transport carries no payload — the adapter refetches on invalidation. Wired
   * to useVaultSync (WebSocket) in the app; omit for a pull-only adapter.
   */
  subscribe?: (layoutId: string, onInvalidate: () => void) => () => void
  /** Notified when a local save loses to a newer remote write (device adopts remote). */
  onConflict?: (layoutId: string) => void
}

interface Snapshot {
  serialized: string
  updatedAt: string
}

export function makeCloudLayoutAdapter(cfg: CloudLayoutAdapterConfig): GridPersistenceAdapter {
  const base = cfg.baseUrl.replace(/\/$/, '')
  const path = (id: string) => `${base}/api/vault/layouts/${encodeURIComponent(id)}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.token}`,
  }
  if (cfg.userId) headers['X-Mural-User'] = cfg.userId

  // Per-layout snapshot of what the server last confirmed. Guards the save echo
  // and feeds last-write-wins.
  const snapshots = new Map<string, Snapshot>()

  function record(config: GridLayoutConfig, updatedAt: string): void {
    snapshots.set(config.layoutId, { serialized: JSON.stringify(config), updatedAt })
  }

  async function fetchLatest(layoutId: string): Promise<GridLayoutConfig | null> {
    const res = await fetch(path(layoutId), { headers })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`vault layout ${layoutId} load ${res.status}`)
    const doc = (await res.json()) as { config: GridLayoutConfig; updatedAt: string }
    record(doc.config, doc.updatedAt)
    return doc.config
  }

  return {
    async load(layoutId) {
      try {
        return await fetchLatest(layoutId)
      } catch {
        // Offline or server unreachable — the grid keeps its initialConfig and
        // retries on the next edit. Local-first: never block on the network.
        return null
      }
    },

    async save(config) {
      const serialized = JSON.stringify(config)
      const snap = snapshots.get(config.layoutId)
      if (snap && snap.serialized === serialized) return // unchanged — no echo

      const updatedAt = new Date().toISOString()
      try {
        const res = await fetch(path(config.layoutId), {
          method: 'PUT',
          headers,
          body: JSON.stringify({ config, updatedAt }),
        })
        if (res.status === 409) {
          // Another device wrote a newer layout. Adopt it as our snapshot so we
          // stop fighting; the grid reconciles via the subscribe channel (or the
          // next load). Local edits made since will re-save on the next change.
          const body = (await res.json()) as { current?: { config: GridLayoutConfig; updatedAt: string } }
          if (body.current) record(body.current.config, body.current.updatedAt)
          cfg.onConflict?.(config.layoutId)
          return
        }
        if (!res.ok) throw new Error(`vault layout ${config.layoutId} save ${res.status}`)
        record(config, updatedAt)
      } catch {
        // Write failed (offline). Leave the snapshot untouched so the next change
        // retries. LWW means a later successful write still converges.
      }
    },

    subscribe: cfg.subscribe
      ? (layoutId, onRemote) =>
          cfg.subscribe!(layoutId, () => {
            // Remote change signalled — pull the fresh config, record it as our
            // snapshot (so the ensuing save no-ops), then hand it to the grid.
            void fetchLatest(layoutId).then((config) => {
              if (config) onRemote(config)
            })
          })
      : undefined,
  }
}
