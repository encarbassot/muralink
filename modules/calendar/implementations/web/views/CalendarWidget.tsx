import { bentoSizeToCols } from '@muralink/ui'
import type { GridSize } from '@muralink/types'
import { WeekView } from './WeekView.3x3.tsx'
import { DayStrip } from './DayStrip.1x2.tsx'
import type { YCalendarEvent } from '../../../types.ts'

interface Props {
  size: GridSize
  events?: YCalendarEvent[]
  weekStart?: Date
  onSlotClick?: (date: Date) => void
  onEventClick?: (event: YCalendarEvent) => void
  onCreate?: (start: Date, end: Date) => void
}

export function CalendarWidget({ size, events, weekStart, onSlotClick, onEventClick, onCreate }: Props) {
  const { cols, rows } = bentoSizeToCols(size)
  if (cols >= 3 || rows >= 3) {
    return <WeekView events={events} weekStart={weekStart} onSlotClick={onSlotClick} onEventClick={onEventClick} onCreate={onCreate} />
  }
  return <DayStrip events={events} onEventClick={onEventClick} />
}
