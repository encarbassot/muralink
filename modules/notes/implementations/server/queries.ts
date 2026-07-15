import type { Database } from 'better-sqlite3'
import type { YNote } from '../../types.ts'

interface NoteRow {
  id: string
  title: string
  body: string
  color: string | null
  created_by: string | null
  updated_at: string
}

function rowToNote(row: NoteRow): YNote {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    color: row.color ?? undefined,
    createdBy: row.created_by ?? undefined,
    updatedAt: row.updated_at,
  }
}

export function getNotes(db: Database, search?: string): YNote[] {
  if (search) {
    const rows = db
      .prepare<[string, string], NoteRow>(
        `SELECT * FROM notes WHERE title LIKE ? OR body LIKE ? ORDER BY updated_at DESC`,
      )
      .all(`%${search}%`, `%${search}%`)
    return rows.map(rowToNote)
  }
  const rows = db.prepare<[], NoteRow>(`SELECT * FROM notes ORDER BY updated_at DESC`).all()
  return rows.map(rowToNote)
}

export function getNote(db: Database, id: string): YNote | undefined {
  const row = db.prepare<[string], NoteRow>(`SELECT * FROM notes WHERE id = ?`).get(id)
  return row ? rowToNote(row) : undefined
}

export function createNote(db: Database, note: YNote): YNote {
  db.prepare(
    `INSERT INTO notes (id, title, body, color, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    note.id,
    note.title,
    note.body,
    note.color ?? null,
    note.createdBy ?? null,
    note.updatedAt,
  )
  return getNote(db, note.id)!
}

export function updateNote(
  db: Database,
  id: string,
  patch: Partial<Omit<YNote, 'id'>>,
): YNote | undefined {
  const existing = getNote(db, id)
  if (!existing) return undefined

  const title = patch.title ?? existing.title
  const body = patch.body !== undefined ? patch.body : existing.body
  const color = patch.color !== undefined ? patch.color : existing.color
  const updatedAt = patch.updatedAt ?? new Date().toISOString()

  db.prepare(`UPDATE notes SET title = ?, body = ?, color = ?, updated_at = ? WHERE id = ?`).run(
    title,
    body,
    color ?? null,
    updatedAt,
    id,
  )
  return getNote(db, id)
}

export function deleteNote(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM notes WHERE id = ?`).run(id)
  return result.changes > 0
}
