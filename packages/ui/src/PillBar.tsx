import type React from 'react'

// PillBar — right-aligned action groups rendered as connected pills with rounded
// OUTER corners (segmented-control look). A group is either:
//   - 'radio'   → single-select, like a radio button (the view switcher)
//   - 'buttons' → independent actions, each with its own onClick callback
// Generic and module-agnostic: any surface (inventory header, a toolbar) composes
// its own groups. Theme-driven via CSS vars, like every component here.

export interface PillOption {
  id: string
  label?: string
  icon?: string
  title?: string
  disabled?: boolean
}

export type PillGroupSpec =
  | {
      kind: 'radio'
      options: PillOption[]
      value: string
      onChange: (id: string) => void
    }
  | {
      kind: 'buttons'
      options: Array<PillOption & { onClick: () => void; active?: boolean }>
    }

export interface PillBarProps {
  groups: PillGroupSpec[]
  align?: 'left' | 'right'
  style?: React.CSSProperties
  className?: string
}

// Outer corner rounding: first pill rounds its left, last rounds its right, the
// rest stay square so the group reads as one rounded capsule.
function corner(i: number, count: number): React.CSSProperties {
  const r = 'var(--radius, 8px)'
  return {
    borderTopLeftRadius: i === 0 ? r : 0,
    borderBottomLeftRadius: i === 0 ? r : 0,
    borderTopRightRadius: i === count - 1 ? r : 0,
    borderBottomRightRadius: i === count - 1 ? r : 0,
  }
}

function pillStyle(active: boolean, i: number, count: number, disabled?: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
    border: '1px solid var(--border)',
    // collapse the shared edge between adjacent pills
    marginLeft: i === 0 ? 0 : -1,
    background: active ? 'var(--primary, var(--fg))' : 'var(--bg-elevated)',
    color: active ? 'var(--primary-fg, var(--bg))' : 'var(--fg-dim)',
    transition: 'background 0.1s, color 0.1s',
    ...corner(i, count),
    // active pill sits above its neighbours so its full border shows
    position: 'relative',
    zIndex: active ? 1 : 0,
  }
}

function PillGroup({ group }: { group: PillGroupSpec }) {
  const opts = group.options
  return (
    <div style={{ display: 'inline-flex' }}>
      {opts.map((opt, i) => {
        const active =
          group.kind === 'radio' ? group.value === opt.id : Boolean((opt as { active?: boolean }).active)
        return (
          <button
            key={opt.id}
            type="button"
            title={opt.title ?? opt.label}
            disabled={opt.disabled}
            onClick={() => {
              if (opt.disabled) return
              if (group.kind === 'radio') group.onChange(opt.id)
              else (opt as { onClick: () => void }).onClick()
            }}
            style={pillStyle(active, i, opts.length, opt.disabled)}
          >
            {opt.icon && <span style={{ fontSize: 13 }}>{opt.icon}</span>}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function PillBar({ groups, align = 'right', style, className }: PillBarProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        ...style,
      }}
    >
      {groups.map((g, i) => (
        <PillGroup key={i} group={g} />
      ))}
    </div>
  )
}
