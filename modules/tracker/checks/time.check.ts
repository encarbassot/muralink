// Checks for the pure time math. Run: npx tsx modules/tracker/checks/time.check.ts

import type { YTimeEntry, YTimerDef } from '../types.ts'
import { elapsedMs, entryToEvent, overlapsRange, totalTodayMs, runningEntry, formatElapsed } from '../time.ts'
import { isOccurrenceId } from '../../calendar/recurrence.ts'

let failed = 0
function ok(name: string, cond: boolean): void {
  if (cond) console.log(`  ok  ${name}`)
  else { failed++; console.error(`FAIL  ${name}`) }
}
function eq(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) console.log(`  ok  ${name}`)
  else { failed++; console.error(`FAIL  ${name}\n      got  ${g}\n      want ${w}`) }
}

const TZ = 'Europe/Madrid'
function entry(id: string, timerId: string, startIso: string, endIso?: string): YTimeEntry {
  return {
    id,
    timerId,
    start: { iso: startIso, timezone: TZ },
    end: endIso ? { iso: endIso, timezone: TZ } : undefined,
    updatedAt: startIso,
  }
}

const now = new Date('2026-08-14T12:00:00.000Z')
const nowMs = now.getTime()

// elapsedMs — closed and open entries
eq('elapsedMs closed', elapsedMs(entry('a', 't', '2026-08-14T10:00:00.000Z', '2026-08-14T10:30:00.000Z'), nowMs), 30 * 60_000)
eq('elapsedMs open clamps to now', elapsedMs(entry('a', 't', '2026-08-14T11:00:00.000Z'), nowMs), 60 * 60_000)
eq('elapsedMs never negative', elapsedMs(entry('a', 't', '2026-08-14T13:00:00.000Z'), nowMs), 0)

// runningEntry
const entries = [
  entry('e1', 't1', '2026-08-14T09:00:00.000Z', '2026-08-14T09:45:00.000Z'),
  entry('e2', 't1', '2026-08-14T11:30:00.000Z'),
  entry('e3', 't2', '2026-08-14T10:00:00.000Z', '2026-08-14T10:10:00.000Z'),
]
eq('runningEntry finds the open one', runningEntry(entries, 't1')?.id, 'e2')
eq('runningEntry none for closed timer', runningEntry(entries, 't2'), undefined)

// totalTodayMs — mixes closed + open, clamps to the local day of `now`.
// (now is 2026-08-14 14:00 local Madrid; entries above are all inside the day)
const total = totalTodayMs(entries, 't1', now)
eq('totalTodayMs closed + open', total, 45 * 60_000 + 30 * 60_000)

// overlapsRange — an open entry started before the range still matches
const openOld = entry('old', 't', '2026-08-13T08:00:00.000Z')
ok('open entry overlaps a later window', overlapsRange(openOld, '2026-08-14T00:00:00.000Z', '2026-08-15T00:00:00.000Z', nowMs))
const closedOld = entry('c', 't', '2026-08-13T08:00:00.000Z', '2026-08-13T09:00:00.000Z')
ok('closed old entry excluded', !overlapsRange(closedOld, '2026-08-14T00:00:00.000Z', '2026-08-15T00:00:00.000Z', nowMs))
ok('future window excluded', !overlapsRange(closedOld, undefined, '2026-08-13T07:00:00.000Z', nowMs))
ok('no range = always overlaps', overlapsRange(closedOld, undefined, undefined, nowMs))

// entryToEvent — id prefix, clamping, no occurrence-separator collision
const timer: YTimerDef = { id: 't1', title: 'Proyecto X', emoji: '🎯', color: '#f60', updatedAt: '2026-08-14T00:00:00.000Z' }
const ev = entryToEvent(entry('e2', 't1', '2026-08-14T11:30:00.000Z'), timer, now)
eq('event id prefix', ev.id, 'trk-e2')
ok('event id is not an occurrence id', !isOccurrenceId(ev.id))
eq('open event end clamps to now', ev.end.iso, now.toISOString())
eq('event duration seconds', ev.duration.seconds, 30 * 60)
eq('event title carries emoji + timer title', ev.title, '🎯 Proyecto X')
eq('event metadata', ev.metadata, { source: 'tracker', timerId: 't1', color: '#f60' })
ok('event is not allDay', !ev.allDay)

// formatElapsed
eq('formatElapsed mm:ss', formatElapsed(65_000), '01:05')
eq('formatElapsed h:mm:ss', formatElapsed(3_600_000 + 61_000), '1:01:01')

if (failed > 0) { console.error(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall time checks passed')
