import { useRef, useEffect, useState } from 'react'
import { BentoGrid, BentoCell, type BentoSize } from '@muralink/ui'
import { CalendarWidget } from '@muralink/module-calendar/web'

const CELL_SIZE = 160
const GAP = 10

function computeSize(containerWidth: number): BentoSize {
  const cols = Math.max(1, Math.floor((containerWidth + GAP) / (CELL_SIZE + GAP)))
  if (cols >= 3) return '3x3'
  if (cols >= 2) return '2x2'
  return '1x2'
}

export function CalendarPanel() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<BentoSize>('3x3')

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => {
      setSize(computeSize(entry.contentRect.width))
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const [w, r] = size.split('x').map(Number) as [number, number]

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <BentoGrid cols={w} cellSize={CELL_SIZE} gap={GAP}>
        <BentoCell cols={w} rows={r}>
          <CalendarWidget size={size} events={[]} />
        </BentoCell>
      </BentoGrid>
    </div>
  )
}
