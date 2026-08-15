// Tools the chat assistant can call. Specs (JSON Schema) travel to the model
// through the server proxy; EXECUTION happens here in the browser against the
// module stores — the local-first answer to "the server can't read IndexedDB".
// If the user later activates orchester/cloud spaces, the same executors write
// there, because the stores route through the spaces layer.
//
// Write asymmetry is deliberate:
//   - update_prepared_message applies immediately (a draft is inherently
//     reversible — it's the AI's free workspace).
//   - propose_description_update NEVER writes: it creates a Proposal the UI
//     shows as a default-approve card (5s countdown). See chatStore.
//   - `notes` is never writable by the AI (user's scratchpad).
//
// Future seam (mail module): `send_prepared_message` will read the contact's
// YPreparedMessage.body and POST /api/mail/send. Not implemented — the mail
// module's /send is a stub returning {queued:true} today.

import type { AiToolSpec } from '@muralink/ai'
import { useContacts, usePreparedMessage, listContactTodos, addContactTodo } from '@muralink/module-contacts/web'
import {
  CONTACT_TODO_PRIVATE,
  CONTACT_TODO_SHARED,
  type ContactTodoRole,
} from '@muralink/module-contacts/types'

export interface ProposalRequest {
  contactId: string
  contactName: string
  summary: string
  newDescription: string
  prevDescription: string
}

export interface ToolContext {
  /** Called by propose_description_update — pushes a card, returns nothing. */
  propose: (p: ProposalRequest) => void
}

export const TOOL_SPECS: AiToolSpec[] = [
  {
    name: 'list_contacts',
    description:
      'Busca contactos por nombre, empresa o email. Devuelve como mucho 10 resultados con id y nombre. Úsalo para resolver a qué contacto se refiere el usuario.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Texto a buscar (vacío = primeros 10)' } },
      required: [],
    },
  },
  {
    name: 'read_contact',
    description:
      'Lee la ficha completa de un contacto: datos, descripción, notas (solo lectura), mensaje preparado y tareas. Llama a esto antes de hablar sobre un contacto.',
    parameters: {
      type: 'object',
      properties: { contactId: { type: 'string' } },
      required: ['contactId'],
    },
  },
  {
    name: 'update_prepared_message',
    description:
      'Sobrescribe el mensaje preparado (borrador persistente) de un contacto. Se aplica al momento — es tu zona de trabajo libre. Pasa SIEMPRE el texto completo del nuevo borrador.',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        body: { type: 'string', description: 'Texto completo del nuevo borrador' },
      },
      required: ['contactId', 'body'],
    },
  },
  {
    name: 'propose_description_update',
    description:
      'Propone actualizar la descripción (perfil durable) de un contacto cuando el usuario revela información nueva y duradera que contradice o amplía lo registrado. NO escribe directamente: el usuario ve una tarjeta con tu resumen y puede cancelar en 5 segundos. `summary` debe ser una frase corta del cambio (ej. "el usuario ya no se identifica con X, ahora prefiere Y") — nunca muestres un diff. `newDescription` es la descripción completa resultante.',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        newDescription: { type: 'string', description: 'Descripción completa resultante' },
        summary: { type: 'string', description: 'Resumen de una línea del cambio' },
      },
      required: ['contactId', 'newDescription', 'summary'],
    },
  },
  {
    name: 'add_todo',
    description: 'Añade una tarea a la lista privada o compartida de un contacto.',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        title: { type: 'string' },
        list: { type: 'string', enum: ['private', 'shared'] },
      },
      required: ['contactId', 'title', 'list'],
    },
  },
  {
    name: 'list_todos',
    description: 'Lista las tareas de un contacto (opcionalmente solo una lista).',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        list: { type: 'string', enum: ['private', 'shared'] },
      },
      required: ['contactId'],
    },
  },
]

const roleFor = (list: string): ContactTodoRole =>
  list === 'shared' ? CONTACT_TODO_SHARED : CONTACT_TODO_PRIVATE

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case 'list_contacts': {
        const q = String(args['query'] ?? '').toLowerCase()
        const state = useContacts.getState()
        if (!state.loaded) await state.loadAll()
        const hits = useContacts
          .getState()
          .contacts.filter(
            (c) =>
              !q ||
              c.name.toLowerCase().includes(q) ||
              c.company?.toLowerCase().includes(q) ||
              c.email?.address.toLowerCase().includes(q),
          )
          .slice(0, 10)
          .map((c) => ({ id: c.id, name: c.name, company: c.company }))
        return JSON.stringify(hits)
      }

      case 'read_contact': {
        const id = String(args['contactId'] ?? '')
        const state = useContacts.getState()
        if (!state.loaded) await state.loadAll()
        const c = useContacts.getState().get(id)
        if (!c) return JSON.stringify({ error: 'contacto no encontrado' })
        const prepared = await usePreparedMessage.getState().load(id)
        const todos = await listContactTodos(id)
        return JSON.stringify({
          id: c.id,
          name: c.name,
          email: c.email?.address,
          phone: c.phone?.number,
          company: c.company,
          tags: c.tags,
          description: c.description ?? '',
          notes: c.notes ?? '',
          preparedMessage: prepared?.body ?? '',
          todos: todos.map((t) => ({
            title: t.title,
            done: t.done,
            list: t.list === CONTACT_TODO_SHARED ? 'shared' : 'private',
          })),
        })
      }

      case 'update_prepared_message': {
        const id = String(args['contactId'] ?? '')
        const body = String(args['body'] ?? '')
        const saved = await usePreparedMessage.getState().saveNow(id, body)
        return JSON.stringify(saved ? { ok: true } : { error: 'no se pudo guardar' })
      }

      case 'propose_description_update': {
        const id = String(args['contactId'] ?? '')
        const contact = useContacts.getState().get(id)
        if (!contact) return JSON.stringify({ error: 'contacto no encontrado' })
        ctx.propose({
          contactId: id,
          contactName: contact.name,
          summary: String(args['summary'] ?? ''),
          newDescription: String(args['newDescription'] ?? ''),
          prevDescription: contact.description ?? '',
        })
        return JSON.stringify({
          status: 'proposed_to_user',
          note: 'El usuario ve la tarjeta; se auto-aplica en 5s salvo que cancele. No asumas que ya está aplicada.',
        })
      }

      case 'add_todo': {
        const id = String(args['contactId'] ?? '')
        const created = await addContactTodo(id, String(args['title'] ?? ''), roleFor(String(args['list'] ?? 'private')))
        return JSON.stringify(created ? { ok: true, id: created.id } : { error: 'no se pudo crear' })
      }

      case 'list_todos': {
        const id = String(args['contactId'] ?? '')
        const listArg = args['list'] ? roleFor(String(args['list'])) : undefined
        const todos = await listContactTodos(id)
        return JSON.stringify(
          todos
            .filter((t) => !listArg || t.list === listArg)
            .map((t) => ({
              title: t.title,
              done: t.done,
              list: t.list === CONTACT_TODO_SHARED ? 'shared' : 'private',
            })),
        )
      }

      default:
        return JSON.stringify({ error: `tool desconocida "${name}"` })
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'tool falló' })
  }
}
