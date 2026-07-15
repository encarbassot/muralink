// Remote space — an orchester core (State 2) or any compatible JSON API over
// HTTP. Sharing between people happens through a space like this: every client
// reads the same collection, so they converge. Stack-agnostic: the module
// never imports the app's HTTP client; the host injects base URL + token.
// Generalized from the calendar module's apiProvider.

import type { SpaceEntity, SpaceQuery, StorageSpace } from './space'
import { stamp } from './registry'

export interface HttpSpaceConfig<T extends SpaceEntity> {
  // Absolute API base, no trailing slash. '' = same-origin (behind a proxy).
  baseUrl: string
  token: string
  // Collection path under the base, e.g. '/api/notes' or '/api/calendar/events'.
  path: string
  id?: string // space id, default 'orchester'
  label?: string // default 'Servidor'
  // Attribution: sent as X-Mural-User so the server can record createdBy.
  userId?: string
  // Strip runtime-only / server-derived fields before sending. Default strips
  // `spaceId`. The calendar overrides this to also drop `duration`.
  toBody?: (item: Partial<T>) => unknown
  // Serialize a list query to URL params. Default maps from/to/text/limit.
  toParams?: (query: SpaceQuery) => URLSearchParams
}

function defaultToBody<T extends SpaceEntity>(item: Partial<T>): unknown {
  const { spaceId: _s, ...body } = item
  return body
}

function defaultToParams(query: SpaceQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.text) params.set('text', query.text)
  if (query.limit) params.set('limit', String(query.limit))
  return params
}

export function makeHttpSpace<T extends SpaceEntity>(cfg: HttpSpaceConfig<T>): StorageSpace<T> {
  const spaceId = cfg.id ?? 'orchester'
  const base = cfg.baseUrl.replace(/\/$/, '')
  const toBody = cfg.toBody ?? defaultToBody<T>
  const toParams = cfg.toParams ?? defaultToParams
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.token}`,
  }
  if (cfg.userId) headers['X-Mural-User'] = cfg.userId

  async function req<R>(path: string, init?: RequestInit): Promise<R> {
    const res = await fetch(`${base}${cfg.path}${path}`, { ...init, headers })
    if (!res.ok) throw new Error(`space "${spaceId}" ${cfg.path} ${res.status}`)
    if (res.status === 204) return undefined as R
    return (await res.json()) as R
  }

  return {
    id: spaceId,
    label: cfg.label ?? 'Servidor',
    local: false,

    async list(query) {
      const qs = query ? `?${toParams(query)}` : ''
      const items = await req<T[]>(qs)
      return stamp(spaceId, items)
    },

    async create(item) {
      const created = await req<T>('', { method: 'POST', body: JSON.stringify(toBody(item)) })
      return { ...created, spaceId }
    },

    async update(id, patch) {
      const updated = await req<T>(`/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(toBody(patch)),
      })
      return { ...updated, spaceId }
    },

    async remove(id) {
      await req<void>(`/${id}`, { method: 'DELETE' })
    },
  }
}
