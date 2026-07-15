import { useMemo, useState } from 'react'
import type React from 'react'
import { ActionSlot } from './ActionSlot.tsx'
import { CenterField } from './CenterField.tsx'
import { InputProvider } from './InputContext.tsx'
import type { InputContextValue } from './InputContext.tsx'
import type { FieldAction, FieldOption, FieldType, PanelMode } from './types.ts'

export interface InputBarProps {
  // Central element behaviour.
  type?: FieldType
  value?: string // controlled
  defaultValue?: string // uncontrolled
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean

  // Options power the dropdown type and text-search suggestions.
  options?: FieldOption[]
  onSelect?: (option: FieldOption) => void

  // Edge button clusters. Each folds into a "+" menu past its max.
  leftActions?: FieldAction[]
  rightActions?: FieldAction[]
  maxLeft?: number
  maxRight?: number

  // Extra panels. `top` = calc results / log / above the bar.
  // `bottom` overrides the auto option-list under the bar.
  top?: React.ReactNode
  bottom?: React.ReactNode
  topMode?: PanelMode
  bottomMode?: PanelMode

  style?: React.CSSProperties
}

const panelBox: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius, 8px)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
  overflow: 'hidden',
}

// The mega input: a vertical column of [top] / [bar] / [bottom].
// The bar is a WhatsApp-style capsule with left + center + right zones.
export function InputBar({
  type = 'text',
  value,
  defaultValue = '',
  onChange,
  placeholder,
  disabled = false,
  options = [],
  onSelect,
  leftActions = [],
  rightActions = [],
  maxLeft = 3,
  maxRight = 3,
  top,
  bottom,
  topMode = 'absolute',
  bottomMode = 'absolute',
  style,
}: InputBarProps) {
  const isControlled = value !== undefined
  const [internal, setInternal] = useState(defaultValue)
  const current = isControlled ? value : internal

  const [panelOpen, setPanelOpen] = useState(false)

  const setValue = (next: string) => {
    if (!isControlled) setInternal(next)
    onChange?.(next)
  }

  const selectOption = (option: FieldOption) => {
    setValue(type === 'dropdown' ? option.value : option.label)
    onSelect?.(option)
    setPanelOpen(false)
  }

  // Text-type search filters the option list; dropdown shows the full list.
  const shownOptions = useMemo(() => {
    if (type === 'dropdown') return options
    const q = current.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, current, type])

  const ctx: InputContextValue = {
    type,
    value: current,
    setValue,
    panelOpen,
    setPanelOpen,
    options,
    selectOption,
    disabled,
  }

  const autoBottom =
    panelOpen && (options.length > 0) ? (
      <ul style={{ listStyle: 'none', margin: 0, padding: 4, maxHeight: 240, overflowY: 'auto' }}>
        {shownOptions.length === 0 && (
          <li style={{ padding: '8px 10px', color: 'var(--muted-fg)', fontSize: 13 }}>
            No matches
          </li>
        )}
        {shownOptions.map((option) => (
          <li key={option.value}>
            <button
              onClick={() => selectOption(option)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 10px',
                border: 'none',
                borderRadius: 6,
                background: option.value === current ? 'var(--muted)' : 'transparent',
                color: 'var(--fg)',
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {option.icon}
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    ) : null

  const bottomContent = bottom ?? autoBottom

  const panelPos = (mode: PanelMode, edge: 'top' | 'bottom'): React.CSSProperties =>
    mode === 'absolute'
      ? { position: 'absolute', [edge === 'bottom' ? 'top' : 'bottom']: '100%', left: 0, right: 0, zIndex: 15, [edge === 'bottom' ? 'marginTop' : 'marginBottom']: 6 }
      : {}

  return (
    <InputProvider value={ctx}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          width: '100%',
          opacity: disabled ? 0.6 : 1,
          ...style,
        }}
      >
        {/* Top element — suggestions, calculator output, activity log */}
        {top && <div style={{ ...panelBox, ...panelPos(topMode, 'top') }}>{top}</div>}

        {/* Main bar — the capsule */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            minHeight: 44,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--capsule-radius, 14px)',
          }}
        >
          <ActionSlot actions={leftActions} max={maxLeft} side="left" />
          <CenterField placeholder={placeholder} />
          <ActionSlot actions={rightActions} max={maxRight} side="right" />
        </div>

        {/* Bottom element — dropdown list / search results */}
        {bottomContent && (
          <div style={{ ...panelBox, ...panelPos(bottomMode, 'bottom') }}>{bottomContent}</div>
        )}
      </div>
    </InputProvider>
  )
}
