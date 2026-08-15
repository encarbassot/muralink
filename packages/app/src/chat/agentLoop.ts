// The agent loop runs CLIENT-side: the server is a stateless LLM proxy, and
// tool calls execute here against the browser's local-first stores. On each
// tool_calls stop we append role:'tool' results and re-POST the grown
// conversation. Capped at 6 iterations per user turn.

import type { AiMessage, AiToolCall } from '@muralink/ai'
import { useContacts } from '@muralink/module-contacts/web'
import { streamChat } from './aiApi.ts'
import { TOOL_SPECS, executeTool, type ToolContext } from './tools.ts'

const MAX_ITERATIONS = 6

export function buildSystemPrompt(): string {
  const { activeContactId, contacts } = useContacts.getState()
  const active = activeContactId ? contacts.find((c) => c.id === activeContactId) : undefined
  const lines = [
    'Eres el asistente de Muralink, una plataforma local-first. Responde en el idioma del usuario (por defecto español), breve y directo.',
    'Tienes tools para trabajar con los contactos del usuario: leer fichas, editar el mensaje preparado (borrador libre), añadir tareas y proponer cambios de descripción.',
    'Cuando el usuario te cuente información nueva y DURADERA sobre un contacto que contradiga o amplíe su descripción registrada, llama a propose_description_update con la descripción completa resultante y un resumen de UNA línea del cambio (p. ej. "el usuario ya no se identifica con X, ahora prefiere Y"). No muestres diffs ni el texto completo en el chat.',
    'El campo notes es del usuario: puedes leerlo, nunca proponer escribirlo.',
    'Usa read_contact antes de afirmar qué contiene una ficha. Si no sabes a qué contacto se refiere el usuario, usa list_contacts.',
  ]
  if (active) {
    lines.push(
      `Contexto: el usuario tiene abierta la ficha del contacto "${active.name}" (id: ${active.id}). Si habla de "este contacto" se refiere a él.`,
    )
  }
  return lines.join('\n')
}

export interface RunTurnCallbacks {
  /** Streaming text delta for the current assistant message. */
  onToken: (text: string) => void
  /** A new assistant message starts (after tool execution). */
  onAssistantStart: () => void
  /** Tool activity, for the status line. */
  onToolStart: (name: string) => void
  onError: (error: string) => void
}

/**
 * Run one user turn to completion. `history` must already end with the user
 * message. Returns the messages appended during the turn (assistant + tool).
 */
export async function runTurn(
  history: AiMessage[],
  toolCtx: ToolContext,
  cb: RunTurnCallbacks,
  signal: AbortSignal,
): Promise<AiMessage[]> {
  const appended: AiMessage[] = []
  const messages = (): AiMessage[] => [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
    ...appended,
  ]

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (signal.aborted) break
    if (i > 0) cb.onAssistantStart()

    let text = ''
    const calls: AiToolCall[] = []
    let stopped: 'end' | 'tool_calls' = 'end'

    try {
      for await (const chunk of streamChat({ messages: messages(), tools: TOOL_SPECS }, signal)) {
        if (signal.aborted) break
        switch (chunk.type) {
          case 'token':
            text += chunk.text
            cb.onToken(chunk.text)
            break
          case 'tool_call':
            calls.push(chunk.toolCall)
            break
          case 'done':
            stopped = chunk.stopReason
            break
          case 'error':
            cb.onError(chunk.error)
            return appended
        }
      }
    } catch (e) {
      if (!signal.aborted) cb.onError(e instanceof Error ? e.message : 'chat falló')
      return appended
    }

    appended.push({
      role: 'assistant',
      content: text,
      ...(calls.length ? { toolCalls: calls } : {}),
    })

    if (stopped !== 'tool_calls' || calls.length === 0 || signal.aborted) break

    for (const call of calls) {
      cb.onToolStart(call.name)
      const result = await executeTool(call.name, call.arguments, toolCtx)
      appended.push({ role: 'tool', content: result, toolCallId: call.id })
    }
  }
  return appended
}
