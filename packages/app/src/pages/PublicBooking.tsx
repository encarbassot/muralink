import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { appointmentsApi, contactsApi } from '../api/index.ts'
import type { YService, YAvailableSlot } from '@muralink/module-appointments/types'
import instanceConfig from '@hair-saloon/instance/config'
import instanceTheme from '@hair-saloon/instance/theme'

type Step = 'service' | 'date' | 'slot' | 'contact' | 'confirm' | 'done'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function PublicBooking() {
  const [step, setStep] = useState<Step>('service')
  const [service, setService] = useState<YService | null>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [slot, setSlot] = useState<YAvailableSlot | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })

  const { data: services = [] } = useQuery({
    queryKey: ['services-public'],
    queryFn: () => appointmentsApi.getServices(),
  })

  const { data: slots = [], isFetching: loadingSlots } = useQuery({
    queryKey: ['slots', service?.id, date],
    queryFn: () => appointmentsApi.getSlots(service!.id, date),
    enabled: !!service && step === 'slot',
  })

  const book = useMutation({
    mutationFn: async () => {
      // Create or find contact
      const existing = await contactsApi.getContacts(form.name)
      let contactId: string
      if (existing.length > 0 && existing[0]) {
        contactId = existing[0].id
      } else {
        const contact = await contactsApi.createContact({
          name: form.name,
          phone: form.phone ? { number: form.phone, countryCode: '+34' } : undefined,
          email: form.email ? { address: form.email } : undefined,
        })
        contactId = contact.id
      }

      await appointmentsApi.bookPublic({
        contactId,
        serviceId: service!.id,
        start: slot!.start,
        notes: form.notes || undefined,
      })
    },
    onSuccess: () => setStep('done'),
  })

  const container: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: instanceTheme.colors.background,
    fontFamily: instanceTheme.font.sans,
    padding: 24,
  }

  const card: React.CSSProperties = {
    width: '100%',
    maxWidth: 480,
    background: '#fff',
    borderRadius: 16,
    padding: 32,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  }

  const btn: React.CSSProperties = {
    width: '100%',
    padding: '12px 0',
    borderRadius: 10,
    border: 'none',
    background: instanceTheme.colors.primary,
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 16,
  }

  const input: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${instanceTheme.colors.border}`,
    fontSize: 14,
    boxSizing: 'border-box',
    marginBottom: 12,
    background: instanceTheme.colors.background,
  }

  if (step === 'done') {
    return (
      <div style={container}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>¡Cita confirmada!</div>
          <div style={{ color: instanceTheme.colors.mutedForeground, fontSize: 14 }}>
            {service?.name} — {slot ? formatTime(slot.start.iso) : ''} — {formatDate(date)}
          </div>
          <button onClick={() => { setStep('service'); setService(null); setSlot(null) }} style={{ ...btn, marginTop: 24 }}>
            Pedir otra cita
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={container}>
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 22, color: instanceTheme.colors.accent }}>{instanceConfig.name}</div>
          <div style={{ fontSize: 14, color: instanceTheme.colors.mutedForeground, marginTop: 4 }}>Reserva una cita</div>
        </div>

        {/* Step: service */}
        {step === 'service' && (
          <>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>¿Qué servicio quieres?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {services.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setService(s); setStep('date') }}
                  style={{
                    padding: '12px 16px', borderRadius: 10, textAlign: 'left',
                    border: `1px solid ${instanceTheme.colors.border}`,
                    background: 'transparent', cursor: 'pointer', fontSize: 14,
                    display: 'flex', justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ color: instanceTheme.colors.mutedForeground }}>
                    {Math.round(s.durationSeconds / 60)}min
                    {s.price ? ` · ${s.price.amount}€` : ''}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step: date */}
        {step === 'date' && (
          <>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Elige un día</div>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={e => setDate(e.target.value)}
              style={{ ...input }}
            />
            <button onClick={() => setStep('slot')} style={btn}>Ver horarios</button>
            <button onClick={() => setStep('service')} style={{ ...btn, background: 'transparent', color: instanceTheme.colors.foreground, border: `1px solid ${instanceTheme.colors.border}`, marginTop: 8 }}>
              Atrás
            </button>
          </>
        )}

        {/* Step: slot */}
        {step === 'slot' && (
          <>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Horarios disponibles</div>
            <div style={{ fontSize: 13, color: instanceTheme.colors.mutedForeground, marginBottom: 16 }}>{formatDate(date)}</div>
            {loadingSlots ? (
              <div style={{ color: instanceTheme.colors.mutedForeground, fontSize: 14 }}>Cargando...</div>
            ) : slots.length === 0 ? (
              <div style={{ color: instanceTheme.colors.mutedForeground, fontSize: 14 }}>No hay horarios disponibles este día.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {slots.map(s => (
                  <button
                    key={s.start.iso}
                    onClick={() => { setSlot(s); setStep('contact') }}
                    style={{
                      padding: '8px 16px', borderRadius: 8,
                      border: `1px solid ${instanceTheme.colors.accent}`,
                      color: instanceTheme.colors.accent,
                      background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                    }}
                  >
                    {formatTime(s.start.iso)}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setStep('date')} style={{ ...btn, background: 'transparent', color: instanceTheme.colors.foreground, border: `1px solid ${instanceTheme.colors.border}`, marginTop: 16 }}>
              Atrás
            </button>
          </>
        )}

        {/* Step: contact info */}
        {step === 'contact' && (
          <>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>Tus datos</div>
            <input placeholder="Nombre *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={input} required />
            <input placeholder="Teléfono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={input} />
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={input} />
            <textarea placeholder="Notas (opcional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...input, resize: 'vertical', minHeight: 72 }} />
            <button onClick={() => setStep('confirm')} disabled={!form.name} style={{ ...btn, opacity: form.name ? 1 : 0.5 }}>
              Continuar
            </button>
            <button onClick={() => setStep('slot')} style={{ ...btn, background: 'transparent', color: instanceTheme.colors.foreground, border: `1px solid ${instanceTheme.colors.border}`, marginTop: 8 }}>
              Atrás
            </button>
          </>
        )}

        {/* Step: confirm */}
        {step === 'confirm' && (
          <>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>Confirmar cita</div>
            <dl style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px 0', fontSize: 14 }}>
              <dt style={{ color: instanceTheme.colors.mutedForeground }}>Servicio</dt>
              <dd>{service?.name}</dd>
              <dt style={{ color: instanceTheme.colors.mutedForeground }}>Día</dt>
              <dd>{formatDate(date)}</dd>
              <dt style={{ color: instanceTheme.colors.mutedForeground }}>Hora</dt>
              <dd>{slot ? formatTime(slot.start.iso) : ''}</dd>
              <dt style={{ color: instanceTheme.colors.mutedForeground }}>Nombre</dt>
              <dd>{form.name}</dd>
            </dl>
            <button
              onClick={() => book.mutate()}
              disabled={book.isPending}
              style={{ ...btn, opacity: book.isPending ? 0.7 : 1 }}
            >
              {book.isPending ? 'Confirmando...' : 'Confirmar cita'}
            </button>
            {book.isError && (
              <div style={{ color: '#e53935', fontSize: 13, marginTop: 8 }}>Error al crear la cita. Inténtalo de nuevo.</div>
            )}
            <button onClick={() => setStep('contact')} style={{ ...btn, background: 'transparent', color: instanceTheme.colors.foreground, border: `1px solid ${instanceTheme.colors.border}`, marginTop: 8 }}>
              Atrás
            </button>
          </>
        )}
      </div>
    </div>
  )
}
