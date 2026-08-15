// tracker module types. The core datum is elapsed time: a YTimeEntry is one
// span (start → end) attributed to a timer. A YTimerDef is the button the user
// presses — usually the face of a project mural (muralId). The calendar (or any
// other view) can render entries, but the data never lives there: model and
// view stay decoupled.

import type { YDateTime } from '@muralink/types'

export interface YTimerDef {
  id: string
  title: string
  emoji?: string
  color?: string
  // The project behind this timer — a soft reference to a mural (no DAG edge).
  muralId?: string
  archived?: boolean
  updatedAt: string
  // Which storage space currently holds this timer (runtime-only, stamped on
  // read by @muralink/spaces — never persisted in the payload).
  spaceId?: string
}

export interface YTimeEntry {
  id: string
  timerId: string
  start: YDateTime
  // Absent = the entry is RUNNING. This is the only source of truth for
  // running state — no separate flag to drift.
  end?: YDateTime
  note?: string
  updatedAt: string
  spaceId?: string
}
