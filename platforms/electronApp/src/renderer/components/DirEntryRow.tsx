// One row in a Miller column. Presentational: drilling/selection/ops logic
// lives in Column. Handles inline rename when `renaming` is true, and is a
// drag source (its path) + a drop target when it's a folder.

import type { DirEntry } from '@/shared/fsApi'
import { iconFor } from '@/lib/format'

interface DirEntryRowProps {
  entry: DirEntry
  selected: boolean
  renaming: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDropOnFolder: (e: React.DragEvent) => void
}

export function DirEntryRow({
  entry,
  selected,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onClick,
  onContextMenu,
  onDragStart,
  onDropOnFolder,
}: DirEntryRowProps) {
  return (
    <div
      draggable={!renaming}
      onDragStart={onDragStart}
      onDragOver={entry.isDir ? (e) => e.preventDefault() : undefined}
      onDrop={entry.isDir ? onDropOnFolder : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex cursor-default items-center gap-2 px-2"
      style={{
        height: 'var(--row-h)',
        background: selected ? 'var(--accent-dim)' : 'transparent',
        color: selected ? 'var(--fg)' : 'var(--fg-dim)',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = 'var(--bg-elevated)'
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span className="shrink-0 text-[13px] leading-none">{iconFor(entry.isDir, entry.ext)}</span>
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit()
            if (e.key === 'Escape') onRenameCancel()
          }}
          onBlur={onRenameCommit}
          className="min-w-0 flex-1 rounded-sm px-1 text-[12px] outline-none"
          style={{ background: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--accent)' }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[12px]">{entry.name}</span>
      )}
      {entry.isDir && !renaming && <span className="shrink-0 text-[11px] opacity-50">›</span>}
    </div>
  )
}
