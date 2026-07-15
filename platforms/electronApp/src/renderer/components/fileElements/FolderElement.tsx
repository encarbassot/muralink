import { useExplorer } from '@/stores/explorerStore'
import type { FileElementProps } from '@/types/fileElement'

export function FolderElement({ item, selected, onClick, onContextMenu }: FileElementProps) {
  const pinnedFolders = useExplorer((s) => s.pinnedFolders)
  const starredFolders = useExplorer((s) => s.starredFolders)

  const isPinned = pinnedFolders.includes(item.id)
  const isStarred = starredFolders.includes(item.id)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 12,
        background: 'var(--bg-elevated)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        overflow: 'hidden',
        boxSizing: 'border-box',
        position: 'relative',
        transition: 'border-color 0.1s',
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={item.id}
    >
      {(isPinned || isStarred) && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            gap: 2,
            fontSize: 10,
          }}
        >
          {isStarred && <span title="Starred">★</span>}
          {isPinned && <span title="Pinned">📌</span>}
        </div>
      )}
      <span style={{ fontSize: 44, lineHeight: 1 }}>📁</span>
      <span
        style={{
          fontSize: 11,
          color: 'var(--fg-dim)',
          textAlign: 'center',
          width: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
      </span>
    </div>
  )
}
