// Relations store — core (not module) persistence for the universal relation
// graph. Relations are typed directional edges between instances that span
// modules (a contact-as-host of a calendar event, a stock stack stored-in a
// location), so they live here rather than inside any one module's schema.
//
// Two tables / two routers:
//   relations       → the edges          → mounted at /api/relations
//   relation_types  → the discovery map  → mounted at /api/relation-types
//
// Both are queried by the client-side @muralink/spaces http space via URL params
// (fromId, toId, fromType, toType, role, ids). Ids are client-chosen and stable
// (relation-type ids are canonical `from|to|role`), so writes are PUT/POST
// upserts keyed on the id, mirroring vault-layouts.

import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export const schema = `
CREATE TABLE IF NOT EXISTS relations (
  id          TEXT PRIMARY KEY,
  role        TEXT NOT NULL,
  from_type   TEXT NOT NULL,
  from_id     TEXT NOT NULL,
  to_type     TEXT NOT NULL,
  to_id       TEXT NOT NULL,
  metadata    TEXT,
  created_at  TEXT,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations (from_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations (to_id);
CREATE INDEX IF NOT EXISTS idx_relations_role ON relations (role);

CREATE TABLE IF NOT EXISTS relation_types (
  id           TEXT PRIMARY KEY,
  from_type    TEXT NOT NULL,
  to_type      TEXT NOT NULL,
  role         TEXT NOT NULL,
  label        TEXT,
  inverse_role TEXT,
  usage_count  INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relation_types_pair ON relation_types (from_type, to_type);
`

interface RelationRow {
  id: string
  role: string
  from_type: string
  from_id: string
  to_type: string
  to_id: string
  metadata: string | null
  created_at: string | null
  updated_at: string
}

function rowToRelation(r: RelationRow): Record<string, unknown> {
  return {
    id: r.id,
    role: r.role,
    fromType: r.from_type,
    fromId: r.from_id,
    toType: r.to_type,
    toId: r.to_id,
    ...(r.metadata ? { metadata: JSON.parse(r.metadata) } : {}),
    ...(r.created_at ? { createdAt: r.created_at } : {}),
    updatedAt: r.updated_at,
  }
}

// Build a WHERE clause from the shared relational query params.
function relationFilter(q: Record<string, unknown>): { sql: string; args: unknown[] } {
  const clauses: string[] = []
  const args: unknown[] = []
  const eq = (col: string, val: unknown) => {
    if (val !== undefined && val !== '') {
      clauses.push(`${col} = ?`)
      args.push(String(val))
    }
  }
  eq('from_id', q['fromId'])
  eq('to_id', q['toId'])
  eq('from_type', q['fromType'])
  eq('to_type', q['toType'])
  eq('role', q['role'])
  if (typeof q['ids'] === 'string' && q['ids']) {
    const ids = q['ids'].split(',')
    clauses.push(`id IN (${ids.map(() => '?').join(',')})`)
    args.push(...ids)
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', args }
}

export function createRelationsRouter(db: Database): Router {
  const router = Router()

  const upsert = db.prepare(`
    INSERT INTO relations (id, role, from_type, from_id, to_type, to_id, metadata, created_at, updated_at)
    VALUES (@id, @role, @from_type, @from_id, @to_type, @to_id, @metadata, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      role = excluded.role, from_type = excluded.from_type, from_id = excluded.from_id,
      to_type = excluded.to_type, to_id = excluded.to_id, metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `)
  const selectOne = db.prepare('SELECT * FROM relations WHERE id = ?')
  const del = db.prepare('DELETE FROM relations WHERE id = ?')

  const persist = (body: Record<string, unknown>, id: string) => {
    const now = new Date().toISOString()
    upsert.run({
      id,
      role: String(body['role'] ?? ''),
      from_type: String(body['fromType'] ?? ''),
      from_id: String(body['fromId'] ?? ''),
      to_type: String(body['toType'] ?? ''),
      to_id: String(body['toId'] ?? ''),
      metadata: body['metadata'] ? JSON.stringify(body['metadata']) : null,
      created_at: (body['createdAt'] as string) ?? now,
      updated_at: (body['updatedAt'] as string) ?? now,
    })
    return rowToRelation(selectOne.get(id) as RelationRow)
  }

  router.get('/', (req, res) => {
    const { sql, args } = relationFilter(req.query as Record<string, unknown>)
    const rows = db.prepare(`SELECT * FROM relations${sql}`).all(...args) as RelationRow[]
    res.json(rows.map(rowToRelation))
  })

  router.get('/:id', (req, res) => {
    const row = selectOne.get(req.params['id']!) as RelationRow | undefined
    if (!row) { res.status(404).json({ error: 'not found' }); return }
    res.json(rowToRelation(row))
  })

  router.post('/', (req, res) => {
    const body = req.body as Record<string, unknown>
    const id = (body['id'] as string) ?? randomUUID()
    res.status(201).json(persist(body, id))
  })

  router.patch('/:id', (req, res) => {
    const existing = selectOne.get(req.params['id']!) as RelationRow | undefined
    if (!existing) { res.status(404).json({ error: 'not found' }); return }
    const merged = { ...rowToRelation(existing), ...(req.body as Record<string, unknown>) }
    res.json(persist(merged, req.params['id']!))
  })

  router.delete('/:id', (req, res) => {
    const info = del.run(req.params['id']!)
    if (info.changes === 0) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}

interface RelationTypeRow {
  id: string
  from_type: string
  to_type: string
  role: string
  label: string | null
  inverse_role: string | null
  usage_count: number
  created_at: string | null
  updated_at: string
}

function rowToRelationType(r: RelationTypeRow): Record<string, unknown> {
  return {
    id: r.id,
    fromType: r.from_type,
    toType: r.to_type,
    role: r.role,
    ...(r.label ? { label: r.label } : {}),
    ...(r.inverse_role ? { inverseRole: r.inverse_role } : {}),
    usageCount: r.usage_count,
    ...(r.created_at ? { createdAt: r.created_at } : {}),
    updatedAt: r.updated_at,
  }
}

export function createRelationTypesRouter(db: Database): Router {
  const router = Router()

  const selectOne = db.prepare('SELECT * FROM relation_types WHERE id = ?')
  const del = db.prepare('DELETE FROM relation_types WHERE id = ?')
  // Create-or-bump: a repeat registration of the same (from|to|role) raises its
  // usage_count so the discovery picker can rank by popularity.
  const upsert = db.prepare(`
    INSERT INTO relation_types (id, from_type, to_type, role, label, inverse_role, usage_count, created_at, updated_at)
    VALUES (@id, @from_type, @to_type, @role, @label, @inverse_role, @usage_count, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      label = COALESCE(excluded.label, relation_types.label),
      inverse_role = COALESCE(excluded.inverse_role, relation_types.inverse_role),
      usage_count = relation_types.usage_count + 1,
      updated_at = excluded.updated_at
  `)

  router.get('/', (req, res) => {
    const q = req.query as Record<string, unknown>
    const clauses: string[] = []
    const args: unknown[] = []
    for (const [param, col] of [['fromType', 'from_type'], ['toType', 'to_type'], ['role', 'role']] as const) {
      if (q[param]) { clauses.push(`${col} = ?`); args.push(String(q[param])) }
    }
    const sql = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
    const rows = db.prepare(`SELECT * FROM relation_types${sql} ORDER BY usage_count DESC`).all(...args) as RelationTypeRow[]
    res.json(rows.map(rowToRelationType))
  })

  router.post('/', (req, res) => {
    const body = req.body as Record<string, unknown>
    const id = String(body['id'] ?? `${body['fromType']}|${body['toType']}|${body['role']}`)
    const now = new Date().toISOString()
    upsert.run({
      id,
      from_type: String(body['fromType'] ?? ''),
      to_type: String(body['toType'] ?? ''),
      role: String(body['role'] ?? ''),
      label: (body['label'] as string) ?? null,
      inverse_role: (body['inverseRole'] as string) ?? null,
      usage_count: Number(body['usageCount'] ?? 1),
      created_at: (body['createdAt'] as string) ?? now,
      updated_at: (body['updatedAt'] as string) ?? now,
    })
    res.status(201).json(rowToRelationType(selectOne.get(id) as RelationTypeRow))
  })

  router.delete('/:id', (req, res) => {
    const info = del.run(req.params['id']!)
    if (info.changes === 0) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
