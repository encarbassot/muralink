import type { Database } from 'better-sqlite3'
import { defaultGrid, type YMural } from '../../types.ts'

interface MuralRow {
  id: string
  title: string
  doc: string
  public: number
  created_by: string | null
  updated_at: string
}

// `doc` holds the embedded document ({elements, grid}) as JSON; title/public/
// updatedAt are lifted to columns for listing and share gating.
function rowToMural(row: MuralRow): YMural {
  let doc: Partial<YMural> = {}
  try {
    doc = JSON.parse(row.doc) as Partial<YMural>
  } catch {
    // Corrupt doc — serve an empty mural rather than failing the request.
  }
  return {
    id: row.id,
    title: row.title,
    emoji: doc.emoji,
    elements: doc.elements ?? [],
    arrows: doc.arrows,
    grid: doc.grid ?? defaultGrid(),
    public: row.public === 1 ? true : undefined,
    createdBy: row.created_by ?? undefined,
    updatedAt: row.updated_at,
  }
}

function docOf(mural: Pick<YMural, 'elements' | 'grid' | 'arrows' | 'emoji'>): string {
  return JSON.stringify({ elements: mural.elements, grid: mural.grid, arrows: mural.arrows, emoji: mural.emoji })
}

export function getMurales(db: Database): YMural[] {
  const rows = db.prepare<[], MuralRow>(`SELECT * FROM murales ORDER BY updated_at DESC`).all()
  return rows.map(rowToMural)
}

export function getMural(db: Database, id: string): YMural | undefined {
  const row = db.prepare<[string], MuralRow>(`SELECT * FROM murales WHERE id = ?`).get(id)
  return row ? rowToMural(row) : undefined
}

export function createMural(db: Database, mural: YMural): YMural {
  db.prepare(
    `INSERT INTO murales (id, title, doc, public, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    mural.id,
    mural.title,
    docOf(mural),
    mural.public ? 1 : 0,
    mural.createdBy ?? null,
    mural.updatedAt,
  )
  return getMural(db, mural.id)!
}

export function updateMural(
  db: Database,
  id: string,
  patch: Partial<Omit<YMural, 'id'>>,
): YMural | undefined {
  const existing = getMural(db, id)
  if (!existing) return undefined

  const next: YMural = {
    ...existing,
    ...patch,
    id,
    elements: patch.elements ?? existing.elements,
    grid: patch.grid ?? existing.grid,
    public: patch.public !== undefined ? patch.public : existing.public,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  }

  db.prepare(`UPDATE murales SET title = ?, doc = ?, public = ?, updated_at = ? WHERE id = ?`).run(
    next.title,
    docOf(next),
    next.public ? 1 : 0,
    next.updatedAt,
    id,
  )
  return getMural(db, id)
}

export function deleteMural(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM murales WHERE id = ?`).run(id)
  return result.changes > 0
}
