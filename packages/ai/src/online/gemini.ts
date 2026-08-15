// Google Gemini — online provider. Plain fetch against generativelanguage's
// streamGenerateContent (SSE variant); no SDK dep, apiKey injected by the server.

import type { AiCapabilities, AiChatChunk, AiChatRequest, AiProvider } from '../index'
import { sseData } from '../wire'

export interface GeminiConfig {
  apiKey: string
  /** Default model, e.g. 'gemini-2.0-flash'. */
  model?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

const DEFAULT_MODEL = 'gemini-2.0-flash'

export class GeminiAiProvider implements AiProvider {
  readonly id = 'gemini'
  readonly local = false
  private readonly cfg: Required<Omit<GeminiConfig, 'fetchImpl'>> & { fetchImpl: typeof fetch }
  private toolSeq = 0

  constructor(cfg: GeminiConfig) {
    this.cfg = {
      apiKey: cfg.apiKey,
      model: cfg.model ?? DEFAULT_MODEL,
      baseUrl: (cfg.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, ''),
      fetchImpl: cfg.fetchImpl ?? fetch,
    }
  }

  async capabilities(): Promise<AiCapabilities> {
    return { available: Boolean(this.cfg.apiKey), tools: true, models: [this.cfg.model] }
  }

  async *chat(req: AiChatRequest, signal?: AbortSignal): AsyncIterable<AiChatChunk> {
    const model = req.model ?? this.cfg.model
    const system = req.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
    const body: Record<string, unknown> = {
      contents: toGeminiContents(req),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    }
    if (req.tools?.length) {
      body['tools'] = [
        {
          functionDeclarations: req.tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ]
    }

    let res: Response
    try {
      res = await this.cfg.fetchImpl(
        `${this.cfg.baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.cfg.apiKey,
          },
          body: JSON.stringify(body),
          ...(signal ? { signal } : {}),
        },
      )
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : 'gemini request failed' }
      return
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      yield { type: 'error', error: `gemini ${res.status}: ${text || res.statusText}` }
      return
    }

    let sawToolCall = false
    for await (const data of sseData(res.body)) {
      let ev: any
      try {
        ev = JSON.parse(data)
      } catch {
        continue
      }
      const parts = ev.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        if (typeof part.text === 'string' && part.text) {
          yield { type: 'token', text: part.text }
        } else if (part.functionCall) {
          sawToolCall = true
          yield {
            type: 'tool_call',
            toolCall: {
              id: `gemini_${++this.toolSeq}`,
              name: part.functionCall.name,
              arguments: (part.functionCall.args as Record<string, unknown>) ?? {},
            },
          }
        }
      }
    }
    yield { type: 'done', stopReason: sawToolCall ? 'tool_calls' : 'end' }
  }
}

// Gemini roles: 'user' | 'model'. Tool results go back as functionResponse
// parts in a user turn; the call name is carried in toolCallId as `name:id`
// fallback — we keep a simple mapping by storing name in the id when needed.
function toGeminiContents(req: AiChatRequest): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  // Track call id → name to build functionResponse (Gemini matches by name).
  const callNames = new Map<string, string>()
  for (const m of req.messages) {
    if (m.role === 'system') continue
    if (m.role === 'assistant' && m.toolCalls?.length) {
      for (const tc of m.toolCalls) callNames.set(tc.id, tc.name)
      out.push({
        role: 'model',
        parts: [
          ...(m.content ? [{ text: m.content }] : []),
          ...m.toolCalls.map(tc => ({ functionCall: { name: tc.name, args: tc.arguments } })),
        ],
      })
    } else if (m.role === 'tool') {
      const name = callNames.get(m.toolCallId ?? '') ?? 'tool'
      out.push({
        role: 'user',
        parts: [{ functionResponse: { name, response: { result: m.content } } }],
      })
    } else {
      out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })
    }
  }
  return out
}
