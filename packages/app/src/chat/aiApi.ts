// Client for the orchester's AI proxy (/api/ai). Uses fetch, not the shared
// axios client — axios can't consume a streaming body in the browser. Reads
// the live bindings API_ORIGIN/API_TOKEN so it follows configureApi(env).

import type { AiChatChunk, AiChatRequest } from '@muralink/ai'
import { API_ORIGIN, API_TOKEN } from '../api/client.ts'

export interface AiProviderStatus {
  id: string
  local: boolean
  available: boolean
  tools: boolean
  models: string[]
}

export interface AiStatus {
  available: boolean
  default: string
  providers: AiProviderStatus[]
}

export async function fetchAiStatus(): Promise<AiStatus | null> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/ai/status`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    return (await res.json()) as AiStatus
  } catch {
    return null
  }
}

/** POST /api/ai/chat and iterate its NDJSON chunk stream. */
export async function* streamChat(
  req: AiChatRequest & { provider?: string },
  signal?: AbortSignal,
): AsyncIterable<AiChatChunk> {
  const res = await fetch(`${API_ORIGIN}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify(req),
    ...(signal ? { signal } : {}),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    yield { type: 'error', error: `ai ${res.status}: ${text || res.statusText}` }
    return
  }

  const reader = res.body.getReader()
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
        if (!line) continue
        try {
          yield JSON.parse(line) as AiChatChunk
        } catch {
          /* skip malformed line */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
