// habits module types. A habit is a daily check — good (brush teeth) or bad
// (smoked) — tracked as one YHabitCheck row per (habit, local day). A habit can
// simultaneously be a todo/alarm (reminderId → reminders module) and a
// chronometer (timerId → tracker module): scalar links that travel with the
// record across storage spaces.

export type HabitPolarity = 'good' | 'bad'

export interface YHabitDef {
  id: string
  title: string
  /** Emoji shown inside the round check. */
  icon: string
  polarity: HabitPolarity
  // Reserved for non-daily schedules (RRULE subset). MVP treats every habit as
  // daily and never parses this.
  rrule?: string
  /** "Also a todo/alarm": linked YReminder id. */
  reminderId?: string
  /** "Also a chronometer": linked tracker YTimerDef id. */
  timerId?: string
  sort?: number
  updatedAt: string
  // Runtime-only, stamped on read by @muralink/spaces.
  spaceId?: string
}

export interface YHabitCheck {
  id: string
  habitId: string
  /** Local calendar day, 'YYYY-MM-DD' — built from local date parts, never UTC. */
  date: string
  /** ISO instant the check was made. */
  checkedAt: string
  updatedAt: string
  spaceId?: string
}
