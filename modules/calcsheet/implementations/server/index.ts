// calcsheet server store. A sheet is rich/nested, so it persists as a single
// JSON blob (not exploded columns) keyed by its client-chosen id — writes are
// PUT upserts, mirroring vault-layouts. Standalone/shared sheets use this; bento
// cells keep their sheet in the grid layout and need no server.

import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import type { YCalcSheet } from '../../types.ts'

export const schema = `
CREATE TABLE IF NOT EXISTS calcsheets (
  id         TEXT PRIMARY KEY,
  doc        TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

interface Row {
  id: string
  doc: string
  updated_at: string
}

export function createCalcsheetRouter(db: Database): Router {
  const router = Router()
  const selectAll = db.prepare('SELECT * FROM calcsheets ORDER BY updated_at DESC')
  const selectOne = db.prepare('SELECT * FROM calcsheets WHERE id = ?')
  const upsert = db.prepare(`
    INSERT INTO calcsheets (id, doc, updated_at) VALUES (@id, @doc, @updated_at)
    ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at
  `)
  const del = db.prepare('DELETE FROM calcsheets WHERE id = ?')

  const toSheet = (row: Row): YCalcSheet => ({ ...(JSON.parse(row.doc) as YCalcSheet), id: row.id, updatedAt: row.updated_at })

  router.get('/', (_req, res) => {
    res.json((selectAll.all() as Row[]).map(toSheet))
  })

  router.get('/:id', (req, res) => {
    const row = selectOne.get(req.params['id']!) as Row | undefined
    if (!row) { res.status(404).json({ error: 'not found' }); return }
    res.json(toSheet(row))
  })

  router.put('/:id', (req, res) => {
    const id = req.params['id']!
    const sheet = req.body as YCalcSheet
    const updatedAt = sheet.updatedAt ?? new Date().toISOString()
    upsert.run({ id, doc: JSON.stringify({ ...sheet, id, updatedAt }), updated_at: updatedAt })
    res.json(toSheet(selectOne.get(id) as Row))
  })

  // POST (create) — server mints nothing; the client provides the id. Alias of PUT.
  router.post('/', (req, res) => {
    const sheet = req.body as YCalcSheet
    if (!sheet.id) { res.status(400).json({ error: 'id required' }); return }
    const updatedAt = sheet.updatedAt ?? new Date().toISOString()
    upsert.run({ id: sheet.id, doc: JSON.stringify({ ...sheet, updatedAt }), updated_at: updatedAt })
    res.status(201).json(toSheet(selectOne.get(sheet.id) as Row))
  })

  router.delete('/:id', (req, res) => {
    if (del.run(req.params['id']!).changes === 0) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
