# Google Calendar two-way sync

Optional, orchester-side sync between the calendar's `events` table and a
Google calendar. **Local-first is preserved**: with no credentials configured
this code is inert and the calendar works exactly as before. Sync runs only on
the orchester (the always-on, single-user machine), so the OAuth secret and
refresh token never reach a browser.

## What it does

- **Here → Google**: creating / editing / deleting an event via the API mirrors
  to Google (via an outbox drained each poll cycle).
- **Google → here**: incremental pull (`syncToken`) applies remote
  creates / edits / deletes into the `events` table.
- **Recurrence** maps both ways (our `rrule` ↔ Google `recurrence: ['RRULE:…']`,
  with UNTIL normalized to RFC 5545 basic UTC).
- **Checklist blocks + colour** have no native Google field, so they ride in the
  event's `extendedProperties.private` and round-trip untouched.

## Setup (one time, by the instance owner)

1. <https://console.cloud.google.com> → create a project.
2. **APIs & Services → Library → enable "Google Calendar API"**.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Add an **Authorized redirect URI** matching `GOOGLE_REDIRECT_URI`
   (default `http://localhost:3001/api/calendar/google/callback`).
5. Export the env vars before starting the orchester:

```bash
export GOOGLE_CLIENT_ID="…apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="…"
# optional overrides:
# export GOOGLE_REDIRECT_URI="http://localhost:3001/api/calendar/google/callback"
# export GOOGLE_CALENDAR_ID="primary"          # or a specific calendar id
# export GOOGLE_SYNC_POLL_MS="60000"
arch -arm64 npm -w @muralink/platform-server run dev   # arch prefix only if your shell is x86_64
```

## Connect / operate

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/calendar/google/auth` | public (CSRF `state`) | open in a browser → Google consent |
| `GET /api/calendar/google/callback` | public (CSRF `state`) | OAuth redirect target; stores tokens + seeds first sync |
| `GET /api/calendar/google/status` | master token | `{ connected, email?, calendarId, hasSyncToken }` |
| `POST /api/calendar/google/sync` | master token | force a sync cycle now |
| `POST /api/calendar/google/disconnect` | master token | drop tokens + id mapping |

To connect: open `http://localhost:3001/api/calendar/google/auth` in a browser,
grant access, done. The poller then keeps both sides converged.

## Design notes & current limits (MVP)

- **Loop safety**: only user-origin HTTP writes enqueue an outbox row; pulls
  write via `queries.*` directly, and an unchanged `etag` short-circuits — so a
  pulled change is never echoed back to Google.
- **Conflict policy**: last write wins. Simultaneous edits on both sides between
  polls resolve to whichever drain lands last.
- **No webhooks**: Google push notifications need a public HTTPS endpoint, which
  would break local-first. We poll with `syncToken` instead; the tunnel layer
  could add push later.
- **Not modeled yet**: per-occurrence recurrence overrides / EXDATE / RDATE
  (only the base `RRULE` syncs), and multiple calendars (one calendar id).
- **Blocks on recurring events** stay shared across occurrences, same as
  everywhere else in the calendar.
