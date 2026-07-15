// API space — the core server (State 2) over HTTP. Sharing/sync across every
// frontend happens through this space: all clients read the same events, so
// they converge (the host polls to refetch). The module stays stack-agnostic —
// it never imports the app's axios client; the host injects base URL + token.

import { makeHttpSpace } from '@muralink/spaces'
import type { YCalendarEvent } from '../../../types.ts'
import type { StorageProvider } from './provider.ts'

interface ApiConfig {
  // Absolute API base, no trailing slash. '' = same-origin (web behind proxy).
  baseUrl: string
  token: string
  label?: string
  // Attribution for shared calendars: recorded as createdBy server-side.
  userId?: string
}

export function makeApiProvider(cfg: ApiConfig): StorageProvider {
  return makeHttpSpace<YCalendarEvent>({
    baseUrl: cfg.baseUrl,
    token: cfg.token,
    path: '/api/calendar/events',
    id: 'api',
    label: cfg.label ?? 'Servidor',
    userId: cfg.userId,
    // No `duration` (server derives it) and no runtime-only `spaceId`.
    toBody: (e) => ({
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      metadata: e.metadata,
    }),
  })
}
