import { useEffect, useState } from 'react'
import { NotesApp, useNotes } from '@muralink/module-notes/web'
import { ContactsApp, useContacts } from '@muralink/module-contacts/web'
import { RemindersApp, useReminders } from '@muralink/module-reminders/web'
import { useEvents } from '@muralink/module-calendar/web'
import { CalendarBoard } from './CalendarBoard.tsx'
import { MuralProvider, type MuralProviderProps, type MuralUser, type MuralSpacesConfig } from './MuralProvider.tsx'

// The one-line drop-in: a full local-first workspace with notes, reminders,
// contacts and calendar behind a tab bar, already themed. For teams that want
// the raw grid engine and recursive dashboards, import { GridCanvas,
// useGridLayout } from '@muralink/embed' and compose your own — this is the
// batteries-included default.

type TabId = 'notes' | 'reminders' | 'contacts' | 'calendar'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'notes', label: 'Notas', icon: '📝' },
  { id: 'reminders', label: 'Recordatorios', icon: '✅' },
  { id: 'contacts', label: 'Contactos', icon: '👤' },
  { id: 'calendar', label: 'Calendario', icon: '📅' },
]

// Shared spaces converge by re-reading: every 30s and whenever the tab regains
// focus, refresh the stores. Only runs when a remote space is configured —
// local-only embeds have nothing to poll.
const POLL_MS = 30_000

function refreshAll() {
  void useNotes.getState().loadAll()
  void useReminders.getState().loadAll()
  void useContacts.getState().loadAll()
  void useEvents.getState().reload()
}

function PollingRefresh() {
  useEffect(() => {
    const interval = setInterval(refreshAll, POLL_MS)
    window.addEventListener('focus', refreshAll)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refreshAll)
    }
  }, [])
  return null
}

export interface MuralBoardProps {
  /** Which module to open first. Default 'notes'. */
  initialTab?: TabId
  /** Restrict to a subset of modules. Default: all four. */
  tabs?: TabId[]
  /** Rename tabs (i18n), e.g. { reminders: 'To-dos' }. */
  labels?: Partial<Record<TabId, string>>
  theme?: MuralProviderProps['theme']
  tokens?: MuralProviderProps['tokens']
  /** Who is using the board — attribution in shared spaces. */
  user?: MuralUser
  /** Remote storage spaces (company server) to offer beside local. */
  spaces?: MuralSpacesConfig
}

export function MuralBoard({ initialTab = 'notes', tabs, labels, theme, tokens, user, spaces }: MuralBoardProps) {
  const visible = TABS.filter((t) => !tabs || tabs.includes(t.id))
  const [active, setActive] = useState<TabId>(
    visible.some((t) => t.id === initialTab) ? initialTab : (visible[0]?.id ?? 'notes'),
  )

  return (
    <MuralProvider
      theme={theme}
      tokens={tokens}
      user={user}
      spaces={spaces}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {spaces?.orchester && <PollingRefresh />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-bar)' }}>
        {visible.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 8,
              border: '1px solid ' + (active === t.id ? 'var(--accent)' : 'transparent'),
              background: active === t.id ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
              color: active === t.id ? 'var(--accent)' : 'var(--fg-dim)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {labels?.[t.id] ?? t.label}
          </button>
        ))}
        {user && (
          <span
            title={user.role ? `${user.name} · ${user.role}` : user.name}
            style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: user.color ?? 'var(--accent)' }} />
            {user.name}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {active === 'notes' && <NotesApp />}
        {active === 'reminders' && <RemindersApp />}
        {active === 'contacts' && <ContactsApp />}
        {active === 'calendar' && <CalendarBoard />}
      </div>
    </MuralProvider>
  )
}
