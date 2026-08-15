// Team calendar: one row per employee, one column per day of the week, with
// independent toggle chips for the planned vs recorded halves of
// YAttendanceEntry — both can render superimposed, like WeekSchedule but with
// two coexisting timestamp kinds instead of one.

import { useMemo, useState } from 'react'
import type { YEmployee } from '@muralink/module-employees/types'
import type { YAttendanceEntry } from '../../../types.ts'

interface Props {
  employees?: YEmployee[]
  entries?: YAttendanceEntry[]
  weekStartDate?: string
  onEntryClick?: (entry: YAttendanceEntry) => void
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

function overlapsDay(startIso: string, endIso: string, date: string): boolean {
  const dayStart = new Date(`${date}T00:00:00`).getTime()
  const dayEnd = dayStart + 24 * 60 * 60 * 1000
  const s = new Date(startIso).getTime()
  const e = new Date(endIso).getTime()
  return s < dayEnd && e > dayStart
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function TeamCalendar({ employees = [], entries = [], weekStartDate, onEntryClick }: Props) {
  const [showPlanned, setShowPlanned] = useState(true)
  const [showRecorded, setShowRecorded] = useState(true)

  const start = weekStartDate ?? currentMonday()
  const dates = useMemo(() => getWeekDates(start), [start])
  const active = employees.filter((e) => e.active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        <button
          onClick={() => setShowPlanned((v) => !v)}
          style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 99, cursor: 'pointer',
            border: '1px solid var(--accent, #b5936a)',
            background: showPlanned ? 'var(--accent, #b5936a)' : 'transparent',
            color: showPlanned ? '#fff' : 'var(--accent, #b5936a)',
          }}
        >
          ◻ Planeado
        </button>
        <button
          onClick={() => setShowRecorded((v) => !v)}
          style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 99, cursor: 'pointer',
            border: '1px solid #4caf50',
            background: showRecorded ? '#4caf50' : 'transparent',
            color: showRecorded ? '#fff' : '#4caf50',
          }}
        >
          ● Registrado
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '84px repeat(7, 1fr)', borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        <div />
        {dates.map((date, i) => (
          <div key={date} style={{ padding: '6px 4px', fontSize: 11, fontWeight: 600, textAlign: 'center', color: 'var(--muted-foreground, #6b6560)' }}>
            {DAY_NAMES[i]}
            <div style={{ fontSize: 10, fontWeight: 400 }}>{date.slice(8)}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {active.map((emp) => {
          const empEntries = entries.filter((e) => e.employeeId === emp.id)
          return (
            <div
              key={emp.id}
              style={{ display: 'grid', gridTemplateColumns: '84px repeat(7, 1fr)', borderBottom: '1px solid var(--border, #d4cfc9)', minHeight: 44 }}
            >
              <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: emp.color ?? '#b5936a', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {emp.name.split(' ')[0]}
                </span>
              </div>
              {dates.map((date) => (
                <div key={date} style={{ padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {showPlanned && empEntries
                    .filter((e) => e.planned && overlapsDay(e.planned.start.iso, e.planned.end.iso, date))
                    .map((e) => (
                      <div
                        key={`${e.id}-planned`}
                        onClick={() => onEntryClick?.(e)}
                        title="Planeado"
                        style={{
                          fontSize: 9, padding: '2px 4px', borderRadius: 3, cursor: 'pointer',
                          border: `1px solid ${emp.color ?? '#b5936a'}`,
                          color: emp.color ?? '#b5936a',
                          background: 'transparent',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {fmtTime(e.planned!.start.iso)}–{fmtTime(e.planned!.end.iso)}
                      </div>
                    ))}
                  {showRecorded && empEntries
                    .filter((e) => e.recorded && overlapsDay(e.recorded.start.iso, e.recorded.end?.iso ?? new Date().toISOString(), date))
                    .map((e) => (
                      <div
                        key={`${e.id}-recorded`}
                        onClick={() => onEntryClick?.(e)}
                        title="Registrado"
                        style={{
                          fontSize: 9, padding: '2px 4px', borderRadius: 3, cursor: 'pointer',
                          background: '#4caf5033', color: '#4caf50', fontWeight: 600,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {fmtTime(e.recorded!.start.iso)}–{e.recorded!.end ? fmtTime(e.recorded!.end.iso) : 'en curso'}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )
        })}
        {active.length === 0 && (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Sin empleados activos</div>
        )}
      </div>
    </div>
  )
}
