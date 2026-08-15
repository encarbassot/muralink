// Full habits view: today's check row on top, then the editable habit list
// (title / icon / polarity, delete, convert to reminder). Conversion links the
// habit to a YReminder (reminderId) so the same instance is also a todo/alarm.

import { useEffect, useState } from 'react'
import { RoundCheck } from '@muralink/ui'
import { useReminders } from '@muralink/module-reminders/web'
import type { YHabitDef } from '../../../types.ts'
import { todayKey, isCheckedOn } from '../../../logic.ts'
import { useHabits } from '../habitsStore.ts'
import { GOOD_COLOR, BAD_COLOR, HabitsRow } from './HabitsRow.tsx'

function HabitRow({ habit }: { habit: YHabitDef }) {
  const checks = useHabits((s) => s.checks)
  const toggleCheck = useHabits((s) => s.toggleCheck)
  const updateHabit = useHabits((s) => s.updateHabit)
  const removeHabit = useHabits((s) => s.removeHabit)
  const createReminder = useReminders((s) => s.create)

  const [title, setTitle] = useState(habit.title)
  useEffect(() => { setTitle(habit.title) }, [habit.title])

  const checked = isCheckedOn(checks, habit.id, todayKey())
  const bad = habit.polarity === 'bad'

  async function convertToReminder() {
    if (habit.reminderId) return
    const reminder = await createReminder({ title: habit.title })
    await updateHabit(habit.id, { reminderId: reminder.id })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}>
      <RoundCheck
        checked={checked}
        icon={habit.icon}
        size={36}
        color={bad ? BAD_COLOR : GOOD_COLOR}
        onChange={() => void toggleCheck(habit.id)}
        title={checked ? 'Hecho hoy' : 'Marcar hoy'}
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title.trim() && title !== habit.title) void updateHabit(habit.id, { title: title.trim() }) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 13, fontWeight: 600, outline: 'none' }}
      />
      <input
        value={habit.icon}
        onChange={(e) => { const icon = e.target.value.trim(); if (icon) void updateHabit(habit.id, { icon }) }}
        maxLength={4}
        title="Emoji"
        style={{ width: 34, textAlign: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)', fontSize: 14, padding: '3px 0' }}
      />
      <button
        onClick={() => void updateHabit(habit.id, { polarity: bad ? 'good' : 'bad' })}
        title={bad ? 'Hábito malo (a evitar)' : 'Hábito bueno'}
        style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)', color: bad ? BAD_COLOR : GOOD_COLOR, cursor: 'pointer', fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
      >
        {bad ? '👎 Malo' : '👍 Bueno'}
      </button>
      <button
        onClick={() => void convertToReminder()}
        disabled={!!habit.reminderId}
        title={habit.reminderId ? 'Ya vinculado a un recordatorio' : 'Crear recordatorio vinculado'}
        style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)', color: habit.reminderId ? 'var(--fg-faint)' : 'var(--fg-dim)', cursor: habit.reminderId ? 'default' : 'pointer', fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
      >
        {habit.reminderId ? '🔔 Vinculado' : '🔔 Recordatorio'}
      </button>
      <button
        onClick={() => { if (confirm(`¿Eliminar “${habit.title}” y sus checks?`)) void removeHabit(habit.id) }}
        title="Eliminar hábito"
        style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 13 }}
      >
        🗑
      </button>
    </div>
  )
}

export function HabitsApp() {
  const habits = useHabits((s) => s.habits)
  const loaded = useHabits((s) => s.loaded)
  const loadAll = useHabits((s) => s.loadAll)
  const createHabit = useHabits((s) => s.createHabit)
  const remindersLoaded = useReminders((s) => s.loaded)
  const loadReminders = useReminders((s) => s.loadAll)

  const [newTitle, setNewTitle] = useState('')

  useEffect(() => { if (!loaded) void loadAll() }, [loaded, loadAll])
  useEffect(() => { if (!remindersLoaded) void loadReminders() }, [remindersLoaded, loadReminders])

  async function add() {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    await createHabit({ title })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ padding: '6px 12px 0', fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Hoy</div>
        <HabitsRow size={44} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {habits.map((h) => <HabitRow key={h.id} habit={h} />)}
        <form
          onSubmit={(e) => { e.preventDefault(); void add() }}
          style={{ display: 'flex', gap: 8, marginTop: habits.length ? 4 : 0 }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Nuevo hábito… (p. ej. Lavarse los dientes)"
            style={{ flex: 1, minWidth: 0, background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--fg)', fontSize: 13, padding: '8px 12px', outline: 'none' }}
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--fg)', cursor: newTitle.trim() ? 'pointer' : 'default', fontSize: 13, padding: '8px 14px' }}
          >
            ＋ Añadir
          </button>
        </form>
      </div>
    </div>
  )
}
