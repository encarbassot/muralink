// Inline-tool fallback for models without native tool calling (small Ollama
// models). Protocol: the system prompt instructs the model to emit exactly one
// fenced ```json block { "tool": name, "arguments": {...} } when it wants a
// tool. The streaming parser withholds a suspected block from the token stream
// and emits it as a synthetic tool_call chunk instead. Best-effort by design:
// an unparseable block is released back as plain text, never an error.

import type { AiChatChunk, AiToolCall, AiToolSpec } from './index'

export function buildInlineToolPrompt(tools: AiToolSpec[]): string {
  const list = tools
    .map(t => `- ${t.name}: ${t.description}\n  arguments (JSON Schema): ${JSON.stringify(t.parameters)}`)
    .join('\n')
  return [
    'You can use tools. To call one, reply with ONLY a fenced json block, nothing else:',
    '```json',
    '{ "tool": "<name>", "arguments": { ... } }',
    '```',
    'One tool call per reply. After you receive the tool result, continue normally.',
    'Available tools:',
    list,
  ].join('\n')
}

const FENCE = '```'

export interface InlineToolParser {
  /** Feed a raw token; returns chunks safe to forward downstream. */
  push(text: string): AiChatChunk[]
  /** Stream ended; flush whatever is buffered (text or a parsed call). */
  flush(): AiChatChunk[]
  /** True if at least one tool_call was emitted. */
  sawToolCall(): boolean
}

export function createInlineToolParser(newId: () => string = mkIdFactory()): InlineToolParser {
  // Modes: 'text' → passing through, watching for a fence opener;
  // 'buffering' → inside a suspected tool block, withholding output.
  let mode: 'text' | 'buffering' = 'text'
  let pending = '' // tail kept back in text mode (a fence may split across tokens)
  let buffer = '' // block contents while buffering
  let emitted = false

  function tryParse(raw: string): AiToolCall | null {
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj.tool === 'string' && obj.arguments && typeof obj.arguments === 'object') {
        return { id: newId(), name: obj.tool, arguments: obj.arguments as Record<string, unknown> }
      }
    } catch {
      /* not a tool block */
    }
    return null
  }

  return {
    push(text: string): AiChatChunk[] {
      const out: AiChatChunk[] = []
      pending += text

      while (pending.length > 0) {
        if (mode === 'text') {
          const at = pending.indexOf(FENCE)
          if (at === -1) {
            // Keep a short tail in case a fence is split across tokens.
            const safe = pending.slice(0, Math.max(0, pending.length - (FENCE.length - 1)))
            if (safe) out.push({ type: 'token', text: safe })
            pending = pending.slice(safe.length)
            break
          }
          const before = pending.slice(0, at)
          if (before) out.push({ type: 'token', text: before })
          pending = pending.slice(at + FENCE.length)
          // Swallow an optional "json" language tag right after the fence.
          pending = pending.replace(/^json/, '')
          mode = 'buffering'
          buffer = ''
        } else {
          const at = pending.indexOf(FENCE)
          if (at === -1) {
            buffer += pending
            pending = ''
            break
          }
          buffer += pending.slice(0, at)
          pending = pending.slice(at + FENCE.length)
          mode = 'text'
          const call = tryParse(buffer.trim())
          if (call) {
            emitted = true
            out.push({ type: 'tool_call', toolCall: call })
          } else {
            // Not a tool block after all — release it verbatim, fences included.
            out.push({ type: 'token', text: FENCE + buffer + FENCE })
          }
          buffer = ''
        }
      }
      return out
    },

    flush(): AiChatChunk[] {
      const out: AiChatChunk[] = []
      if (mode === 'buffering') {
        // Unterminated block: models often skip the closing fence.
        const call = tryParse((buffer + pending).trim())
        if (call) {
          emitted = true
          out.push({ type: 'tool_call', toolCall: call })
        } else if (buffer + pending) {
          out.push({ type: 'token', text: FENCE + buffer + pending })
        }
      } else if (pending) {
        out.push({ type: 'token', text: pending })
      }
      mode = 'text'
      pending = ''
      buffer = ''
      return out
    },

    sawToolCall(): boolean {
      return emitted
    },
  }
}

// Injected-free id factory (no Math.random/Date at import — see payments Mock).
function mkIdFactory(): () => string {
  let seq = 0
  return () => `inline_${++seq}`
}
