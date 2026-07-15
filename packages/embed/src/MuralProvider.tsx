import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { registerSpace, makeHttpSpace, type SpaceQuery } from '@muralink/spaces'
import type { YCalendarEvent } from '@muralink/module-calendar/web'
import './theme.css'

// Applies the self-contained Mural theme (via the .mural-root class from
// theme.css) around whatever you embed. Every Mural component reads the
// --bg / --fg / --border / --accent tokens this establishes, so nothing
// renders unstyled and the host page's own :root vars stay untouched.
//
// Also the identity + storage entry point: pass `user` (who is using the
// embed — e.g. read from your session) and `spaces` (remote storage the items
// can be saved to). With `spaces.orchester` set, every module gains a
// "company server" space next to its local one; items only move there when
// the user saves them there. Local-first: omit both and everything stays in
// IndexedDB.

export interface MuralUser {
  id: string
  name: string
  role?: string
  color?: string
}

export interface MuralSpacesConfig {
  /** The company's own Mural server (orchester core). */
  orchester?: {
    /** API base, no trailing slash. '' or '/elio' when proxied same-origin. */
    baseUrl: string
    token: string
    label?: string
  }
}

interface MuralContextValue {
  user?: MuralUser
  spaces?: MuralSpacesConfig
}

const MuralContext = createContext<MuralContextValue>({})

/** The user the host app passed to <MuralProvider>, if any. */
export function useMuralUser(): MuralUser | undefined {
  return useContext(MuralContext).user
}

/** True when a remote space is configured (used to enable polling refresh). */
export function useMuralHasRemoteSpaces(): boolean {
  return !!useContext(MuralContext).spaces?.orchester
}

// Every collection the embed ships. Calendar keeps its event-range query and
// server-derived duration, hence the custom body/params mappers.
function registerOrchesterSpaces(cfg: NonNullable<MuralSpacesConfig['orchester']>, userId?: string) {
  const common = {
    baseUrl: cfg.baseUrl,
    token: cfg.token,
    id: 'orchester',
    label: cfg.label ?? 'Servidor',
    userId,
  }
  registerSpace('notes', makeHttpSpace({ ...common, path: '/api/notes' }))
  registerSpace('reminders', makeHttpSpace({ ...common, path: '/api/reminders' }))
  registerSpace('contacts', makeHttpSpace({ ...common, path: '/api/contacts/contacts' }))
  registerSpace(
    'events',
    makeHttpSpace<YCalendarEvent>({
      ...common,
      path: '/api/calendar/events',
      toBody: (e) => ({
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        metadata: e.metadata,
      }),
      toParams: (q: SpaceQuery) => {
        const params = new URLSearchParams()
        if (q.from) params.set('from', q.from)
        if (q.to) params.set('to', q.to)
        return params
      },
    }),
  )
}

export interface MuralProviderProps {
  children: ReactNode
  /** 'dark' (default) or 'light'. */
  theme?: 'dark' | 'light'
  /** Override individual tokens, e.g. { '--accent': '#e11d48' }. */
  tokens?: Record<string, string>
  /** Who is using the embed — enables attribution (createdBy) in shared spaces. */
  user?: MuralUser
  /** Remote storage spaces to offer beside the local one. */
  spaces?: MuralSpacesConfig
  className?: string
  style?: CSSProperties
}

export function MuralProvider({
  children,
  theme = 'dark',
  tokens,
  user,
  spaces,
  className,
  style,
}: MuralProviderProps) {
  // Register before children mount so module stores see the space on first
  // load. Registration is a module-level Map write — idempotent, re-render safe.
  useMemo(() => {
    if (spaces?.orchester) registerOrchesterSpaces(spaces.orchester, user?.id)
  }, [spaces?.orchester, user?.id])

  const ctx = useMemo(() => ({ user, spaces }), [user, spaces])

  return (
    <MuralContext.Provider value={ctx}>
      <div
        className={`mural-root${className ? ` ${className}` : ''}`}
        data-mural-theme={theme}
        style={{ height: '100%', minHeight: 0, ...(tokens as CSSProperties), ...style }}
      >
        {children}
      </div>
    </MuralContext.Provider>
  )
}
