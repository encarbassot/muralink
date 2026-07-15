import type React from 'react'

interface CardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
  padding?: number | string
}

export function Card({ children, style, onClick, padding = 16 }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 8px)',
        padding,
        cursor: onClick ? 'pointer' : undefined,
        transition: onClick ? 'border-color 0.15s' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
