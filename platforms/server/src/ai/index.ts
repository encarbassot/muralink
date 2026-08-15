// AI router — the server side of the AI seam. Every LLM call goes through an
// AiProvider (see @muralink/ai), so the concrete backend is swappable. The
// server is a STATELESS proxy: it streams model output and stops when the
// model emits tool calls — the web client owns the agent loop and executes
// tools against its own local-first stores. No user data is read here.
//
// Local-first: Ollama (the user's own daemon) is the default; online providers
// (Anthropic/OpenAI/Gemini) register only when their ELIO_*_API_KEY env var is
// set — keys never reach the open-core client. Mock keeps the flow demo-able
// with nothing installed.
//
// Streaming transport: POST /chat responds `application/x-ndjson`, one JSON
// AiChatChunk per line. Chosen over WebSocket (chat is request→streamed
// response, no server push) and over native EventSource (can't POST a body or
// send a Bearer header). This is the repo's streaming-over-HTTP precedent.

import { Router } from 'express'
import {
  AiRegistry,
  MockAiProvider,
  OllamaAiProvider,
  AnthropicAiProvider,
  OpenAiAiProvider,
  GeminiAiProvider,
  type AiChatRequest,
} from '@muralink/ai'

/** Build the active registry from env. Mock is always present as a fallback. */
export function buildAiRegistry(): AiRegistry {
  const registry = new AiRegistry(
    [new MockAiProvider()],
    process.env['ELIO_AI_PROVIDER'], // default() falls back to ollama → mock
  )

  // Ollama is always registered — availability is dynamic (capabilities()
  // probes the daemon), so having it configured costs nothing when it's down.
  registry.register(
    new OllamaAiProvider({
      baseUrl: process.env['ELIO_OLLAMA_URL'] ?? 'http://localhost:11434',
      model: process.env['ELIO_OLLAMA_MODEL'] ?? 'qwen2.5:7b',
    }),
  )

  const anthropicKey = process.env['ELIO_ANTHROPIC_API_KEY']
  if (anthropicKey) {
    registry.register(
      new AnthropicAiProvider({
        apiKey: anthropicKey,
        ...(process.env['ELIO_ANTHROPIC_MODEL'] ? { model: process.env['ELIO_ANTHROPIC_MODEL'] } : {}),
      }),
    )
  }
  const openaiKey = process.env['ELIO_OPENAI_API_KEY']
  if (openaiKey) {
    registry.register(
      new OpenAiAiProvider({
        apiKey: openaiKey,
        ...(process.env['ELIO_OPENAI_MODEL'] ? { model: process.env['ELIO_OPENAI_MODEL'] } : {}),
      }),
    )
  }
  const geminiKey = process.env['ELIO_GEMINI_API_KEY']
  if (geminiKey) {
    registry.register(
      new GeminiAiProvider({
        apiKey: geminiKey,
        ...(process.env['ELIO_GEMINI_MODEL'] ? { model: process.env['ELIO_GEMINI_MODEL'] } : {}),
      }),
    )
  }
  return registry
}

export function createAiRouter(registry: AiRegistry): Router {
  const router = Router()

  // Availability + capability probe. The web app gates the chat bubble on
  // this: probe fails or available:false → bubble hidden entirely.
  router.get('/status', async (_req, res) => {
    const providers = await Promise.all(
      registry.all().map(async p => {
        const caps = await p.capabilities().catch(() => ({ available: false, tools: false, models: [] }))
        return { id: p.id, local: p.local, ...caps }
      }),
    )
    const def = registry.default()
    const defCaps = providers.find(p => p.id === def.id)
    // Mock keeps chat demo-able but is not "real AI available" — only count
    // a non-mock default (or any reachable non-mock provider) as available.
    const available =
      def.id !== 'mock'
        ? Boolean(defCaps?.available)
        : providers.some(p => p.id !== 'mock' && p.available)
    res.json({ available, default: def.id, providers })
  })

  // Streaming chat. Body: AiChatRequest & { provider?: string }. One NDJSON
  // line per AiChatChunk; the client aborts by closing the request.
  router.post('/chat', async (req, res) => {
    const body = req.body as AiChatRequest & { provider?: string }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: 'messages (AiMessage[]) required' })
      return
    }
    const provider = body.provider ? registry.get(body.provider) : registry.default()
    if (!provider) {
      res.status(400).json({ error: `unknown provider "${body.provider}"` })
      return
    }

    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Cache-Control', 'no-cache')
    // Nginx same-origin proxies buffer by default — disable for token streaming.
    res.setHeader('X-Accel-Buffering', 'no')

    const abort = new AbortController()
    // Abort upstream when the CLIENT disconnects. (req 'close' fires as soon
    // as the request body is consumed on modern Node — wrong signal here.)
    res.on('close', () => {
      if (!res.writableEnded) abort.abort()
    })

    try {
      for await (const chunk of provider.chat(body, abort.signal)) {
        if (res.writableEnded || abort.signal.aborted) break
        res.write(JSON.stringify(chunk) + '\n')
        ;(res as unknown as { flush?: () => void }).flush?.()
      }
    } catch (e) {
      if (!res.writableEnded) {
        res.write(
          JSON.stringify({ type: 'error', error: e instanceof Error ? e.message : 'chat failed' }) + '\n',
        )
      }
    }
    res.end()
  })

  return router
}
