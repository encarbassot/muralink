// Mock — offline, deterministic, no network. Streams a canned reply word by
// word so the whole chat pipeline (NDJSON transport, UI streaming caret) can be
// exercised with nothing installed. The payments-Mock parallel: dev fallback,
// never the product.

import type { AiCapabilities, AiChatChunk, AiChatRequest, AiProvider } from './index'

export interface MockAiConfig {
  /** Canned reply; the last user message is echoed after it. */
  reply?: string
}

export class MockAiProvider implements AiProvider {
  readonly id = 'mock'
  readonly local = true
  private reply: string

  constructor(cfg: MockAiConfig = {}) {
    this.reply =
      cfg.reply ??
      'Soy el proveedor de prueba de Muralink (sin IA real). Configura Ollama o una API key para respuestas de verdad. Me has dicho:'
  }

  async capabilities(): Promise<AiCapabilities> {
    return { available: true, tools: false, models: ['mock'] }
  }

  async *chat(req: AiChatRequest, signal?: AbortSignal): AsyncIterable<AiChatChunk> {
    const lastUser = [...req.messages].reverse().find(m => m.role === 'user')
    const text = `${this.reply} "${lastUser?.content ?? ''}"`
    for (const word of text.split(' ')) {
      if (signal?.aborted) return
      yield { type: 'token', text: word + ' ' }
    }
    yield { type: 'done', stopReason: 'end' }
  }
}
