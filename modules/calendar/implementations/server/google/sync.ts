// The sync engine. Each cycle PUSHES the outbox (local user writes) to Google,
// then PULLS Google's incremental changes into the events table. Loop safety:
// pulls write via queries.* directly (no hooks → no outbox), and an unchanged
// etag short-circuits, so our own pushes are never echoed back.
//
// Conflict policy (MVP): last write wins. If the same event is edited on both
// sides between polls, whichever drain lands last overwrites the other. Google
// EXDATE/RDATE and per-occurrence overrides are not modeled yet.

import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'
import type { GoogleConfig } from './config.ts'
import { makeGoogleClient, SyncTokenExpired, type GoogleClient, type GoogleEvent } from './client.ts'
import { fromGoogle, toGoogle } from './mapping.ts'
import { validAccessToken } from './oauth.ts'
import {
  enqueueOutbox,
  findEventByGoogleId,
  getSyncToken,
  isConnected,
  listOutbox,
  removeOutbox,
  setEventGoogle,
  setSyncToken,
} from './store.ts'
import type { YCalendarEvent } from '../../../types.ts'
import { createEvent, deleteEvent, getEvent, updateEvent } from '../queries.ts'

// How far back the first (full) sync reaches when there is no syncToken yet.
const INITIAL_WINDOW_DAYS = 90

function client(db: Database, cfg: GoogleConfig): GoogleClient {
  return makeGoogleClient(cfg.calendarId, () => validAccessToken(db, cfg))
}

// ── Pull: Google → local ─────────────────────────────────────────────────────

function applyRemote(db: Database, g: GoogleEvent): void {
  const existing = findEventByGoogleId(db, g.id)

  if (g.status === 'cancelled') {
    if (existing) deleteEvent(db, existing.id) // no hook → not re-pushed
    return
  }
  // A pulled event with the same etag we already stored is our own echo.
  if (existing && existing.googleEtag && existing.googleEtag === g.etag) return

  const mapped = fromGoogle(g)
  if (existing) {
    updateEvent(db, existing.id, mapped)
    setEventGoogle(db, existing.id, g.id, g.etag ?? null)
  } else {
    const id = randomUUID()
    createEvent(db, { id, ...mapped })
    setEventGoogle(db, id, g.id, g.etag ?? null)
  }
}

export async function pull(db: Database, cfg: GoogleConfig): Promise<number> {
  const c = client(db, cfg)
  let applied = 0
  let fullResync = false

  let syncToken = getSyncToken(db, cfg.calendarId)
  let timeMin: string | undefined
  if (!syncToken) {
    const d = new Date()
    d.setDate(d.getDate() - INITIAL_WINDOW_DAYS)
    timeMin = d.toISOString()
  }

  let pageToken: string | undefined
  for (;;) {
    let page
    try {
      page = await c.list({ syncToken, timeMin, pageToken })
    } catch (err) {
      if (err instanceof SyncTokenExpired && !fullResync) {
        // Token invalidated by Google → start over with a bounded full sync.
        setSyncToken(db, cfg.calendarId, null)
        fullResync = true
        syncToken = undefined
        pageToken = undefined
        const d = new Date()
        d.setDate(d.getDate() - INITIAL_WINDOW_DAYS)
        timeMin = d.toISOString()
        continue
      }
      throw err
    }

    for (const item of page.items ?? []) {
      applyRemote(db, item)
      applied++
    }

    if (page.nextPageToken) {
      pageToken = page.nextPageToken
      continue
    }
    if (page.nextSyncToken) setSyncToken(db, cfg.calendarId, page.nextSyncToken)
    break
  }
  return applied
}

// ── Push: local outbox → Google ──────────────────────────────────────────────

export async function push(db: Database, cfg: GoogleConfig): Promise<number> {
  const c = client(db, cfg)
  let pushed = 0

  for (const row of listOutbox(db)) {
    try {
      if (row.op === 'delete') {
        if (row.googleId) await c.remove(row.googleId)
      } else {
        const event = getEvent(db, row.eventId)
        if (!event) {
          removeOutbox(db, row.seq) // event vanished before we pushed it
          continue
        }
        if (event.googleId) {
          const res = await c.update(event.googleId, toGoogle(event), event.googleEtag)
          setEventGoogle(db, event.id, res.id, res.etag ?? null)
        } else {
          const res = await c.insert(toGoogle(event))
          setEventGoogle(db, event.id, res.id, res.etag ?? null)
        }
      }
      removeOutbox(db, row.seq)
      pushed++
    } catch (err) {
      // Leave the row for the next cycle; a transient failure retries, and we
      // don't block later independent rows (each is tried on its own).
      console.error(`[google sync] push seq=${row.seq} failed:`, (err as Error).message)
    }
  }
  return pushed
}

// ── Cycle + poller ───────────────────────────────────────────────────────────

export interface SyncResult {
  pushed: number
  pulled: number
}

export async function syncOnce(db: Database, cfg: GoogleConfig): Promise<SyncResult> {
  const pushed = await push(db, cfg)
  const pulled = await pull(db, cfg)
  return { pushed, pulled }
}

export function startPoller(db: Database, cfg: GoogleConfig): () => void {
  let running = false
  const tick = async () => {
    if (running || !isConnected(db)) return
    running = true
    try {
      await syncOnce(db, cfg)
    } catch (err) {
      console.error('[google sync] cycle failed:', (err as Error).message)
    } finally {
      running = false
    }
  }
  void tick() // run one immediately
  const timer = setInterval(() => void tick(), cfg.pollMs)
  return () => clearInterval(timer)
}

// ── Write hooks (wired into the calendar router by the orchester) ─────────────
// Only user-origin HTTP writes reach these, so only they enqueue an outbox row.

export interface CalendarWriteHooks {
  onCreate(event: YCalendarEvent): void
  onUpdate(event: YCalendarEvent): void
  onDelete(event: YCalendarEvent): void
}

export function googleWriteHooks(db: Database): CalendarWriteHooks {
  return {
    onCreate(event) {
      if (isConnected(db)) enqueueOutbox(db, 'upsert', event.id, null)
    },
    onUpdate(event) {
      if (isConnected(db)) enqueueOutbox(db, 'upsert', event.id, event.googleId ?? null)
    },
    onDelete(event) {
      if (isConnected(db) && event.googleId) enqueueOutbox(db, 'delete', event.id, event.googleId)
    },
  }
}
