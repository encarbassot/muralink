// Cloud sync wiring for the localhost web build. On login we register a
// `orchester` HTTP space for every synced module collection, pointed at the
// absolute cloud origin (app.mural.ink). The master proxy there authenticates
// the account token and routes each request to THIS account's own core, so the
// same data follows the user across every device / face.
//
// Local (IndexedDB) stays the default write target; the cloud space is added as
// an active, merged-read target — everything the account holds shows up here,
// and new items land locally unless a dashboard steers them to the cloud.
//
// Mirrors muralink-cloud's apps/cloud-web/src/vault.ts, but with a parametrised
// baseUrl (that build is same-origin; this one is cross-origin to the cloud).

import { registerSpace, unregisterSpace, makeHttpSpace, type SpaceQuery } from '@muralink/spaces'
import { useNotes } from '@muralink/module-notes/web'
import { useContacts } from '@muralink/module-contacts/web'
import { useEvents } from '@muralink/module-calendar/web'
import type { YCalendarEvent } from '@muralink/module-calendar/types'

const CLOUD_ID = 'orchester'
let installedFor: string | null = null

interface SpacedStore {
  getState: () => {
    activeSpaces: string[]
    setDefaultSpace: (id: string) => void
    toggleSpace: (id: string) => void
  }
}

// Keep the local space as the default target; make the cloud space readable
// (merged into reads). Idempotent.
function bindCloud(store: SpacedStore): void {
  const s = store.getState()
  if (typeof s.setDefaultSpace === 'function') s.setDefaultSpace('local')
  if (typeof s.toggleSpace === 'function' && !s.activeSpaces.includes(CLOUD_ID)) s.toggleSpace(CLOUD_ID)
}

export function installCloudVault(token: string, baseUrl: string): void {
  if (installedFor === token) return
  installedFor = token

  const common = { baseUrl, token, id: CLOUD_ID, label: 'Muralink cloud' }

  registerSpace('notes', makeHttpSpace({ ...common, path: '/api/notes' }))
  registerSpace('murales', makeHttpSpace({ ...common, path: '/api/murales' }))
  registerSpace('contacts', makeHttpSpace({ ...common, path: '/api/contacts/contacts' }))
  registerSpace(
    'events',
    makeHttpSpace<YCalendarEvent>({
      ...common,
      path: '/api/calendar/events',
      // Full payload incl. facets — the server whitelists these columns.
      toBody: (e) => ({
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        rrule: e.rrule,
        blocks: e.blocks,
        facets: e.facets,
        metadata: e.metadata,
      }),
      toParams: (q: SpaceQuery) => {
        const params = new URLSearchParams()
        if (q.from) params.set('from', q.from)
        if (q.to) params.set('to', q.to)
        return params
      },
    }),
  )

  bindCloud(useNotes as unknown as SpacedStore)
  bindCloud(useContacts as unknown as SpacedStore)

  // Calendar exposes activeTargets/defaultTarget + toggleTarget/setDefaultTarget.
  const ev = useEvents.getState()
  ev.setDefaultTarget('local')
  if (!ev.activeTargets.includes(CLOUD_ID)) ev.toggleTarget(CLOUD_ID)
  // If the calendar is already mounted (login after open), refetch so the
  // account's cloud events merge in immediately.
  void ev.reload()
}

export function uninstallCloudVault(): void {
  installedFor = null
  unregisterSpace('notes', CLOUD_ID)
  unregisterSpace('contacts', CLOUD_ID)
  unregisterSpace('events', CLOUD_ID)
  const ev = useEvents.getState()
  if (ev.activeTargets.includes(CLOUD_ID)) ev.toggleTarget(CLOUD_ID)
}
