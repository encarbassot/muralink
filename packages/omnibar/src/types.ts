import type { ReactNode } from 'react'

/**
 * Where the omnibar was invoked from — captured by the host, not by the core.
 * The core is platform-agnostic: it never reads window/chrome/selection itself,
 * it only renders the context the host hands it.
 */
export interface OmnibarContext {
  /** Text preloaded from the invocation site (a selection, a note body, …). */
  text?: string
  /** What produced the context, for the label + styling of the context section. */
  source: 'selection' | 'note' | 'input' | 'slot' | 'none'
  /** Optional human label for the source (e.g. a note title). */
  label?: string
}

/** Props every module receives to render its body. */
export interface ModuleRenderProps {
  query: string
  context?: OmnibarContext
  /** Deliver a result back to the host (host decides: clipboard, inject, …). */
  onInject: (value: string) => void
  onClose: () => void
}

/**
 * A pluggable omnibar module (translate, math, …). Ported/trimmed from the
 * extension's `OmnibarPlugin` — no history/tts coupling.
 */
export interface OmnibarModule {
  id: string
  icon: string
  label: string
  desc: string

  /**
   * 0   = no match
   * 1   = definite match (explicit prefix)
   * 0–1 = auto-detected confidence
   */
  match(query: string): number

  /**
   * Query to set when activated from a command/shortcut. Return null for
   * fullscreen modules (translate) — they take over the UI with no prefix.
   */
  getActivationQuery(context?: OmnibarContext): string | null

  /**
   * 'normal'     — render below the input row.
   * 'fullscreen' — replace the entire modal body.
   */
  layout?: 'normal' | 'fullscreen'

  render(props: ModuleRenderProps): ReactNode

  /** Optional: intercept Enter while this module is active. */
  handleEnter?(query: string, props: ModuleRenderProps): void
}

/** Highest-scoring module for the current query, or null. Port of getActivePlugin. */
export function getActiveModule(modules: OmnibarModule[], query: string): OmnibarModule | null {
  let best: OmnibarModule | null = null
  let bestScore = 0
  for (const m of modules) {
    const score = m.match(query)
    if (score > bestScore) {
      bestScore = score
      best = m
    }
  }
  return best
}
