// Today's habit checks as a row of round checkboxes — the widget face. Good
// habits fill with the accent; bad habits (checked = "hoy sí lo hice") fill in
// the danger color so the board reads at a glance.

import { useEffect } from 'react'
import { RoundCheck } from '@muralink/ui'
import { todayKey, isCheckedOn } from '../../../logic.ts'
import { useHabits } from '../habitsStore.ts'

export const GOOD_COLOR = 'var(--accent, #6c8cff)'
export const BAD_COLOR = 'var(--danger, #e5484d)'

export function HabitsRow({ interactive = true, size = 40 }: { interactive?: boolean; size?: number }) {
  const habits = useHabits((s) => s.habits)
  const checks = useHabits((s) => s.checks)
  const loaded = useHabits((s) => s.loaded)
  const loadAll = useHabits((s) => s.loadAll)
  const toggleCheck = useHabits((s) => s.toggleCheck)

  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])

  const today = todayKey()

  if (loaded && habits.length === 0) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--fg-faint)', fontSize: 12, padding: 8 }}>
        Sin hábitos — añádelos desde la vista completa
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start', alignContent: 'flex-start', padding: 10, height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      {habits.map((h) => {
        const checked = isCheckedOn(checks, h.id, today)
        return (
          <div key={h.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: size + 14 }}>
            <RoundCheck
              checked={checked}
              icon={h.icon}
              size={size}
              color={h.polarity === 'bad' ? BAD_COLOR : GOOD_COLOR}
              onChange={interactive ? () => void toggleCheck(h.id) : undefined}
              title={h.title}
            />
            <span style={{ fontSize: 9, color: 'var(--fg-dim)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {h.title}
            </span>
          </div>
        )
      })}
    </div>
  )
}
