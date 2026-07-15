import Database from 'better-sqlite3'
import { schema as calendarSchema } from '@muralink/module-calendar/server'
import { schema as contactsSchema } from '@muralink/module-contacts/server'
import { schema as notesSchema } from '@muralink/module-notes/server'
import { schema as remindersSchema } from '@muralink/module-reminders/server'
import { schema as appointmentsSchema } from '@muralink/module-appointments/server'
import { schema as stockSchema } from '@muralink/module-stock/server'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_NAME = process.env['ELIO_DB_NAME'] ?? 'elio-instance.db'
const DB_PATH = path.join(__dirname, `../../data/${DB_NAME}`)

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

function runMigrations(database: Database.Database): void {
  database.exec(calendarSchema)
  database.exec(contactsSchema)
  database.exec(notesSchema)
  database.exec(remindersSchema)
  database.exec(appointmentsSchema)
  database.exec(stockSchema)
}
