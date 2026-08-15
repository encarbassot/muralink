// The module set this instance ships with. Add a manifest here and the
// instance gains the feature; remove it and the routes and widgets go with it.
// Order matters only for dependencies: url comes first because contacts
// declares it.

import { manifest as urlManifest } from '@muralink/module-url'
import { manifest as calendarManifest } from '@muralink/module-calendar'
import { manifest as contactsManifest } from '@muralink/module-contacts'
import { manifest as notesManifest } from '@muralink/module-notes'
import type { ModuleManifest } from '@muralink/types'

const modules: ModuleManifest[] = [
  urlManifest,
  contactsManifest,
  calendarManifest,
  notesManifest,
]

export default modules
