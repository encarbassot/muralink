// PathBreadcrumb — shows path as bubbles (clickable) or text. Toggle on click.

import { useExplorer } from '@/stores/explorerStore'
import { basename } from '@/lib/format'

export function PathBreadcrumb({ path }: { path: string }) {
  const pathViewMode = useExplorer((s) => s.pathViewMode)
  const togglePathViewMode = useExplorer((s) => s.togglePathViewMode)
  const navigateTo = useExplorer((s) => s.navigateTo)

  if (!path) return null

  if (pathViewMode === 'text') {
    return (
      <span
        className="truncate text-[12px] cursor-pointer hover:opacity-80 transition-opacity"
        onClick={togglePathViewMode}
        title="Click to view as bubbles"
        style={{ color: 'var(--fg-dim)' }}
      >
        {path}
      </span>
    )
  }

  // Bubble view
  const parts = path.split('/').filter(Boolean)
  const home = parts[0] || path

  return (
    <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
      <button
        onClick={() => navigateTo('/' + home)}
        className="shrink-0 px-1.5 py-0.5 rounded-full text-[11px] transition-opacity hover:opacity-80"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--fg-dim)',
        }}
      >
        {home}
      </button>

      {parts.slice(1).map((part, i) => {
        const fullPath = '/' + parts.slice(0, i + 2).join('/')
        return (
          <div key={fullPath} className="flex items-center gap-1 shrink-0">
            <span style={{ color: 'var(--border)', fontSize: 10 }}>/</span>
            <button
              onClick={() => navigateTo(fullPath)}
              className="shrink-0 px-1.5 py-0.5 rounded-full text-[11px] transition-opacity hover:opacity-80"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--fg-dim)',
              }}
            >
              {part}
            </button>
          </div>
        )
      })}
    </div>
  )
}
