// Google Calendar sync — configuration from environment. Local-first: sync is
// an OPTIONAL path. With no GOOGLE_CLIENT_ID set, `enabled` is false and the
// orchester never talks to Google; the calendar keeps working offline.
//
// Setup (one time, by the instance owner):
//   1. console.cloud.google.com → new project → enable "Google Calendar API".
//   2. Credentials → OAuth client ID → type "Web application".
//   3. Authorized redirect URI: the value of GOOGLE_REDIRECT_URI below.
//   4. Export the client id/secret as env vars before starting the orchester.

export interface GoogleConfig {
  enabled: boolean
  clientId: string
  clientSecret: string
  redirectUri: string
  calendarId: string // which Google calendar to sync; 'primary' by default
  pollMs: number // incremental sync poll interval
  scopes: string[]
}

const DEFAULT_REDIRECT = 'http://localhost:3001/api/calendar/google/callback'
// Read/write access to events on the user's calendars.
const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

export function googleConfig(): GoogleConfig {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? ''
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? ''
  return {
    enabled: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    redirectUri: process.env['GOOGLE_REDIRECT_URI'] ?? DEFAULT_REDIRECT,
    calendarId: process.env['GOOGLE_CALENDAR_ID'] ?? 'primary',
    pollMs: Number(process.env['GOOGLE_SYNC_POLL_MS'] ?? 60_000),
    scopes: SCOPES,
  }
}
