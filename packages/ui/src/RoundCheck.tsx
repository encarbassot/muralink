// A round checkbox: like a radio button visually, but many can be on at once.
// SVG ring when unchecked → filled circle when checked, with an optional emoji
// icon centered on top (dimmed/grayscale while unchecked). Built for daily
// habit checks but generic — no habit semantics here.

import type { CSSProperties } from 'react'

export interface RoundCheckProps {
  checked: boolean
  onChange?: (next: boolean) => void
  /** Emoji centered inside the circle. */
  icon?: string
  /** Diameter in px. Default 32. */
  size?: number
  /** Fill color when checked. Default the accent token. */
  color?: string
  disabled?: boolean
  title?: string
  style?: CSSProperties
}

export function RoundCheck({ checked, onChange, icon, size = 32, color, disabled, title, style }: RoundCheckProps) {
  const fill = color ?? 'var(--accent, #6c8cff)'
  const interactive = !disabled && !!onChange
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={interactive ? (e) => { e.stopPropagation(); onChange!(!checked) } : undefined}
      style={{
        position: 'relative',
        width: size,
        height: size,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: interactive ? 'pointer' : 'default',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: 'block' }}>
        {checked ? (
          <circle cx="16" cy="16" r="15" fill={fill} />
        ) : (
          <circle cx="16" cy="16" r="14" fill="none" stroke="var(--border)" strokeWidth="2" />
        )}
      </svg>
      {icon && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.round(size * 0.5),
            lineHeight: 1,
            filter: checked ? 'none' : 'grayscale(1)',
            opacity: checked ? 1 : 0.45,
            pointerEvents: 'none',
          }}
        >
          {icon}
        </span>
      )}
    </button>
  )
}
