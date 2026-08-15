// Shared wire helpers for streaming providers. Ollama streams NDJSON; the
// online APIs stream SSE ("data: {...}" lines). Both reduce to line-splitting
// a byte stream and JSON-parsing per line.

import type { AiMessage } from './index'

/** Split a byte stream into trimmed non-empty lines. */
export async function* streamLines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) yield line
      }
    }
    const tail = buf.trim()
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

/** SSE stream → the JSON payload of each `data:` line ('[DONE]' skipped). */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  for await (const line of streamLines(body)) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data && data !== '[DONE]') yield data
  }
}

/** Map AiMessage[] → the OpenAI-style wire shape (used by OpenAI adapter). */
export function toOpenAiStyleMessages(messages: AiMessage[]): Record<string, unknown>[] {
  return messages.map(m => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      }
    }
    return { role: m.role, content: m.content }
  })
}
