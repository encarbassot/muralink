import { manifest as urlManifest } from '@muralink/module-url'
import { manifest as calendarManifest } from '@muralink/module-calendar'
import { manifest as contactsManifest } from '@muralink/module-contacts'
import { manifest as appointmentsManifest } from '@muralink/module-appointments'
import { manifest as stockManifest } from '@muralink/module-stock'
import type { ModuleManifest } from '@muralink/types'

const modules: ModuleManifest[] = [
  urlManifest,
  calendarManifest,
  contactsManifest,
  appointmentsManifest,
  stockManifest,
]

export default modules
