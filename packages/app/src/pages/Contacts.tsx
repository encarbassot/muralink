import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { contactsApi, appointmentsApi } from '../api/index.ts'
import { ContactList } from '@muralink/module-contacts/web'
import type { YContact } from '@muralink/module-contacts/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function Contacts() {
  const [selected, setSelected] = useState<YContact | null>(null)

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => contactsApi.getContacts(),
  })

  const { data: history = [] } = useQuery({
    queryKey: ['contact-history', selected?.id],
    queryFn: () => appointmentsApi.getContactAppointments(selected!.id),
    enabled: !!selected,
  })

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      <div style={{ width: 300, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <ContactList contacts={contacts} onContactClick={setSelected} />
      </div>

      <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 12, padding: 20, overflow: 'auto' }}>
        {!selected ? (
          <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>Selecciona un contacto</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700, flexShrink: 0,
              }}>
                {selected.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{selected.name}</div>
                {selected.phone && <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>{selected.phone.number}</div>}
                {selected.email && <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>{selected.email.address}</div>}
              </div>
            </div>

            {selected.notes && (
              <div style={{ marginBottom: 20, padding: 12, background: 'var(--muted)', borderRadius: 8, fontSize: 13 }}>
                {selected.notes}
              </div>
            )}

            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Historial de visitas</div>
            {history.length === 0 ? (
              <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Sin visitas</div>
            ) : (
              history.map(appt => (
                <div key={appt.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{formatDate(appt.start.iso)} {formatTime(appt.start.iso)}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>{appt.status}</span>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
