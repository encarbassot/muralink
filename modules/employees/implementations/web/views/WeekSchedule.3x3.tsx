import type { YEmployee } from '../../../types.ts'
import type { YShift } from '../../../types.ts'

interface Props {
  employees?: YEmployee[]
  shifts?: YShift[]
  weekStartDate?: string
  onShiftClick?: (shift: YShift) => void
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function getWeekDates(startDate: string): string[] {
  const start = new Date(startDate)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function currentMonday(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

export function WeekSchedule({ employees = [], shifts = [], weekStartDate, onShiftClick }: Props) {
  const start = weekStartDate ?? currentMonday()
  const dates = getWeekDates(start)

  const shiftMap: Record<string, Record<string, YShift[]>> = {}
  for (const shift of shifts) {
    if (!shiftMap[shift.employeeId]) shiftMap[shift.employeeId] = {}
    if (!shiftMap[shift.employeeId][shift.date]) shiftMap[shift.employeeId][shift.date] = []
    shiftMap[shift.employeeId][shift.date]!.push(shift)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: 600 }} />
        {dates.map((date, i) => (
          <div key={date} style={{ padding: '6px 4px', fontSize: 11, fontWeight: 600, textAlign: 'center', color: 'var(--muted-foreground, #6b6560)' }}>
            {DAY_NAMES[i]}
            <div style={{ fontSize: 10, fontWeight: 400 }}>{date.slice(8)}</div>
          </div>
        ))}
      </div>

      {/* Employee rows */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {employees.filter(e => e.active).map(emp => (
          <div
            key={emp.id}
            style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', borderBottom: '1px solid var(--border, #d4cfc9)', minHeight: 40 }}
          >
            <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: emp.color ?? '#b5936a', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {emp.name.split(' ')[0]}
              </span>
            </div>
            {dates.map(date => {
              const dayShifts = shiftMap[emp.id]?.[date] ?? []
              return (
                <div key={date} style={{ padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {dayShifts.map(shift => (
                    <div
                      key={shift.id}
                      onClick={() => onShiftClick?.(shift)}
                      style={{
                        fontSize: 9,
                        padding: '2px 4px',
                        borderRadius: 3,
                        background: (emp.color ?? '#b5936a') + '33',
                        color: emp.color ?? '#b5936a',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {shift.startTime}–{shift.endTime}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
        {employees.filter(e => e.active).length === 0 && (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Sin empleados activos</div>
        )}
      </div>
    </div>
  )
}
