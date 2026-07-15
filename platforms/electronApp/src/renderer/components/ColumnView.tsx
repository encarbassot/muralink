// The horizontal strip of Miller columns + the preview pane (when a file is
// selected). Auto-scrolls to the right whenever the stack grows.

import { useEffect, useRef } from 'react'
import { useExplorer } from '@/stores/explorerStore'
import { Column } from './Column'
import { PreviewPane } from './PreviewPane'

export function ColumnView() {
  const columns = useExplorer((s) => s.columns)
  const previewPath = useExplorer((s) => s.previewPath)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [columns.length, previewPath])

  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 overflow-x-auto">
      {columns.map((dirPath, i) => (
        <Column key={dirPath} colIndex={i} dirPath={dirPath} />
      ))}
      {previewPath && <PreviewPane path={previewPath} />}
    </div>
  )
}
