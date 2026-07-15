import type { Database } from 'better-sqlite3'
import type { YReminder } from '../../types.ts'

interface ReminderRow {
  id: string
  title: string
  done: number
  due_at: string | null
  assignee: string | null
  created_by: string | null
  updated_at: string
}

function rowToReminder(row: ReminderRow): YReminder {
  return {
    id: row.id,
    title: row.title,
    done: row.done === 1,
    dueAt: row.due_at ?? undefined,
    assignee: row.assignee ?? undefined,
    createdBy: row.created_by ?? undefined,
    updatedAt: row.updated_at,
  }
}

export function getReminders(db: Database): YReminder[] {
  const rows = db
    .prepare<[], ReminderRow>(`SELECT * FROM reminders ORDER BY done, due_at IS NULL, due_at, updated_at DESC`)
    .all()
  return rows.map(rowToReminder)
}

export function getReminder(db: Database, id: string): YReminder | undefined {
  const row = db.prepare<[string], ReminderRow>(`SELECT * FROM reminders WHERE id = ?`).get(id)
  return row ? rowToReminder(row) : undefined
}

export function createReminder(db: Database, reminder: YReminder): YReminder {
  db.prepare(
    `INSERT INTO reminders (id, title, done, due_at, assignee, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    reminder.id,
    reminder.title,
    reminder.done ? 1 : 0,
    reminder.dueAt ?? null,
    reminder.assignee ?? null,
    reminder.createdBy ?? null,
    reminder.updatedAt,
  )
  return getReminder(db, reminder.id)!
}

export function updateReminder(
  db: Database,
  id: string,
  patch: Partial<Omit<YReminder, 'id'>>,
): YReminder | undefined {
  const existing = getReminder(db, id)
  if (!existing) return undefined

  const title = patch.title ?? existing.title
  const done = patch.done ?? existing.done
  const dueAt = patch.dueAt !== undefined ? patch.dueAt : existing.dueAt
  const assignee = patch.assignee !== undefined ? patch.assignee : existing.assignee
  const updatedAt = patch.updatedAt ?? new Date().toISOString()

  db.prepare(
    `UPDATE reminders SET title = ?, done = ?, due_at = ?, assignee = ?, updated_at = ? WHERE id = ?`,
  ).run(title, done ? 1 : 0, dueAt ?? null, assignee ?? null, updatedAt, id)
  return getReminder(db, id)
}

export function deleteReminder(db: Database, id: string): boolean {
  const result = db.prepare(`DELETE FROM reminders WHERE id = ?`).run(id)
  return result.changes > 0
}
