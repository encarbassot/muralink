// Checks for the pure habit logic. Run: npx tsx modules/habits/checks/logic.check.ts

import type { YHabitCheck } from '../types.ts'
import { dayKey, findCheck, isCheckedOn } from '../logic.ts'

let failed = 0
function eq(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) console.log(`  ok  ${name}`)
  else { failed++; console.error(`FAIL  ${name}\n      got  ${g}\n      want ${w}`) }
}

// dayKey uses LOCAL date parts — a local time just past midnight must keep the
// local day even when its UTC representation is the previous day.
eq('dayKey local date', dayKey(new Date(2026, 7, 14, 0, 30)), '2026-08-14')
eq('dayKey pads month/day', dayKey(new Date(2026, 0, 5, 12)), '2026-01-05')
eq('dayKey end of day stays', dayKey(new Date(2026, 7, 14, 23, 59)), '2026-08-14')

const checks: YHabitCheck[] = [
  { id: 'c1', habitId: 'h1', date: '2026-08-14', checkedAt: 'x', updatedAt: 'x' },
  { id: 'c2', habitId: 'h2', date: '2026-08-13', checkedAt: 'x', updatedAt: 'x' },
]

eq('isCheckedOn hit', isCheckedOn(checks, 'h1', '2026-08-14'), true)
eq('isCheckedOn wrong day', isCheckedOn(checks, 'h1', '2026-08-13'), false)
eq('isCheckedOn wrong habit', isCheckedOn(checks, 'h3', '2026-08-14'), false)
eq('findCheck returns the row', findCheck(checks, 'h2', '2026-08-13')?.id, 'c2')

// Toggle semantics are "find first, then create or remove" — idempotence lives
// in findCheck: two finds for the same (habit, day) return the same row.
eq('find is stable (toggle idempotence basis)', findCheck(checks, 'h1', '2026-08-14')?.id, findCheck(checks, 'h1', '2026-08-14')?.id)

if (failed > 0) { console.error(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall habits checks passed')
