import { useState } from 'react'
import type { YService, YAvailableSlot } from '../../../types.ts'

interface Props {
  services?: YService[]
  onFetchSlots?: (serviceId: string, date: string) => Promise<YAvailableSlot[]>
  onBook?: (serviceId: string, slot: YAvailableSlot) => void
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function BookingWidget({ services = [], onFetchSlots, onBook }: Props) {
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? '')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [slots, setSlots] = useState<YAvailableSlot[]>([])
  const [loading, setLoading] = useState(false)

  async function search() {
    if (!serviceId || !onFetchSlots) return
    setLoading(true)
    try {
      setSlots(await onFetchSlots(serviceId, date))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: 12, fontFamily: 'inherit', overflow: 'hidden' }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Nueva cita</div>

      <select
        value={serviceId}
        onChange={e => { setServiceId(e.target.value); setSlots([]) }}
        style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border, #d4cfc9)', background: 'var(--background, #f9f7f4)' }}
      >
        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="date"
          value={date}
          onChange={e => { setDate(e.target.value); setSlots([]) }}
          style={{ flex: 1, fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border, #d4cfc9)', background: 'var(--background, #f9f7f4)' }}
        />
        <button
          onClick={search}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--primary, #1a1a1a)', color: '#fff', cursor: 'pointer' }}
        >
          {loading ? '...' : 'Ver'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexWrap: 'wrap', gap: 4, alignContent: 'flex-start' }}>
        {slots.map(slot => (
          <button
            key={slot.start.iso}
            onClick={() => onBook?.(serviceId, slot)}
            style={{
              fontSize: 12, padding: '4px 8px', borderRadius: 6,
              border: '1px solid var(--accent, #b5936a)',
              background: 'transparent', color: 'var(--accent, #b5936a)',
              cursor: 'pointer',
            }}
          >
            {formatTime(slot.start.iso)}
          </button>
        ))}
        {slots.length === 0 && !loading && (
          <span style={{ fontSize: 12, color: 'var(--muted-foreground, #6b6560)' }}>
            Selecciona servicio y fecha
          </span>
        )}
      </div>
    </div>
  )
}
