import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { appointmentsApi, contactsApi } from '../api/index.ts'
import { AppointmentList } from '@muralink/module-appointments/web'
import type { YAppointment, AppointmentStatus } from '@muralink/module-appointments/types'

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Completada',
  'no-show': 'No asistió',
}

export function Appointments() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<YAppointment | null>(null)

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => appointmentsApi.getAppointments(),
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => contactsApi.getContacts(),
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => appointmentsApi.getServices(),
  })

  const contactMap = Object.fromEntries(contacts.map(c => [c.id, c.name]))
  const serviceMap = Object.fromEntries(services.map(s => [s.id, s.name]))

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      appointmentsApi.updateAppointment(id, { status }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['appointments'] }) },
  })

  const deleteAppt = useMutation({
    mutationFn: (id: string) => appointmentsApi.deleteAppointment(id),
    onSuccess: () => {
      setSelected(null)
      void qc.invalidateQueries({ queryKey: ['appointments'] })
    },
  })

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      <div style={{ width: 340, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <AppointmentList
          appointments={appointments}
          contactName={id => contactMap[id] ?? id}
          serviceName={id => serviceMap[id] ?? id}
          onAppointmentClick={setSelected}
        />
      </div>

      <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 12, padding: 20, overflow: 'auto' }}>
        {!selected ? (
          <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>Selecciona una cita</div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Detalle de la cita</div>

            <dl style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '8px 0', fontSize: 14 }}>
              <dt style={{ color: 'var(--muted-foreground)' }}>Cliente</dt>
              <dd>{contactMap[selected.contactId] ?? selected.contactId}</dd>
              <dt style={{ color: 'var(--muted-foreground)' }}>Servicio</dt>
              <dd>{serviceMap[selected.serviceId] ?? selected.serviceId}</dd>
              <dt style={{ color: 'var(--muted-foreground)' }}>Inicio</dt>
              <dd>{new Date(selected.start.iso).toLocaleString('es-ES')}</dd>
              <dt style={{ color: 'var(--muted-foreground)' }}>Duración</dt>
              <dd>{Math.round(selected.duration.seconds / 60)} min</dd>
              <dt style={{ color: 'var(--muted-foreground)' }}>Estado</dt>
              <dd>{STATUS_LABELS[selected.status]}</dd>
              {selected.notes && <>
                <dt style={{ color: 'var(--muted-foreground)' }}>Notas</dt>
                <dd>{selected.notes}</dd>
              </>}
            </dl>

            <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['confirmed', 'completed', 'no-show', 'cancelled'] as AppointmentStatus[]).map(status => (
                <button
                  key={status}
                  disabled={selected.status === status || updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ id: selected.id, status })}
                  style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: 13,
                    border: '1px solid var(--border)', cursor: 'pointer',
                    background: selected.status === status ? 'var(--muted)' : 'transparent',
                  }}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
              <button
                onClick={() => deleteAppt.mutate(selected.id)}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 13,
                  border: '1px solid #e53935', color: '#e53935',
                  cursor: 'pointer', background: 'transparent', marginLeft: 'auto',
                }}
              >
                Eliminar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
