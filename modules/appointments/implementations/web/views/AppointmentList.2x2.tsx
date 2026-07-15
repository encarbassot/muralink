import type { YAppointment, AppointmentStatus } from '../../../types.ts'

interface Props {
  appointments?: YAppointment[]
  contactName?: (id: string) => string
  serviceName?: (id: string) => string
  onAppointmentClick?: (appointment: YAppointment) => void
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Completada',
  'no-show': 'No asistió',
}

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: '#b5936a',
  confirmed: '#4caf50',
  cancelled: '#e53935',
  completed: '#1a1a1a',
  'no-show': '#9e9e9e',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export function AppointmentList({ appointments = [], contactName, serviceName, onAppointmentClick }: Props) {
  const upcoming = appointments
    .filter(a => a.status !== 'cancelled' && a.status !== 'completed')
    .sort((a, b) => a.start.iso.localeCompare(b.start.iso))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        Próximas citas
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {upcoming.length === 0 && (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Sin citas</div>
        )}
        {upcoming.map(appt => (
          <div
            key={appt.id}
            onClick={() => onAppointmentClick?.(appt)}
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border, #d4cfc9)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {contactName ? contactName(appt.contactId) : appt.contactId}
              </span>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 99,
                background: STATUS_COLORS[appt.status] + '22',
                color: STATUS_COLORS[appt.status],
                fontWeight: 600,
              }}>
                {STATUS_LABELS[appt.status]}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground, #6b6560)' }}>
              {serviceName ? serviceName(appt.serviceId) : appt.serviceId} · {Math.round(appt.duration.seconds / 60)}min
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)' }}>
              {formatDateTime(appt.start.iso)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
