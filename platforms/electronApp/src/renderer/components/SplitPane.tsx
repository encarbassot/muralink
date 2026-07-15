import { useRef, useCallback, useState } from 'react'
import { useExplorer } from '@/stores/explorerStore'
import { Column } from './Column'
import { GridView } from './GridView'
import { PreviewPane } from './PreviewPane'

export function SplitPane() {
  const columns = useExplorer((s) => s.columns)
  const previewPath = useExplorer((s) => s.previewPath)
  const rightViewMode = useExplorer((s) => s.rightViewMode)
  const setRightViewMode = useExplorer((s) => s.setRightViewMode)

  const parentIdx = Math.max(0, columns.length - 2)
  const currentIdx = columns.length - 1
  const parentPath = columns[parentIdx]
  const currentPath = columns[currentIdx]

  const [splitRatio, setSplitRatio] = useState(() =>
    parseFloat(localStorage.getItem('splitRatio') ?? '0.5')
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const startX = e.clientX
    const startRatio = splitRatio
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - startX
      const next = Math.max(0.2, Math.min(0.8, startRatio + delta / rect.width))
      setSplitRatio(next)
      localStorage.setItem('splitRatio', String(next))
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [splitRatio])

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1" style={{ gap: 'var(--bento-gap)' }}>
      {/* Left pane */}
      <div
        className="flex min-w-0 flex-col overflow-hidden"
        style={{
          width: `${splitRatio * 100}%`,
          borderRadius: 'var(--bento-radius)',
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}
      >
        {parentPath && <Column colIndex={parentIdx} dirPath={parentPath} />}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 6,
          cursor: 'col-resize',
          marginLeft: -3,
          marginRight: -3,
          zIndex: 10,
        }}
      >
        <div
          className="rounded-full transition-colors"
          style={{ width: 3, height: 32, background: 'var(--border)' }}
        />
      </div>

      {/* Right pane */}
      <div
        className="flex min-w-0 flex-col overflow-hidden"
        style={{
          width: `${(1 - splitRatio) * 100}%`,
          borderRadius: 'var(--bento-radius)',
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}
      >
        {previewPath ? (
          <PreviewPane path={previewPath} />
        ) : currentPath ? (
          <>
            <div
              className="flex shrink-0 items-center gap-1 border-b px-2"
              style={{
                height: 28,
                background: 'var(--bg-bar)',
                borderColor: 'var(--border)',
              }}
            >
              <button
                onClick={() => setRightViewMode('columns')}
                title="List"
                className="flex h-5 w-5 items-center justify-center rounded text-[9px]"
                style={{
                  background: rightViewMode === 'columns' ? 'var(--accent)' : undefined,
                  color: 'var(--fg-dim)',
                }}
              >
                ⊟
              </button>
              <button
                onClick={() => setRightViewMode('grid')}
                title="Grid"
                className="flex h-5 w-5 items-center justify-center rounded text-[9px]"
                style={{
                  background: rightViewMode === 'grid' ? 'var(--accent)' : undefined,
                  color: 'var(--fg-dim)',
                }}
              >
                ⊞
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {rightViewMode === 'columns' ? (
                <Column colIndex={currentIdx} dirPath={currentPath} />
              ) : (
                <GridView />
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
