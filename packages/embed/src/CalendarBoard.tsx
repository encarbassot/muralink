import { useEffect } from 'react'
import { CalendarApp, useEvents } from '@muralink/module-calendar/web'
import { useMuralUser } from './MuralProvider.tsx'

// CalendarApp is a controlled component (events + callbacks come from the
// host). This wrapper wires it to the local-first useEvents store so the
// calendar is self-contained and persists to IndexedDB with no backend —
// matching how NotesApp and ContactsApp already behave. When a user is in
// context (shared calendars), new events are attributed to them.

export function CalendarBoard() {
  const events = useEvents((s) => s.events)
  const load = useEvents((s) => s.load)
  const add = useEvents((s) => s.add)
  const user = useMuralUser()

  useEffect(() => {
    // Wide window across all active targets; embed defaults to local-only.
    const from = new Date(); from.setDate(from.getDate() - 31); from.setHours(0, 0, 0, 0)
    const to = new Date(); to.setDate(to.getDate() + 62); to.setHours(0, 0, 0, 0)
    void load(from, to)
  }, [load])

  return (
    <CalendarApp
      events={events}
      onCreate={(start, end) => void add(start, end, { createdBy: user?.id, color: user?.color })}
    />
  )
}
