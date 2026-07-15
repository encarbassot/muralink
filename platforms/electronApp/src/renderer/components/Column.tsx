// One Miller column: lists a directory, owns its own load + the per-row ops
// (rename inline, new folder, copy/paste, move-to-trash, drag-move). Navigation
// (drilling, preview, clipboard) lives in the store.

import { useEffect, useRef, useState } from 'react'
import type { DirEntry } from '@/shared/fsApi'
import { useExplorer } from '@/stores/explorerStore'
import { basename } from '@/lib/format'
import { DirEntryRow } from './DirEntryRow'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { ShareDialog } from './ShareDialog'
import { TunnelLoginDialog } from './TunnelLoginDialog'

interface ColumnProps {
  colIndex: number
  dirPath: string
}

interface Menu {
  x: number
  y: number
  entry: DirEntry | null // null = empty-area menu (background)
  shift: boolean
}

export function Column({ colIndex, dirPath }: ColumnProps) {
  const refreshToken = useExplorer((s) => s.refreshToken)
  const selectedChild = useExplorer((s) => s.selectedByCol[dirPath])
  const clipboard = useExplorer((s) => s.clipboard)
  const pinnedFolders = useExplorer((s) => s.pinnedFolders)
  const starredFolders = useExplorer((s) => s.starredFolders)
  const { selectEntry, copyToClipboard, rename, mkdir, trash, pasteInto, moveInto, pinFolder, unpinFolder, starFolder, unstarFolder } = useExplorer()

  const [entries, setEntries] = useState<DirEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [menu, setMenu] = useState<Menu | null>(null)
  const [shareTarget, setShareTarget] = useState<string | null>(null)
  const [pendingSharePath, setPendingSharePath] = useState<string | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const newInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    window.fsApi
      .listDir(dirPath)
      .then((list) => alive && (setEntries(list), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [dirPath, refreshToken])

  useEffect(() => {
    if (creating) newInputRef.current?.focus()
  }, [creating])

  function startRename(entry: DirEntry) {
    setRenaming(entry.path)
    setRenameValue(entry.name)
  }

  async function commitRename(entry: DirEntry) {
    const next = renameValue.trim()
    setRenaming(null)
    if (next && next !== entry.name) await rename(entry.path, next)
  }

  async function commitNewFolder() {
    const name = newName.trim()
    setCreating(false)
    setNewName('')
    if (name) await mkdir(dirPath, name)
  }

  function askTrash(entry: DirEntry, shift: boolean) {
    if (shift || window.confirm(`Move "${entry.name}" to Trash?`)) void trash(entry.path)
  }

  async function openShare(path: string) {
    const loggedIn = await window.tunnelApi.isLoggedIn()
    if (loggedIn) {
      setShareTarget(path)
    } else {
      setPendingSharePath(path)
      setShowLogin(true)
    }
  }

  function rowMenuItems(entry: DirEntry, shift: boolean): MenuItem[] {
    const isPinned = entry.isDir && pinnedFolders.includes(entry.path)
    const isStarred = starredFolders.includes(entry.path)
    return [
      { label: entry.isDir ? 'Open' : 'Preview', onClick: () => selectEntry(colIndex, entry) },
      { label: 'Rename', onClick: () => startRename(entry) },
      { label: 'Copy', onClick: () => copyToClipboard(entry.path) },
      {
        label: clipboard ? `Paste "${basename(clipboard.path)}"` : 'Paste',
        disabled: !clipboard,
        onClick: () => void pasteInto(entry.isDir ? entry.path : dirPath),
      },
      { label: 'New Folder', onClick: () => setCreating(true) },
      {
        label: isStarred ? 'Unstar' : 'Star',
        onClick: () => isStarred ? unstarFolder(entry.path) : starFolder(entry.path),
      },
      ...(entry.isDir ? [
        {
          label: isPinned ? 'Unpin from dock' : 'Pin to dock',
          onClick: () => isPinned ? unpinFolder(entry.path) : pinFolder(entry.path),
        },
        {
          label: 'Share folder…',
          onClick: () => void openShare(entry.path),
        },
      ] : []),
      { label: 'Move to Trash', danger: true, onClick: () => askTrash(entry, shift) },
    ]
  }

  function bgMenuItems(): MenuItem[] {
    return [
      { label: 'New Folder', onClick: () => setCreating(true) },
      {
        label: clipboard ? `Paste "${basename(clipboard.path)}"` : 'Paste',
        disabled: !clipboard,
        onClick: () => void pasteInto(dirPath),
      },
    ]
  }

  return (
    <div
      className="flex h-full shrink-0 flex-col border-r"
      style={{ width: 'var(--col-w)', background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
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
      <div
        className="truncate border-b px-2 py-1 text-[11px] uppercase tracking-wide"
        style={{ color: 'var(--fg-faint)', borderColor: 'var(--border)' }}
      >
        {basename(dirPath)}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {error && <div className="px-2 py-1 text-[11px]" style={{ color: 'var(--sync-external-blocked, #d2554e)' }}>{error}</div>}
        {!error && entries.length === 0 && (
          <div className="px-2 py-1 text-[11px]" style={{ color: 'var(--fg-faint)' }}>empty</div>
        )}
        {entries.map((entry) => (
          <DirEntryRow
            key={entry.path}
            entry={entry}
            selected={selectedChild === entry.path}
            renaming={renaming === entry.path}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameCommit={() => void commitRename(entry)}
            onRenameCancel={() => setRenaming(null)}
            onClick={() => selectEntry(colIndex, entry)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.clientX, y: e.clientY, entry, shift: e.shiftKey })
            }}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', entry.path)}
            onDropOnFolder={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const src = e.dataTransfer.getData('text/plain')
              if (src && src !== entry.path) void moveInto(src, entry.path)
            }}
          />
        ))}

        {creating && (
          <div className="flex items-center gap-2 px-2" style={{ height: 'var(--row-h)' }}>
            <span className="text-[13px] leading-none">📁</span>
            <input
              ref={newInputRef}
              value={newName}
              placeholder="New folder"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitNewFolder()
                if (e.key === 'Escape') (setCreating(false), setNewName(''))
              }}
              onBlur={() => void commitNewFolder()}
              className="min-w-0 flex-1 rounded-sm px-1 text-[12px] outline-none"
              style={{ background: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--accent)' }}
            />
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.entry ? rowMenuItems(menu.entry, menu.shift) : bgMenuItems()}
          onClose={() => setMenu(null)}
        />
      )}

      {showLogin && (
        <TunnelLoginDialog
          onSuccess={() => {
            setShowLogin(false)
            if (pendingSharePath) {
              setShareTarget(pendingSharePath)
              setPendingSharePath(null)
            }
          }}
          onCancel={() => {
            setShowLogin(false)
            setPendingSharePath(null)
          }}
        />
      )}

      {shareTarget && (
        <ShareDialog
          path={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  )
}
