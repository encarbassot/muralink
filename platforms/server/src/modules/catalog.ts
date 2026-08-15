// The module catalog of THIS orchester build.
//
// An orchester ships a fixed set of module *code* (npm workspace deps, bundled
// at build time) and a mutable set of *installed* modules (a row per module in
// sqlite). Installing does not download anything: it admits an already-bundled
// module into the ModuleRegistry and un-gates its API routes. That is the honest
// local-first shape — an offline box can install a module with no network.
//
// Fetching module code at install time (a real registry) is a later step and
// belongs behind this same seam: the catalog would then be catalog-from-disk
// plus catalog-from-remote, and nothing downstream changes.
//
// Adding a module to an orchester build = one entry here + its dep in
// package.json + (if it has server routes) mounting them behind
// requireInstalled() in index.ts.

import type { ModuleManifest } from '@muralink/types'
import { manifest as urlManifest } from '@muralink/module-url'
import { manifest as calendarManifest } from '@muralink/module-calendar'
import { manifest as contactsManifest } from '@muralink/module-contacts'
import { manifest as remindersManifest } from '@muralink/module-reminders'
import { manifest as trackerManifest } from '@muralink/module-tracker'
import { manifest as habitsManifest } from '@muralink/module-habits'
import { manifest as stockManifest } from '@muralink/module-stock'
import { manifest as calcsheetManifest } from '@muralink/module-calcsheet'
import { manifest as expensesManifest } from '@muralink/module-expenses'
import { manifest as mapsManifest } from '@muralink/module-maps'
import { manifest as notesManifest } from '@muralink/module-notes'
import { manifest as muralesManifest } from '@muralink/module-murales'
import { manifest as galleryManifest } from '@muralink/module-gallery'
import { manifest as mailManifest } from '@muralink/module-mail'
import { manifest as passwordsManifest } from '@muralink/module-passwords'
import { manifest as videoEditorManifest } from '@muralink/module-video-editor'
import { manifest as employeesManifest } from '@muralink/module-employees'
import { manifest as attendanceManifest } from '@muralink/module-attendance'

export interface CatalogEntry {
  manifest: ModuleManifest
  /** Human name, shown in the installer UI. */
  label: string
  description: string
  category: string
  /** Express mount prefixes this module owns. Gated by install state — an
   *  uninstalled module's API answers 409. Empty = no server surface at all
   *  (a web-only module like passwords: installing it only makes the frontend
   *  offer it). */
  apiPrefixes: string[]
  /** Present on a fresh instance. false = the user must install it explicitly. */
  preinstalled: boolean
}

// Order is informational only — dependency order is resolved by the DAG.
export const CATALOG: CatalogEntry[] = [
  {
    manifest: urlManifest,
    label: 'URL',
    description: 'Bookmarks and link management. Base type for other modules.',
    category: 'Core',
    apiPrefixes: [],
    preinstalled: true,
  },
  {
    manifest: remindersManifest,
    label: 'Reminders',
    description: 'Todos and reminders, reused by contacts and calendar.',
    category: 'Core',
    apiPrefixes: ['/api/reminders'],
    preinstalled: true,
  },
  {
    manifest: trackerManifest,
    label: 'Tracker',
    description: 'Time tracking: timers over project murals, elapsed-time entries.',
    category: 'Productivity',
    apiPrefixes: ['/api/tracker'],
    preinstalled: true,
  },
  {
    manifest: habitsManifest,
    label: 'Habits',
    description: 'Daily good/bad habit checks, linkable to reminders and timers.',
    category: 'Productivity',
    apiPrefixes: ['/api/habits'],
    preinstalled: true,
  },
  {
    manifest: mapsManifest,
    label: 'Maps',
    description: 'Map view embedded by contacts and used standalone.',
    category: 'Core',
    apiPrefixes: [],
    preinstalled: true,
  },
  {
    manifest: calendarManifest,
    label: 'Calendar',
    description: 'Events, availability slots, appointments and booking.',
    category: 'Core',
    apiPrefixes: ['/api/calendar', '/api/appointments'],
    preinstalled: true,
  },
  {
    manifest: contactsManifest,
    label: 'Contacts',
    description: 'People and companies. Shared across modules.',
    category: 'Core',
    apiPrefixes: ['/api/contacts'],
    preinstalled: true,
  },
  {
    manifest: expensesManifest,
    label: 'Expenses',
    description: 'Costs, budgets and financial flows.',
    category: 'Commerce',
    apiPrefixes: ['/api/expenses'],
    preinstalled: true,
  },
  {
    manifest: stockManifest,
    label: 'Stock',
    description: 'Inventory and product tracking.',
    category: 'Commerce',
    apiPrefixes: ['/api/stock'],
    preinstalled: true,
  },
  {
    manifest: calcsheetManifest,
    label: 'Calcsheet',
    description: 'Spreadsheets with a local formula engine.',
    category: 'Productivity',
    apiPrefixes: ['/api/calcsheet'],
    preinstalled: true,
  },
  {
    manifest: notesManifest,
    label: 'Notes',
    description: 'Markdown notes, private or shared via tunnel.',
    category: 'Productivity',
    apiPrefixes: ['/api/notes'],
    preinstalled: true,
  },
  {
    manifest: muralesManifest,
    label: 'Murales',
    description: 'Recursive mural boards over markdown documents.',
    category: 'Productivity',
    apiPrefixes: ['/api/murales'],
    preinstalled: true,
  },
  {
    manifest: galleryManifest,
    label: 'Gallery',
    description: 'Media index over the storage root, with thumbnails.',
    category: 'Productivity',
    // Mounted only when NAS storage is configured — gating is additive: the
    // route exists when storage is on AND the module is installed.
    apiPrefixes: ['/api/gallery'],
    preinstalled: true,
  },
  {
    manifest: mailManifest,
    label: 'Mail',
    description: 'Mailboxes hosted by this instance (needs ELIO_MAIL_ENABLED).',
    category: 'Communication',
    apiPrefixes: ['/api/mail'],
    preinstalled: true,
  },
  {
    manifest: passwordsManifest,
    label: 'Passwords',
    description: 'Credential vault gated by a 6-digit PIN. Encrypted client-side.',
    category: 'Security',
    // The server stores sealed blobs only — it holds the vault without being
    // able to read a single field of it. See modules/passwords/implementations/server.
    apiPrefixes: ['/api/passwords'],
    preinstalled: false,
  },
  {
    manifest: videoEditorManifest,
    label: 'Video editor',
    description: 'Collaborative project rooms over the realtime hub.',
    category: 'Media',
    apiPrefixes: ['/api/video-editor'],
    preinstalled: false,
  },
  {
    manifest: employeesManifest,
    label: 'Employees',
    description: 'Staff roster and shift scheduling for service businesses.',
    category: 'Team',
    apiPrefixes: ['/api/employees'],
    preinstalled: false,
  },
  {
    manifest: attendanceManifest,
    label: 'Attendance',
    description: 'Team work schedule, clock-in/out, and vacation requests over employees.',
    category: 'Team',
    apiPrefixes: ['/api/attendance'],
    preinstalled: false,
  },
]

const BY_ID = new Map(CATALOG.map((entry) => [entry.manifest.id, entry]))

export function catalogEntry(moduleId: string): CatalogEntry | undefined {
  return BY_ID.get(moduleId)
}
