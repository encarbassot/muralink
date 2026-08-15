// Vault layout store — cloud-backed persistence for a "vault" dashboard's grid
// composition (GridLayoutConfig). Mounted at /api/vault/layouts.
//
// A vault is a recursive dashboard whose layout lives in the per-account core
// instead of the browser's localStorage, so every device sees the same grid.
// The client-side cloudLayoutAdapter (packages/ui) reads/writes here via the
// master proxy (/api/*). The layoutId is client-chosen and stable across devices
// (e.g. `vault-<id>` and nested `vault-<id>/<cellId>`), so writes are PUT upserts
// rather than POST — the id is the identity, not server-minted.
//
// Only the layout *document* lives here; the domain data of module cells inside
// the vault (notes, files…) flows through their own core stores (/api/notes,
// /api/storage) via cloud Spaces. Convergence is last-write-wins on updatedAt.

import { Router } from 'express'
import type { Database } from 'better-sqlite3'

export const schema = `
CREATE TABLE IF NOT EXISTS vault_layouts (
  layout_id   TEXT PRIMARY KEY,
  config      TEXT NOT NULL,
  created_by  TEXT,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_layouts_updated ON vault_layouts (updated_at);
`

interface LayoutRow {
  layout_id: string
  config: string
  created_by: string | null
  updated_at: string
}

export interface VaultLayoutDoc {
  layoutId: string
  config: unknown
  updatedAt: string
  createdBy?: string
}

function rowToDoc(row: LayoutRow): VaultLayoutDoc {
  return {
    layoutId: row.layout_id,
    config: JSON.parse(row.config),
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
  }
}

export function createVaultLayoutsRouter(db: Database): Router {
  const router = Router()

  const selectAll = db.prepare('SELECT layout_id, updated_at FROM vault_layouts ORDER BY updated_at DESC')
  const selectOne = db.prepare('SELECT * FROM vault_layouts WHERE layout_id = ?')
  const upsert = db.prepare(`
    INSERT INTO vault_layouts (layout_id, config, created_by, updated_at)
    VALUES (@layout_id, @config, @created_by, @updated_at)
    ON CONFLICT(layout_id) DO UPDATE SET
      config = excluded.config,
      created_by = COALESCE(excluded.created_by, vault_layouts.created_by),
      updated_at = excluded.updated_at
  `)
  const del = db.prepare('DELETE FROM vault_layouts WHERE layout_id = ?')

  // Enumerate layout ids + revisions — used by the client on (re)connect to
  // detect which vault subtrees changed while it was offline.
  router.get('/', (_req, res) => {
    const rows = selectAll.all() as Array<{ layout_id: string; updated_at: string }>
    res.json(rows.map((r) => ({ layoutId: r.layout_id, updatedAt: r.updated_at })))
  })

  router.get('/:layoutId', (req, res) => {
    const row = selectOne.get(req.params['layoutId']!) as LayoutRow | undefined
    if (!row) { res.status(404).json({ error: 'not found' }); return }
    res.json(rowToDoc(row))
  })

  // Upsert. Last-write-wins: a stale write (older updatedAt than stored) is
  // rejected with 409 so a laggy device can't clobber a newer layout — the
  // client refetches and reconciles.
  router.put('/:layoutId', (req, res) => {
    const layoutId = req.params['layoutId']!
    const body = req.body as { config?: unknown; updatedAt?: string }
    if (body.config === undefined) { res.status(400).json({ error: 'missing config' }); return }
    const updatedAt = body.updatedAt ?? new Date().toISOString()

    const existing = selectOne.get(layoutId) as LayoutRow | undefined
    if (existing && existing.updated_at > updatedAt) {
      res.status(409).json({ error: 'stale', current: rowToDoc(existing) })
      return
    }

    upsert.run({
      layout_id: layoutId,
      config: JSON.stringify(body.config),
      created_by: req.header('x-mural-user') ?? null,
      updated_at: updatedAt,
    })
    res.json(rowToDoc(selectOne.get(layoutId) as LayoutRow))
  })

  router.delete('/:layoutId', (req, res) => {
    const info = del.run(req.params['layoutId']!)
    if (info.changes === 0) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
