import { useEffect, useRef } from 'react'
import type { AppContentProvider } from '@/types/navigation'
import { useNavigation } from '@/stores/navigationStore'
import { GenericColumn } from './GenericColumn'

interface Props {
  provider: AppContentProvider
}

export function GenericColumnView({ provider }: Props) {
  const stack = useNavigation((s) => s.stack)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [stack.length])

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 overflow-x-auto"
      style={{ background: 'var(--bg-panel)' }}
    >
      {stack.map((node) => (
        <GenericColumn key={node.id} nodeId={node.id} provider={provider} />
      ))}
    </div>
  )
}
