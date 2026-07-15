// Modules installed in the BikeHunter instance. Milestone 1 = the employee
// pinboard (notes, reminders, contacts, calendar). Milestone 2 adds
// appointments (public booking embed + backoffice assignment).

import { manifest as urlManifest } from '@muralink/module-url'
import { manifest as notesManifest } from '@muralink/module-notes'
import { manifest as remindersManifest } from '@muralink/module-reminders'
import { manifest as contactsManifest } from '@muralink/module-contacts'
import { manifest as calendarManifest } from '@muralink/module-calendar'
import type { ModuleManifest } from '@muralink/types'

const modules: ModuleManifest[] = [
  urlManifest,
  notesManifest,
  remindersManifest,
  contactsManifest,
  calendarManifest,
]

export default modules
