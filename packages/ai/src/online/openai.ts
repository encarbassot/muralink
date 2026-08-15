// OpenAI (GPT) — online provider. Plain fetch against chat/completions with
// SSE streaming; no SDK dep, apiKey injected by the server (payments rule).

import type { AiCapabilities, AiChatChunk, AiChatRequest, AiProvider } from '../index'
import { sseData, toOpenAiStyleMessages } from '../wire'

export interface OpenAiConfig {
  apiKey: string
  /** Default model, e.g. 'gpt-4o'. */
  model?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

const DEFAULT_MODEL = 'gpt-4o'

export class OpenAiAiProvider implements AiProvider {
  readonly id = 'openai'
  readonly local = false
  private readonly cfg: Required<Omit<OpenAiConfig, 'fetchImpl'>> & { fetchImpl: typeof fetch }

  constructor(cfg: OpenAiConfig) {
    this.cfg = {
      apiKey: cfg.apiKey,
      model: cfg.model ?? DEFAULT_MODEL,
      baseUrl: (cfg.baseUrl ?? 'https://api.openai.com').replace(/\/$/, ''),
      fetchImpl: cfg.fetchImpl ?? fetch,
    }
  }

  async capabilities(): Promise<AiCapabilities> {
    return { available: Boolean(this.cfg.apiKey), tools: true, models: [this.cfg.model] }
  }

  async *chat(req: AiChatRequest, signal?: AbortSignal): AsyncIterable<AiChatChunk> {
    const body: Record<string, unknown> = {
      model: req.model ?? this.cfg.model,
      stream: true,
      messages: toOpenAiStyleMessages(req.messages),
    }
    if (req.tools?.length) {
      body['tools'] = req.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    }

    let res: Response
    try {
      res = await this.cfg.fetchImpl(`${this.cfg.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      })
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : 'openai request failed' }
      return
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      yield { type: 'error', error: `openai ${res.status}: ${text || res.statusText}` }
      return
    }

    // Tool-call deltas arrive fragmented per index — buffer until the stream ends.
    const toolBuf = new Map<number, { id: string; name: string; json: string }>()
    let sawToolCall = false

    for await (const data of sseData(res.body)) {
      let ev: any
      try {
        ev = JSON.parse(data)
      } catch {
        continue
      }
      const delta = ev.choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) yield { type: 'token', text: delta.content }
      for (const tc of delta.tool_calls ?? []) {
        const entry = toolBuf.get(tc.index) ?? { id: '', name: '', json: '' }
        if (tc.id) entry.id = tc.id
        if (tc.function?.name) entry.name += tc.function.name
        if (tc.function?.arguments) entry.json += tc.function.arguments
        toolBuf.set(tc.index, entry)
      }
    }

    for (const entry of toolBuf.values()) {
      sawToolCall = true
      let args: Record<string, unknown> = {}
      try {
        args = entry.json ? JSON.parse(entry.json) : {}
      } catch {
        /* malformed args → empty object */
      }
      yield { type: 'tool_call', toolCall: { id: entry.id, name: entry.name, arguments: args } }
    }
    yield { type: 'done', stopReason: sawToolCall ? 'tool_calls' : 'end' }
  }
}
