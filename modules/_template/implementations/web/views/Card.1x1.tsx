// OPTIONAL — delete if unused. A view named [Name].[size].tsx.
// Reads its data from ModuleContext.storage; never knows which platform mounts it.

import type { ModuleContext } from '@muralink/types'

interface CardProps {
  context: ModuleContext
  instanceId: string
}

export function Card({ context, instanceId }: CardProps) {
  // context.storage is offline-first local storage.
  // context.aiProvider gates any optional LLM call ('platform' | 'ollama' | 'none').
  void context
  return <div className="template-card">template · {instanceId}</div>
}
