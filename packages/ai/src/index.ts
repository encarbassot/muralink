// AI adapter. Every LLM call goes through the `AiProvider` seam so the concrete
// backend is swappable — a local Ollama today, Anthropic/OpenAI/Gemini when the
// server has a key, anything later. The interface, the offline Mock and the
// Ollama adapter live here (zero deps — Ollama is plain localhost HTTP, no key).
// Online adapters take an INJECTED { apiKey, fetchImpl } config, so this package
// never depends on a vendor SDK and a secret key only ever exists in server env.
// Local-first: with no provider reachable the Mock keeps the chat flow working.
//
// Any AI-capable code path must honor `ModuleContext.aiProvider` — never
// hardcode a backend (see packages/types/src/module.ts).

export type AiRole = 'system' | 'user' | 'assistant' | 'tool'

export interface AiToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AiMessage {
  role: AiRole
  content: string
  /** Assistant turns that requested tools carry the calls they made. */
  toolCalls?: AiToolCall[]
  /** Tool turns: which call this result answers. */
  toolCallId?: string
}

export interface AiToolSpec {
  name: string
  description: string
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>
}

export interface AiChatRequest {
  messages: AiMessage[]
  tools?: AiToolSpec[]
  /** Override the provider's configured model for this request. */
  model?: string
}

/** One NDJSON line of a streamed chat response — the wire protocol too. */
export type AiChatChunk =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; toolCall: AiToolCall }
  | { type: 'done'; stopReason: 'end' | 'tool_calls' }
  | { type: 'error'; error: string }

export interface AiCapabilities {
  /** Backend reachable right now (Ollama daemon up, key valid…). */
  available: boolean
  /** Native tool/function calling. When false, hosts fall back to inline tools. */
  tools: boolean
  models: string[]
}

/** The seam every LLM backend implements. Streaming-first. */
export interface AiProvider {
  readonly id: string
  /** True = works with no internet (ollama, mock). */
  readonly local: boolean
  capabilities(): Promise<AiCapabilities>
  chat(req: AiChatRequest, signal?: AbortSignal): AsyncIterable<AiChatChunk>
}

// A tiny registry so a host can pick the active provider by id, defaulting to
// the local chain (ollama, else mock) when nothing is configured — offline-first.
export class AiRegistry {
  private providers = new Map<string, AiProvider>()
  private defaultId?: string

  constructor(providers: AiProvider[] = [], defaultId?: string) {
    for (const p of providers) this.providers.set(p.id, p)
    this.defaultId = defaultId
  }

  register(p: AiProvider): void {
    this.providers.set(p.id, p)
  }

  get(id: string): AiProvider | undefined {
    return this.providers.get(id)
  }

  all(): AiProvider[] {
    return [...this.providers.values()]
  }

  /** The configured default id if registered, else ollama, else mock. */
  default(): AiProvider {
    return (
      (this.defaultId ? this.providers.get(this.defaultId) : undefined) ??
      this.providers.get('ollama') ??
      this.providers.get('mock') ??
      [...this.providers.values()][0]!
    )
  }
}

export { MockAiProvider, type MockAiConfig } from './mock'
export { OllamaAiProvider, type OllamaConfig } from './ollama'
export { buildInlineToolPrompt, createInlineToolParser } from './inlineTools'
export { AnthropicAiProvider, type AnthropicConfig } from './online/anthropic'
export { OpenAiAiProvider, type OpenAiConfig } from './online/openai'
export { GeminiAiProvider, type GeminiConfig } from './online/gemini'
