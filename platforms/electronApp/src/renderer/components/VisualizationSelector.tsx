// VisualizationSelector — buttons to switch between columns/grid/list views.
// Persists selection to localStorage.

import { useNavigation } from '@/stores/navigationStore'

type ViewMode = 'columns' | 'grid' | 'bento' | 'list'

interface ViewOption {
  mode: ViewMode
  label: string
  icon: string
  disabled: boolean
}

const options: ViewOption[] = [
  { mode: 'columns', label: 'Columns', icon: '⊟', disabled: false },
  { mode: 'grid', label: 'Grid', icon: '⊞', disabled: false },
  { mode: 'bento', label: 'Bento', icon: '⊛', disabled: false },
  { mode: 'list', label: 'List', icon: '☰', disabled: true },
]

export function VisualizationSelector() {
  const viewMode = useNavigation((s) => s.viewMode)
  const setViewMode = useNavigation((s) => s.setViewMode)

  return (
    <div className="flex items-center gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.mode}
          onClick={() => !opt.disabled && setViewMode(opt.mode as 'columns' | 'grid' | 'bento')}
          disabled={opt.disabled}
          title={opt.label}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            opt.disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-blue-500/20'
          }`}
          style={{
            background: !opt.disabled && viewMode === opt.mode ? 'var(--accent)' : undefined,
            color: opt.disabled ? 'var(--fg-faint)' : 'var(--fg-dim)',
            opacity: opt.disabled ? 0.5 : 1,
            fontSize: 12,
          }}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  )
}
