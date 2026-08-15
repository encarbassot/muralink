// Cloud sync wiring for the extension side panel. Trimmed per-platform copy of
// platforms/web/src/cloudVault.ts — only the collections this face shows
// (notes + events). On login, register an `orchester` HTTP space per synced
// collection pointed at the cloud origin; local IndexedDB stays the default
// write target, the cloud space merges into reads. Logged out → nothing
// registered → stores fall through to their built-in IndexedDB spaces.

import { registerSpace, unregisterSpace, makeHttpSpace, type SpaceQuery } from '@muralink/spaces'
import { useNotes } from '@muralink/module-notes/web'
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
  unregisterSpace('events', CLOUD_ID)
  const ev = useEvents.getState()
  if (ev.activeTargets.includes(CLOUD_ID)) ev.toggleTarget(CLOUD_ID)
}
