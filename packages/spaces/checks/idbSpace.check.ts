// Checks for the IndexedDB space. Run: npx tsx packages/spaces/checks/idbSpace.check.ts
//
// The case that matters is two collections sharing one database. That is the
// shape habits (habits + checks) and tracker (timers + entries) have always
// had, and it used to lose the second store entirely: the first open created
// its store and left the database at version 1, so the second open never ran
// `upgrade` and wrote into a store that did not exist.

import 'fake-indexeddb/auto'
import { makeIdbSpace } from '../src/idbSpace.ts'

interface Row { id: string; title?: string; day?: string; spaceId?: string }

let failed = 0
function eq(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) console.log(`  ok  ${name}`)
  else { failed++; console.error(`FAIL  ${name}\n      got  ${g}\n      want ${w}`) }
}

async function main() {
  // ── two stores, one database, asked for concurrently ──────────────────────
  // Concurrently is the real-world shape: loadAll fires both list() calls in
  // the same tick via Promise.all.
  const defs = makeIdbSpace<Row>({ dbName: 'check-habits', store: 'habits' })
  const events = makeIdbSpace<Row>({ dbName: 'check-habits', store: 'events' })

  await Promise.all([defs.list(), events.list()])

  await defs.create({ id: 'h1', title: 'agua' })
  await events.create({ id: 'e1', day: '2026-08-15' })

  eq('def written to its store', (await defs.list()).map((r) => r.id), ['h1'])
  eq('event written to the second store of the same db', (await events.list()).map((r) => r.id), ['e1'])

  // ── a third store added later, to an existing database ────────────────────
  // This is the upgrade path a shipped device takes: the database already
  // exists at some version and a new release adds a collection to it.
  const notes = makeIdbSpace<Row>({ dbName: 'check-habits', store: 'notes' })
  await notes.create({ id: 'n1', title: 'nota' })
  eq('store added to an existing database', (await notes.list()).map((r) => r.id), ['n1'])
  eq('earlier stores survive the upgrade', (await defs.list()).map((r) => r.id), ['h1'])

  // ── the space contract itself ─────────────────────────────────────────────
  eq('create stamps the space id', (await defs.list())[0]?.spaceId, 'local')

  const updated = await defs.update('h1', { title: 'agua fría' })
  eq('update merges', updated?.title, 'agua fría')
  eq('update of a missing row returns undefined', await defs.update('nope', { title: 'x' }), undefined)

  await defs.remove('h1')
  eq('remove deletes', (await defs.list()).length, 0)

  // spaceId is runtime metadata and must never reach the record on disk.
  await events.create({ id: 'e2', day: '2026-08-16', spaceId: 'orchester' })
  const raw = (await events.list()).find((r) => r.id === 'e2')
  eq('spaceId is re-stamped, never persisted', raw?.spaceId, 'local')

  // ── match filter ──────────────────────────────────────────────────────────
  const ranged = makeIdbSpace<Row>({
    dbName: 'check-ranged',
    store: 'events',
    match: (e, q) => (!q.from || (e.day ?? '') >= q.from) && (!q.to || (e.day ?? '') <= q.to),
  })
  await ranged.create({ id: 'a', day: '2026-08-01' })
  await ranged.create({ id: 'b', day: '2026-08-15' })
  eq('match filters on query', (await ranged.list({ from: '2026-08-10' })).map((r) => r.id), ['b'])
  eq('no query returns everything', (await ranged.list()).length, 2)

  console.log(failed ? `\n${failed} failed` : '\nall ok')
  process.exit(failed ? 1 : 0)
}

void main()
