import type React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--primary)',
    color: 'var(--primary-fg)',
    border: 'none',
  },
  secondary: {
    background: 'var(--muted)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--fg)',
    border: '1px solid transparent',
  },
  danger: {
    background: '#dc2626',
    color: '#ffffff',
    border: 'none',
  },
}

const sizeStyles: Record<Size, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: 12, height: 28 },
  md: { padding: '6px 14px', fontSize: 14, height: 36 },
  lg: { padding: '10px 20px', fontSize: 15, height: 44 },
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled ?? loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 'var(--radius, 8px)',
        fontWeight: 500,
        cursor: disabled ?? loading ? 'not-allowed' : 'pointer',
        opacity: disabled ?? loading ? 0.6 : 1,
        transition: 'opacity 0.1s, background 0.1s',
        whiteSpace: 'nowrap',
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      {...props}
    >
      {loading ? '…' : children}
    </button>
  )
}
