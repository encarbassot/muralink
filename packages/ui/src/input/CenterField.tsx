import { useState } from 'react'
import type React from 'react'
import { useInputContext } from './InputContext.tsx'
import type { FieldType } from './types.ts'

interface CenterFieldProps {
  placeholder?: string
}

// Native <input> attributes per field type. Keeps browser semantics
// (keyboards on mobile, validation, autofill) instead of reinventing them.
const inputAttrs: Record<
  Exclude<FieldType, 'dropdown'>,
  React.InputHTMLAttributes<HTMLInputElement>
> = {
  text: { type: 'text' },
  number: { type: 'number', inputMode: 'decimal' },
  url: { type: 'url', inputMode: 'url', autoCapitalize: 'off', spellCheck: false },
  phone: { type: 'tel', inputMode: 'tel' },
  email: { type: 'email', inputMode: 'email', autoCapitalize: 'off', spellCheck: false },
  password: { type: 'password' },
}

const baseInput: React.CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  height: 36,
  padding: '0 4px',
  border: 'none',
  background: 'transparent',
  color: 'var(--fg)',
  fontSize: 14,
  outline: 'none',
}

// The central element of the bar: a native input, or a dropdown trigger.
export function CenterField({ placeholder }: CenterFieldProps) {
  const { type, value, setValue, disabled, options, panelOpen, setPanelOpen } =
    useInputContext()
  const [reveal, setReveal] = useState(false)

  if (type === 'dropdown') {
    const selected = options.find((o) => o.value === value)
    return (
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen(!panelOpen)}
        style={{
          ...baseInput,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          color: selected ? 'var(--fg)' : 'var(--muted-fg)',
        }}
      >
        {selected?.icon}
        <span style={{ flex: 1 }}>{selected?.label ?? placeholder ?? 'Select…'}</span>
        <span style={{ color: 'var(--muted-fg)', fontSize: 11 }}>
          {panelOpen ? '▲' : '▼'}
        </span>
      </button>
    )
  }

  const attrs = inputAttrs[type]
  // Password type gets an inline reveal toggle.
  const resolvedType = type === 'password' && reveal ? 'text' : attrs.type

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: '1 1 auto', minWidth: 0 }}>
      <input
        {...attrs}
        type={resolvedType}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value)
          // Typing opens the suggestion panel when options exist.
          if (options.length > 0) setPanelOpen(true)
        }}
        onFocus={() => {
          if (options.length > 0) setPanelOpen(true)
        }}
        style={baseInput}
      />
      {type === 'password' && (
        <button
          type="button"
          title={reveal ? 'Hide' : 'Show'}
          onClick={() => setReveal((v) => !v)}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--muted-fg)',
            cursor: 'pointer',
            fontSize: 13,
            padding: '0 4px',
          }}
        >
          {reveal ? '🙈' : '👁'}
        </button>
      )}
    </div>
  )
}
