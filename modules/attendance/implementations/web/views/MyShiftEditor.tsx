// "Quedar con amigos" for your own work schedule: colleagues' planned rows
// render read-only underneath so you can see who else is around, while your
// own row is editable — click a day cell to set/adjust your planned window.
// Overlap conflicts against your OWN existing planned entries are rejected
// server-side (findOverlaps in implementations/server/queries.ts); colleagues
// overlapping each other, or you, is never a conflict.

import { useMemo, useState } from 'react'
import type { YEmployee } from '@muralink/module-employees/types'
import type { YAttendanceEntry } from '../../../types.ts'

interface Props {
  employeeId: string
  employees?: YEmployee[]
  entries?: YAttendanceEntry[]
  weekStartDate?: string
  /** Create or replace the caller's planned window for a given day. */
  onSetOwnShift?: (date: string, startTime: string, endTime: string) => void
  onRemoveOwnShift?: (entryId: string) => void
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

export function MyShiftEditor({ employeeId, employees = [], entries = [], weekStartDate, onSetOwnShift, onRemoveOwnShift }: Props) {
  const start = weekStartDate ?? currentMonday()
  const dates = useMemo(() => getWeekDates(start), [start])
  const [editing, setEditing] = useState<string | null>(null) // date
  const [draftStart, setDraftStart] = useState('09:00')
  const [draftEnd, setDraftEnd] = useState('17:00')

  const me = employees.find((e) => e.id === employeeId)
  const colleagues = employees.filter((e) => e.active && e.id !== employeeId)
  const myEntries = entries.filter((e) => e.employeeId === employeeId && e.planned)

  function openEditor(date: string) {
    setEditing(date)
    setDraftStart('09:00')
    setDraftEnd('17:00')
  }

  function save(date: string) {
    onSetOwnShift?.(date, draftStart, draftEnd)
    setEditing(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        Mi horario{me ? ` · ${me.name}` : ''}
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

      {/* Own row — editable */}
      <div style={{ display: 'grid', gridTemplateColumns: '84px repeat(7, 1fr)', borderBottom: '2px solid var(--accent, #b5936a)', minHeight: 48 }}>
        <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700 }}>Yo</div>
        {dates.map((date) => {
          const dayEntries = myEntries.filter((e) => overlapsDay(e.planned!.start.iso, e.planned!.end.iso, date))
          return (
            <div key={date} style={{ padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dayEntries.map((e) => (
                <div
                  key={e.id}
                  onClick={() => onRemoveOwnShift?.(e.id)}
                  title="Click para eliminar"
                  style={{
                    fontSize: 9, padding: '2px 4px', borderRadius: 3, cursor: 'pointer',
                    background: 'var(--accent, #b5936a)', color: '#fff',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {fmtTime(e.planned!.start.iso)}–{fmtTime(e.planned!.end.iso)}
                </div>
              ))}
              {editing === date ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <input type="time" value={draftStart} onChange={(ev) => setDraftStart(ev.target.value)} style={{ fontSize: 9, width: '100%' }} />
                  <input type="time" value={draftEnd} onChange={(ev) => setDraftEnd(ev.target.value)} style={{ fontSize: 9, width: '100%' }} />
                  <button onClick={() => save(date)} style={{ fontSize: 9, cursor: 'pointer' }}>Guardar</button>
                </div>
              ) : (
                <button
                  onClick={() => openEditor(date)}
                  style={{
                    fontSize: 9, border: '1px dashed var(--border, #d4cfc9)', borderRadius: 3,
                    background: 'transparent', color: 'var(--muted-foreground, #6b6560)', cursor: 'pointer', padding: '2px 0',
                  }}
                >
                  ＋
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Colleagues — read-only, for context */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {colleagues.map((emp) => {
          const empEntries = entries.filter((e) => e.employeeId === emp.id && e.planned)
          return (
            <div
              key={emp.id}
              style={{ display: 'grid', gridTemplateColumns: '84px repeat(7, 1fr)', borderBottom: '1px solid var(--border, #d4cfc9)', minHeight: 36, opacity: 0.7 }}
            >
              <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: emp.color ?? '#b5936a', flexShrink: 0 }} />
                <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name.split(' ')[0]}</span>
              </div>
              {dates.map((date) => {
                const dayEntries = empEntries.filter((e) => overlapsDay(e.planned!.start.iso, e.planned!.end.iso, date))
                return (
                  <div key={date} style={{ padding: '4px 2px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {dayEntries.map((e) => (
                      <div
                        key={e.id}
                        style={{
                          fontSize: 9, padding: '2px 4px', borderRadius: 3,
                          border: `1px solid ${emp.color ?? '#b5936a'}`, color: emp.color ?? '#b5936a',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {fmtTime(e.planned!.start.iso)}–{fmtTime(e.planned!.end.iso)}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}
        {colleagues.length === 0 && (
          <div style={{ padding: 12, color: 'var(--muted-foreground, #6b6560)', fontSize: 12 }}>Sin más compañeros activos</div>
        )}
      </div>
    </div>
  )
}
