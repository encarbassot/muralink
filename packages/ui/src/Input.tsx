import type React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, style, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-fg)' }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          height: 36,
          padding: '0 10px',
          borderRadius: 'var(--radius, 8px)',
          border: `1px solid ${error ? '#dc2626' : 'var(--border)'}`,
          background: 'var(--bg)',
          color: 'var(--fg)',
          fontSize: 14,
          outline: 'none',
          transition: 'border-color 0.15s',
          ...style,
        }}
        {...props}
      />
      {error && (
        <span style={{ fontSize: 12, color: '#dc2626' }}>{error}</span>
      )}
    </div>
  )
}
