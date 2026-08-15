# @muralink/ai

AI provider adapter — the seam every LLM call in Muralink goes through, so the
concrete backend is swappable. Mirrors `@muralink/payments`: interface + offline
Mock in the open core, credentials only ever server-side.

## Providers

| id | class | local | needs | notes |
|---|---|---|---|---|
| `mock` | `MockAiProvider` | ✅ | nothing | streams a canned reply; keeps the flow demo-able offline |
| `ollama` | `OllamaAiProvider` | ✅ | an Ollama daemon | default backend; native tool calling when the model supports it, inline-JSON fallback otherwise |
| `anthropic` | `AnthropicAiProvider` | ❌ | API key | plain fetch, SSE; no SDK dep |
| `openai` | `OpenAiAiProvider` | ❌ | API key | plain fetch, SSE; no SDK dep |
| `gemini` | `GeminiAiProvider` | ❌ | API key | plain fetch, SSE; no SDK dep |

## Server env (platforms/server)

| var | default | effect |
|---|---|---|
| `ELIO_AI_PROVIDER` | `ollama` | default provider id (`AiRegistry.default()`; falls back ollama → mock) |
| `ELIO_OLLAMA_URL` | `http://localhost:11434` | Ollama daemon |
| `ELIO_OLLAMA_MODEL` | `qwen2.5:7b` | recommended tool-capable small models: `qwen2.5`, `llama3.1` |
| `ELIO_ANTHROPIC_API_KEY` / `ELIO_ANTHROPIC_MODEL` | — / `claude-opus-4-8` | presence of the key registers the provider |
| `ELIO_OPENAI_API_KEY` / `ELIO_OPENAI_MODEL` | — / `gpt-4o` | idem |
| `ELIO_GEMINI_API_KEY` / `ELIO_GEMINI_MODEL` | — / `gemini-2.0-flash` | idem |

Keys never reach the open-core client — the server (`platforms/server/src/ai/`)
builds the registry from env and exposes only:

- `GET /api/ai/status` — `{ available, default, providers[] }`. The web app
  gates the chat bubble on this.
- `POST /api/ai/chat` — body `AiChatRequest & { provider? }`; response is
  `application/x-ndjson`, one `AiChatChunk` per line
  (`token | tool_call | done | error`).

## Architecture notes

- **The server is a stateless proxy.** The web client owns the agent loop
  (`packages/app/src/chat/agentLoop.ts`): on `tool_calls` it executes tools
  against the browser's local-first stores (spaces layer) and re-POSTs the
  conversation. Contact data in IndexedDB never has to reach the server.
- **Streaming transport** is POST + NDJSON (not WebSocket — chat is
  request→streamed-response; not EventSource — it can't POST a body or send a
  Bearer header).
- **Tool fallback**: models without native tool calling get a system-prompt
  protocol (single fenced ```json block) parsed by `inlineTools.ts`; calls that
  don't parse are released as plain text — best-effort by design.
- Any AI-capable code path must honor `ModuleContext.aiProvider`
  (`packages/types/src/module.ts`) — never hardcode a backend.
