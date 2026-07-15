import type React from 'react'
import type { GridSize } from '@muralink/types'

export type BentoSize = '1x1' | '1x2' | '2x1' | '2x2' | '2x3' | '3x2' | '3x3'

interface BentoGridProps {
  children: React.ReactNode
  cols?: number
  cellSize?: number
  gap?: number
  style?: React.CSSProperties
}

interface BentoCellProps {
  children: React.ReactNode
  cols?: number
  rows?: number
  style?: React.CSSProperties
}

export function BentoGrid({
  children,
  cols = 6,
  cellSize = 140,
  gap = 12,
  style,
}: BentoGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridAutoRows: `${cellSize}px`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function BentoCell({ children, cols = 1, rows = 1, style }: BentoCellProps) {
  return (
    <div
      style={{
        gridColumn: `span ${cols}`,
        gridRow: `span ${rows}`,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function bentoSizeToCols(size: GridSize): { cols: number; rows: number } {
  const [c, r] = size.split('x').map(Number) as [number, number]
  return { cols: c, rows: r }
}
