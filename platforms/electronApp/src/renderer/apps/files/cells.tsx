import type { CellProps } from '@/types/navigation'
import { useExplorer } from '@/stores/explorerStore'

export function FolderCell({ item, zoom, selected, onClick, onContextMenu, onDragStart, onDrop }: CellProps) {
  const pinnedFolders = useExplorer((s) => s.pinnedFolders)
  const starredFolders = useExplorer((s) => s.starredFolders)

  return (
    <div
      className="flex flex-col items-center gap-1 rounded px-1 py-2 transition-colors hover:bg-blue-500/10 relative group"
      style={{ cursor: 'pointer', background: selected ? 'var(--accent-dim)' : undefined }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
      title={item.id}
    >
      {zoom > 5 && (
        <div className="absolute top-1 left-1 flex gap-0.5 rounded-sm bg-black/40 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {starredFolders.includes(item.id) && (
            <span className="px-1 text-[10px]" style={{ color: 'gold' }}>★</span>
          )}
          {pinnedFolders.includes(item.id) && (
            <span className="px-1 text-[10px]">📌</span>
          )}
        </div>
      )}
      <div
        className="flex items-center justify-center rounded"
        style={{
          width: 48 + zoom * 16,
          height: 48 + zoom * 16,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          fontSize: 16 + zoom * 4,
        }}
      >
        📁
      </div>
      <div
        className="w-full truncate text-center"
        style={{ color: 'var(--fg-dim)', fontSize: 10 + zoom }}
      >
        {item.label}
      </div>
    </div>
  )
}

export function FileCell({ item, zoom, selected, onClick, onContextMenu, onDragStart }: CellProps) {
  const ext = (item.meta?.ext as string) ?? ''

  return (
    <div
      className="flex flex-col items-center gap-1 rounded px-1 py-2 transition-colors hover:bg-blue-500/10"
      style={{ cursor: 'pointer', background: selected ? 'var(--accent-dim)' : undefined }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      title={item.id}
    >
      <div
        className="flex items-center justify-center rounded"
        style={{
          width: 48 + zoom * 16,
          height: 48 + zoom * 16,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          fontSize: 16 + zoom * 4,
        }}
      >
        {ext ? '📄' : '❓'}
      </div>
      <div
        className="w-full truncate text-center"
        style={{ color: 'var(--fg-dim)', fontSize: 10 + zoom }}
      >
        {item.label}
      </div>
    </div>
  )
}
