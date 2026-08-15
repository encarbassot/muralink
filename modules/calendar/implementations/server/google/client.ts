// Thin Google Calendar REST client over fetch. A token provider supplies a
// valid access token; on 401 we refresh once and retry. A 410 on list means
// the syncToken expired → callers must do a full resync (SyncTokenExpired).

const BASE = 'https://www.googleapis.com/calendar/v3'

export class SyncTokenExpired extends Error {
  constructor() {
    super('google syncToken expired')
    this.name = 'SyncTokenExpired'
  }
}

// Subset of a Google Calendar event we read/write. `status: 'cancelled'` marks
// a deletion in an incremental list response.
export interface GoogleEvent {
  id: string
  etag?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  start?: GoogleEventTime
  end?: GoogleEventTime
  recurrence?: string[] // e.g. ['RRULE:FREQ=WEEKLY']
  updated?: string
  extendedProperties?: { private?: Record<string, string> }
}

export interface GoogleEventTime {
  date?: string // all-day: 'YYYY-MM-DD'
  dateTime?: string // timed: RFC 3339
  timeZone?: string
}

interface ListResponse {
  items?: GoogleEvent[]
  nextPageToken?: string
  nextSyncToken?: string
}

export interface GoogleClient {
  list(opts: { syncToken?: string; timeMin?: string; pageToken?: string }): Promise<ListResponse>
  insert(event: Partial<GoogleEvent>): Promise<GoogleEvent>
  update(id: string, event: Partial<GoogleEvent>, etag?: string): Promise<GoogleEvent>
  remove(id: string): Promise<void>
}

export function makeGoogleClient(calendarId: string, getToken: () => Promise<string>): GoogleClient {
  const cal = encodeURIComponent(calendarId)

  async function req(path: string, init: RequestInit & { retry?: boolean } = {}): Promise<Response> {
    const token = await getToken()
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    if (res.status === 401 && !init.retry) {
      // Token provider refreshes on next call; retry once.
      return req(path, { ...init, retry: true })
    }
    return res
  }

  return {
    async list({ syncToken, timeMin, pageToken }) {
      const params = new URLSearchParams({ singleEvents: 'false', showDeleted: 'true', maxResults: '250' })
      if (syncToken) params.set('syncToken', syncToken)
      else if (timeMin) params.set('timeMin', timeMin)
      if (pageToken) params.set('pageToken', pageToken)
      const res = await req(`/calendars/${cal}/events?${params}`)
      if (res.status === 410) throw new SyncTokenExpired()
      if (!res.ok) throw new Error(`google list ${res.status}: ${await res.text()}`)
      return (await res.json()) as ListResponse
    },

    async insert(event) {
      const res = await req(`/calendars/${cal}/events`, { method: 'POST', body: JSON.stringify(event) })
      if (!res.ok) throw new Error(`google insert ${res.status}: ${await res.text()}`)
      return (await res.json()) as GoogleEvent
    },

    async update(id, event, etag) {
      const res = await req(`/calendars/${cal}/events/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: etag ? { 'If-Match': etag } : {},
        body: JSON.stringify(event),
      })
      // 412 = etag mismatch (edited on Google since); caller will re-pull.
      if (res.status === 412) throw new Error('google update precondition failed (etag mismatch)')
      if (!res.ok) throw new Error(`google update ${res.status}: ${await res.text()}`)
      return (await res.json()) as GoogleEvent
    },

    async remove(id) {
      const res = await req(`/calendars/${cal}/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
      // 404/410 = already gone on Google → treat as success (idempotent delete).
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        throw new Error(`google delete ${res.status}: ${await res.text()}`)
      }
    },
  }
}
