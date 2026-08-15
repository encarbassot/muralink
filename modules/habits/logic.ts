// Pure habit logic. Dependency-free so web, server and checks share it.

import type { YHabitCheck } from './types.ts'

/** Local 'YYYY-MM-DD' key. Built from local date parts — toISOString() would
 *  shift the day near midnight for non-UTC timezones. */
export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayKey(now: Date = new Date()): string {
  return dayKey(now)
}

export function findCheck(checks: YHabitCheck[], habitId: string, dateKey: string): YHabitCheck | undefined {
  return checks.find((c) => c.habitId === habitId && c.date === dateKey)
}

export function isCheckedOn(checks: YHabitCheck[], habitId: string, dateKey: string): boolean {
  return !!findCheck(checks, habitId, dateKey)
}
