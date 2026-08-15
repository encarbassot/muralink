// Anthropic (Claude) — online provider. Plain fetch against the Messages API
// (no SDK dep, mirrors the payments rule: this package never holds a key — the
// server injects it from env). Streams SSE and translates events to AiChatChunk.

import type { AiCapabilities, AiChatChunk, AiChatRequest, AiProvider } from '../index'
import { sseData } from '../wire'

export interface AnthropicConfig {
  apiKey: string
  /** Default model, e.g. 'claude-opus-4-8'. */
  model?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

const DEFAULT_MODEL = 'claude-opus-4-8'

export class AnthropicAiProvider implements AiProvider {
  readonly id = 'anthropic'
  readonly local = false
  private readonly cfg: Required<Omit<AnthropicConfig, 'fetchImpl'>> & { fetchImpl: typeof fetch }

  constructor(cfg: AnthropicConfig) {
    this.cfg = {
      apiKey: cfg.apiKey,
      model: cfg.model ?? DEFAULT_MODEL,
      baseUrl: (cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, ''),
      fetchImpl: cfg.fetchImpl ?? fetch,
    }
  }

  async capabilities(): Promise<AiCapabilities> {
    return { available: Boolean(this.cfg.apiKey), tools: true, models: [this.cfg.model] }
  }

  async *chat(req: AiChatRequest, signal?: AbortSignal): AsyncIterable<AiChatChunk> {
    const system = req.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
    const body: Record<string, unknown> = {
      model: req.model ?? this.cfg.model,
      max_tokens: 4096,
      stream: true,
      ...(system ? { system } : {}),
      messages: toAnthropicMessages(req),
    }
    if (req.tools?.length) {
      body['tools'] = req.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }))
    }

    let res: Response
    try {
      res = await this.cfg.fetchImpl(`${this.cfg.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      })
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : 'anthropic request failed' }
      return
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      yield { type: 'error', error: `anthropic ${res.status}: ${text || res.statusText}` }
      return
    }

    // SSE events: content_block_start (text | tool_use), content_block_delta
    // (text_delta | input_json_delta), content_block_stop, message_delta.
    // tool_use input arrives as partial JSON deltas — buffer per block index.
    const toolBlocks = new Map<number, { id: string; name: string; json: string }>()
    let sawToolCall = false

    for await (const data of sseData(res.body)) {
      let ev: any
      try {
        ev = JSON.parse(data)
      } catch {
        continue
      }
      switch (ev.type) {
        case 'content_block_start':
          if (ev.content_block?.type === 'tool_use') {
            toolBlocks.set(ev.index, { id: ev.content_block.id, name: ev.content_block.name, json: '' })
          }
          break
        case 'content_block_delta':
          if (ev.delta?.type === 'text_delta' && ev.delta.text) {
            yield { type: 'token', text: ev.delta.text }
          } else if (ev.delta?.type === 'input_json_delta') {
            const tb = toolBlocks.get(ev.index)
            if (tb) tb.json += ev.delta.partial_json ?? ''
          }
          break
        case 'content_block_stop': {
          const tb = toolBlocks.get(ev.index)
          if (tb) {
            toolBlocks.delete(ev.index)
            sawToolCall = true
            let args: Record<string, unknown> = {}
            try {
              args = tb.json ? JSON.parse(tb.json) : {}
            } catch {
              /* malformed args → empty object; the tool executor reports it */
            }
            yield { type: 'tool_call', toolCall: { id: tb.id, name: tb.name, arguments: args } }
          }
          break
        }
        case 'error':
          yield { type: 'error', error: ev.error?.message ?? 'anthropic stream error' }
          return
      }
    }
    yield { type: 'done', stopReason: sawToolCall ? 'tool_calls' : 'end' }
  }
}

// Anthropic wants tool results as user-turn tool_result blocks and assistant
// tool calls as tool_use content blocks. Consecutive tool results merge into
// one user turn.
function toAnthropicMessages(req: AiChatRequest): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const m of req.messages) {
    if (m.role === 'system') continue // hoisted to top-level `system`
    if (m.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content,
      }
      const last = out[out.length - 1]
      if (last && last['role'] === 'user' && Array.isArray(last['content'])) {
        ;(last['content'] as unknown[]).push(block)
      } else {
        out.push({ role: 'user', content: [block] })
      }
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.toolCalls.map(tc => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments })),
        ],
      })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}
