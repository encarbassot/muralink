// Per-contact to-do lists — private and shared — built from existing pieces:
// each todo is a YReminder in the 'reminders' collection, linked to its
// contact by a Relation edge `contact --todo-private|todo-shared--> reminder`.
// Private vs shared lives in the relation ROLE (a first-class SpaceQuery
// filter), which is the seam a future tunnel-based sync will select on.
// Today both lists are local-only: contacts are plain fichas without user_id.
//
// This module also registers the local idb spaces for the 'relations' and
// 'relationTypes' collections (first consumer of the relation layer on web).

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Relation, RelationType } from '@muralink/types'
import {
  RELATIONS,
  RELATION_TYPES,
  registerSpace,
  makeIdbSpace,
  matchRelation,
  matchRelationType,
  listRelationsFor,
  newRelationType,
  spaceFor,
  listSpaces,
} from '@muralink/spaces'
import type { YReminder } from '@muralink/module-reminders/types'
import { useReminders } from '@muralink/module-reminders/web'
import type { ContactTodoRole } from '../../types.ts'
import { CONTACT_TODO_PRIVATE, CONTACT_TODO_SHARED } from '../../types.ts'

// First web consumer of the relation layer registers its local spaces. Safe if
// a host registered them already — same 'local' id just replaces the entry.
registerSpace(
  RELATIONS,
  makeIdbSpace<Relation>({ dbName: 'elio-relations', store: 'relations', match: matchRelation }),
)
registerSpace(
  RELATION_TYPES,
  makeIdbSpace<RelationType>({
    dbName: 'elio-relations',
    store: 'relationTypes',
    match: matchRelationType,
  }),
)

function uid(): string {
  return `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export interface ContactTodo extends YReminder {
  list: ContactTodoRole
  relationId: string
}

export interface ContactTodosApi {
  todos: ContactTodo[]
  loaded: boolean
  addTodo: (title: string, list: ContactTodoRole) => Promise<void>
  toggleTodo: (id: string) => Promise<void>
  removeTodo: (todo: ContactTodo) => Promise<void>
  reload: () => Promise<void>
}

async function listContactTodoRelations(contactId: string): Promise<Relation[]> {
  const all = await listRelationsFor({ type: 'contact', id: contactId })
  return all.filter(
    (r) => !r.inverse && (r.role === CONTACT_TODO_PRIVATE || r.role === CONTACT_TODO_SHARED),
  )
}

// ── Imperative API (hook-free) — used by the chat assistant's tool executors ──

export async function listContactTodos(contactId: string): Promise<ContactTodo[]> {
  const remState = useReminders.getState()
  if (!remState.loaded) await remState.loadAll()
  const relations = await listContactTodoRelations(contactId)
  const byId = new Map(useReminders.getState().reminders.map((r) => [r.id, r]))
  const out: ContactTodo[] = []
  for (const rel of relations) {
    const reminder = byId.get(rel.toId)
    if (!reminder) continue
    out.push({ ...reminder, list: rel.role as ContactTodoRole, relationId: rel.id })
  }
  return out
}

export async function addContactTodo(
  contactId: string,
  title: string,
  list: ContactTodoRole,
): Promise<ContactTodo | undefined> {
  if (!title.trim()) return undefined
  const reminder = await useReminders.getState().create({ title: title.trim() })
  const now = new Date().toISOString()
  const relation: Relation = {
    id: uid(),
    role: list,
    fromType: 'contact',
    fromId: contactId,
    toType: 'reminder',
    toId: reminder.id,
    createdAt: now,
    updatedAt: now,
  }
  const relSpace = spaceFor<Relation>(RELATIONS, undefined, 'local')
  if (relSpace) await relSpace.create(relation)
  const typeSpace = spaceFor<RelationType>(RELATION_TYPES, undefined, 'local')
  if (typeSpace) {
    const t = newRelationType(
      'contact',
      'reminder',
      list,
      list === CONTACT_TODO_PRIVATE ? 'tarea privada' : 'tarea compartida',
    )
    const existing = (await typeSpace.list({ ids: [t.id] }))[0]
    if (existing) await typeSpace.update(t.id, { usageCount: (existing.usageCount ?? 0) + 1 })
    else await typeSpace.create(t)
  }
  return { ...reminder, list, relationId: relation.id }
}

export function useContactTodos(contactId: string | undefined): ContactTodosApi {
  const reminders = useReminders((s) => s.reminders)
  const remindersLoaded = useReminders((s) => s.loaded)
  const [relations, setRelations] = useState<Relation[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!contactId) {
      setRelations([])
      setLoaded(true)
      return
    }
    setRelations(await listContactTodoRelations(contactId))
    setLoaded(true)
  }, [contactId])

  useEffect(() => {
    setLoaded(false)
    void reload()
  }, [reload])

  useEffect(() => {
    if (!remindersLoaded) void useReminders.getState().loadAll()
  }, [remindersLoaded])

  const todos = useMemo<ContactTodo[]>(() => {
    const byId = new Map(reminders.map((r) => [r.id, r]))
    const out: ContactTodo[] = []
    for (const rel of relations) {
      const reminder = byId.get(rel.toId)
      if (!reminder) continue // reminder deleted elsewhere; edge is stale
      out.push({ ...reminder, list: rel.role as ContactTodoRole, relationId: rel.id })
    }
    return out
  }, [relations, reminders])

  const addTodo = useCallback(
    async (title: string, list: ContactTodoRole) => {
      if (!contactId) return
      await addContactTodo(contactId, title, list)
      await reload()
    },
    [contactId, reload],
  )

  const toggleTodo = useCallback(async (id: string) => {
    await useReminders.getState().toggle(id)
  }, [])

  const removeTodo = useCallback(
    async (todo: ContactTodo) => {
      await useReminders.getState().remove(todo.id)
      const relSpace = listSpaces<Relation>(RELATIONS).find((s) => s.local)
      if (relSpace) await relSpace.remove(todo.relationId)
      await reload()
    },
    [reload],
  )

  return { todos, loaded: loaded && remindersLoaded, addTodo, toggleTodo, removeTodo, reload }
}
