// Ollama — the local provider. Plain HTTP to the user's own daemon (default
// http://localhost:11434), no key, works fully offline. Streams NDJSON from
// POST /api/chat and translates it to AiChatChunk. Native tool calling is used
// when the configured model supports it (probed via /api/show); otherwise the
// host should fall back to inline tools (see inlineTools.ts) — this adapter
// also retries inline automatically on the "does not support tools" error.

import type { AiCapabilities, AiChatChunk, AiChatRequest, AiProvider } from './index'
import { buildInlineToolPrompt, createInlineToolParser } from './inlineTools'
import { streamLines } from './wire'

export interface OllamaConfig {
  /** Daemon base URL, e.g. http://localhost:11434 */
  baseUrl: string
  /** Default model, e.g. 'qwen2.5:7b' */
  model: string
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

interface OllamaStreamLine {
  message?: {
    content?: string
    tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]
  }
  done?: boolean
  error?: string
}

export class OllamaAiProvider implements AiProvider {
  readonly id = 'ollama'
  readonly local = true
  private readonly baseUrl: string
  private readonly model: string
  private readonly fetchImpl: typeof fetch
  private toolSeq = 0

  constructor(cfg: OllamaConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '')
    this.model = cfg.model
    this.fetchImpl = cfg.fetchImpl ?? fetch
  }

  async capabilities(): Promise<AiCapabilities> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(1500),
      })
      if (!res.ok) return { available: false, tools: false, models: [] }
      const data = (await res.json()) as { models?: { name: string }[] }
      const models = (data.models ?? []).map(m => m.name)
      return { available: true, tools: await this.modelSupportsTools(), models }
    } catch {
      return { available: false, tools: false, models: [] }
    }
  }

  private async modelSupportsTools(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model }),
        signal: AbortSignal.timeout(1500),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { capabilities?: string[] }
      return (data.capabilities ?? []).includes('tools')
    } catch {
      return false
    }
  }

  async *chat(req: AiChatRequest, signal?: AbortSignal): AsyncIterable<AiChatChunk> {
    try {
      yield* this.chatOnce(req, signal, false)
    } catch (e) {
      // Model without native tools → retry once with the inline protocol.
      if (req.tools?.length && e instanceof ToolsUnsupportedError) {
        yield* this.chatOnce(req, signal, true)
        return
      }
      yield { type: 'error', error: e instanceof Error ? e.message : 'ollama chat failed' }
    }
  }

  private async *chatOnce(
    req: AiChatRequest,
    signal: AbortSignal | undefined,
    inlineTools: boolean,
  ): AsyncIterable<AiChatChunk> {
    const messages = this.toOllamaMessages(req, inlineTools)
    const body: Record<string, unknown> = {
      model: req.model ?? this.model,
      messages,
      stream: true,
    }
    if (req.tools?.length && !inlineTools) {
      body['tools'] = req.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    }

    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      if (/does not support tools/i.test(text)) throw new ToolsUnsupportedError(text)
      throw new Error(`ollama ${res.status}: ${text || res.statusText}`)
    }

    const parser = inlineTools ? createInlineToolParser(() => `ollama_${++this.toolSeq}`) : null
    let sawToolCall = false

    for await (const line of streamLines(res.body)) {
      let parsed: OllamaStreamLine
      try {
        parsed = JSON.parse(line) as OllamaStreamLine
      } catch {
        continue
      }
      if (parsed.error) {
        if (/does not support tools/i.test(parsed.error)) throw new ToolsUnsupportedError(parsed.error)
        yield { type: 'error', error: parsed.error }
        return
      }
      for (const tc of parsed.message?.tool_calls ?? []) {
        sawToolCall = true
        yield {
          type: 'tool_call',
          toolCall: {
            id: `ollama_${++this.toolSeq}`,
            name: tc.function.name,
            arguments: tc.function.arguments ?? {},
          },
        }
      }
      const content = parsed.message?.content
      if (content) {
        if (parser) {
          for (const chunk of parser.push(content)) {
            if (chunk.type === 'tool_call') sawToolCall = true
            yield chunk
          }
        } else {
          yield { type: 'token', text: content }
        }
      }
      if (parsed.done) break
    }

    if (parser) {
      for (const chunk of parser.flush()) {
        if (chunk.type === 'tool_call') sawToolCall = true
        yield chunk
      }
    }
    yield { type: 'done', stopReason: sawToolCall ? 'tool_calls' : 'end' }
  }

  // Ollama has no separate tool-result role shape beyond `role:'tool'` and no
  // per-call ids; inline mode folds tool turns into plain user text instead.
  private toOllamaMessages(req: AiChatRequest, inlineTools: boolean): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = []
    if (inlineTools && req.tools?.length) {
      out.push({ role: 'system', content: buildInlineToolPrompt(req.tools) })
    }
    for (const m of req.messages) {
      if (inlineTools && m.role === 'tool') {
        out.push({ role: 'user', content: `Tool result (${m.toolCallId ?? 'call'}): ${m.content}` })
      } else if (m.role === 'assistant' && m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: m.content,
          tool_calls: m.toolCalls.map(tc => ({
            function: { name: tc.name, arguments: tc.arguments },
          })),
        })
      } else {
        out.push({ role: m.role, content: m.content })
      }
    }
    return out
  }
}

class ToolsUnsupportedError extends Error {}
