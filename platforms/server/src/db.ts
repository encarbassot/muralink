import Database from 'better-sqlite3'
import { schema as calendarSchema, migrateCalendar } from '@muralink/module-calendar/server'
import { schema as contactsSchema, migrateContacts } from '@muralink/module-contacts/server'
import { schema as notesSchema } from '@muralink/module-notes/server'
import { schema as muralesSchema } from '@muralink/module-murales/server'
import { schema as remindersSchema } from '@muralink/module-reminders/server'
import { schema as trackerSchema } from '@muralink/module-tracker/server'
import { schema as habitsSchema } from '@muralink/module-habits/server'
import { appointmentsSchema } from '@muralink/module-calendar/server'
import { schema as stockSchema, migrateStock } from '@muralink/module-stock/server'
import { schema as calcsheetSchema } from '@muralink/module-calcsheet/server'
import { schema as expensesSchema } from '@muralink/module-expenses/server'
import { schema as gallerySchema } from '@muralink/module-gallery/server'
import { schema as employeesSchema } from '@muralink/module-employees/server'
import { schema as attendanceSchema } from '@muralink/module-attendance/server'
import { schema as passwordsSchema } from '@muralink/module-passwords/server'
import { schema as videoEditorSchema } from '@muralink/module-video-editor/server'
import { schema as vaultLayoutsSchema } from './vault-layouts/index.ts'
import { schema as installedModulesSchema } from './modules/index.ts'
import { schema as relationsSchema } from './relations/index.ts'
import { schema as paymentsSchema, migratePayments } from './payments/schema.ts'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_NAME = process.env['ELIO_DB_NAME'] ?? 'elio-instance.db'
// ELIO_DATA_DIR relocates the sqlite file (defaults to the in-repo data dir).
const DATA_DIR = process.env['ELIO_DATA_DIR']
  ? path.resolve(process.env['ELIO_DATA_DIR'])
  : path.join(__dirname, '../../data')
const DB_PATH = path.join(DATA_DIR, DB_NAME)

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
  // Module tables are created regardless of install state: a module's schema is
  // cheap, and uninstall must preserve data (see modules/index.ts). Installing
  // admits a module to the registry and un-gates its routes — it never migrates.
  database.exec(installedModulesSchema)
  database.exec(calendarSchema)
  migrateCalendar(database)
  database.exec(contactsSchema)
  migrateContacts(database)
  database.exec(notesSchema)
  database.exec(muralesSchema)
  database.exec(remindersSchema)
  database.exec(trackerSchema)
  database.exec(habitsSchema)
  database.exec(appointmentsSchema)
  database.exec(stockSchema)
  migrateStock(database)
  database.exec(calcsheetSchema)
  database.exec(expensesSchema)
  database.exec(gallerySchema)
  // employees before attendance: attendance's tables FK into employees(id).
  database.exec(employeesSchema)
  database.exec(attendanceSchema)
  database.exec(passwordsSchema)
  database.exec(videoEditorSchema)
  database.exec(vaultLayoutsSchema)
  database.exec(relationsSchema)
  database.exec(paymentsSchema)
  migratePayments(database)
}
