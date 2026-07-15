// GridView — icon grid view showing current directory contents.
// Similar ops to ColumnView but arranged in a grid instead of Miller columns.

import { useEffect, useState } from 'react'
import type { DirEntry } from '@/shared/fsApi'
import { useExplorer } from '@/stores/explorerStore'
import { basename } from '@/lib/format'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { ZoomPicker } from './ZoomPicker'

interface Menu {
  x: number
  y: number
  entry: DirEntry | null
  shift: boolean
}

export function GridView() {
  const columns = useExplorer((s) => s.columns)
  const previewPath = useExplorer((s) => s.previewPath)
  const refreshToken = useExplorer((s) => s.refreshToken)
  const clipboard = useExplorer((s) => s.clipboard)
  const pinnedFolders = useExplorer((s) => s.pinnedFolders)
  const starredFolders = useExplorer((s) => s.starredFolders)
  const gridZoom = useExplorer((s) => s.gridZoom)
  const { selectEntry, copyToClipboard, rename, mkdir, trash, pasteInto, moveInto, pinFolder, unpinFolder, starFolder, unstarFolder } = useExplorer()

  const dirPath = columns[columns.length - 1]
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [menu, setMenu] = useState<Menu | null>(null)

  useEffect(() => {
    let alive = true
    if (!dirPath) return
    window.fsApi
      .listDir(dirPath)
      .then((list) => alive && (setEntries(list), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [dirPath, refreshToken])

  function startRename(entry: DirEntry) {
    setRenaming(entry.path)
    setRenameValue(entry.name)
  }

  async function commitRename(entry: DirEntry) {
    const next = renameValue.trim()
    setRenaming(null)
    if (next && next !== entry.name) await rename(entry.path, next)
  }

  function askTrash(entry: DirEntry, shift: boolean) {
    if (shift || window.confirm(`Move "${entry.name}" to Trash?`)) void trash(entry.path)
  }

  function rowMenuItems(entry: DirEntry, shift: boolean): MenuItem[] {
    const isPinned = entry.isDir && pinnedFolders.includes(entry.path)
    return [
      { label: entry.isDir ? 'Open' : 'Preview', onClick: () => selectEntry(columns.length - 1, entry) },
      { label: 'Rename', onClick: () => startRename(entry) },
      { label: 'Copy', onClick: () => copyToClipboard(entry.path) },
      {
        label: clipboard ? `Paste "${basename(clipboard.path)}"` : 'Paste',
        disabled: !clipboard,
        onClick: () => void pasteInto(entry.isDir ? entry.path : dirPath),
      },
      ...(entry.isDir ? [{
        label: isPinned ? 'Unpin from dock' : 'Pin to dock',
        onClick: () => isPinned ? unpinFolder(entry.path) : pinFolder(entry.path),
      }] : []),
      { label: 'Move to Trash', danger: true, onClick: () => askTrash(entry, shift) },
    ]
  }

  if (!dirPath) return null

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto p-4 relative"
      style={{ background: 'var(--bg-panel)' }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, entry: null, shift: e.shiftKey })
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const src = e.dataTransfer.getData('text/plain')
        if (src) void moveInto(src, dirPath)
      }}
    >
      {error && (
        <div style={{ color: 'var(--sync-external-blocked, #d2554e)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {!error && entries.length === 0 && (
        <div style={{ color: 'var(--fg-faint)', fontSize: 12 }}>empty</div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${48 + gridZoom * 16}px, 1fr))` }}>
        {entries.map((entry) => (
          <div
            key={entry.path}
            className="flex flex-col items-center gap-1 rounded px-1 py-2 transition-colors hover:bg-blue-500/10 relative group"
            style={{ cursor: 'pointer' }}
            onClick={() => selectEntry(columns.length - 1, entry)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.clientX, y: e.clientY, entry, shift: e.shiftKey })
            }}
            onDoubleClick={() => {
              if (renaming === entry.path) commitRename(entry)
            }}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', entry.path)}
            onDragOver={(e) => {
              if (entry.isDir) e.preventDefault()
            }}
            onDrop={(e) => {
              if (!entry.isDir) return
              e.preventDefault()
              e.stopPropagation()
              const src = e.dataTransfer.getData('text/plain')
              if (src && src !== entry.path) void moveInto(src, entry.path)
            }}
            title={entry.path}
          >
            {gridZoom > 5 && (
              <div
                className="absolute top-1 left-1 flex gap-0.5 rounded-sm bg-black/40 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => starredFolders.includes(entry.path) ? unstarFolder(entry.path) : starFolder(entry.path)}
                  title={starredFolders.includes(entry.path) ? 'Unstar' : 'Star'}
                  className="px-1.5 py-0.5 rounded text-[10px] hover:bg-white/20"
                  style={{ color: 'white' }}
                >
                  {starredFolders.includes(entry.path) ? '★' : '✩'}
                </button>
                {entry.isDir && (
                  <button
                    onClick={() => pinnedFolders.includes(entry.path) ? unpinFolder(entry.path) : pinFolder(entry.path)}
                    title={pinnedFolders.includes(entry.path) ? 'Unpin' : 'Pin'}
                    disabled={pinnedFolders.length >= 10 && !pinnedFolders.includes(entry.path)}
                    className={`px-1.5 py-0.5 rounded text-[10px] hover:bg-white/20 ${pinnedFolders.length >= 10 && !pinnedFolders.includes(entry.path) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{ color: 'white' }}
                  >
                    {pinnedFolders.includes(entry.path) ? '📌' : '📍'}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    setMenu({ x: e.clientX, y: e.clientY, entry, shift: false })
                  }}
                  title="More"
                  className="px-1.5 py-0.5 rounded text-[10px] hover:bg-white/20"
                  style={{ color: 'white' }}
                >
                  ⋯
                </button>
              </div>
            )}

            <div
              className="flex items-center justify-center rounded"
              style={{
                width: 48 + gridZoom * 16,
                height: 48 + gridZoom * 16,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                fontSize: 16 + gridZoom * 4,
              }}
            >
              {entry.isDir ? '📁' : entry.ext ? '📄' : '❓'}
            </div>

            {renaming === entry.path ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename(entry)
                  if (e.key === 'Escape') setRenaming(null)
                }}
                onBlur={() => void commitRename(entry)}
                className="w-full truncate rounded-sm px-1 text-[10px] outline-none"
                style={{ background: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--accent)' }}
              />
            ) : (
              <div
                className="w-full truncate text-center"
                style={{ color: 'var(--fg-dim)', fontSize: 10 + gridZoom }}
              >
                {entry.name}
              </div>
            )}
          </div>
        ))}
      </div>

      <ZoomPicker />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.entry ? rowMenuItems(menu.entry, menu.shift) : []}
          onClose={() => setMenu(null)}
        />
      )}

      {previewPath && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            right: 0,
            width: 300,
            height: 300,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            margin: 16,
            padding: 8,
            zIndex: 10,
            overflow: 'auto',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
            Preview: {basename(previewPath)}
          </div>
        </div>
      )}
    </div>
  )
}
