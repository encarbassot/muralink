// Per-contact location editor: a label + a mini map. Click the map (or drag the
// pin) to set contact.location.point; the text field is a freeform display
// label (city, address…) independent of the resolved coordinates — there's no
// geocoder in v1, so the two are set separately.
//
// Below: linking this contact to their own muralink account (pasted invitation
// URL, see MyLocationsPanel's "compartir" flow) and, once accepted, a read-only
// embedded calendar year view of the locations they've published to me.

import { useEffect, useState } from 'react'
import { MapView, type MapMarker } from '@muralink/module-maps/web'
import { CalendarApp } from '@muralink/module-calendar/web'
import type { YContact } from '../../../types.ts'
import { useContactLocationCache } from '../contactLocationCacheStore.ts'
import { pollContactLocation } from '../locationSync.ts'
import { locationToEvent } from '../toCalendarEvents.ts'

interface Props {
  contact: YContact
  readonly?: boolean
  onChange: (patch: Partial<YContact>) => void
}

export function LocationSection({ contact, readonly, onChange }: Props) {
  const point = contact.location?.point
  const markers: MapMarker[] = point
    ? [{ id: contact.id, lat: point.lat, lng: point.lon, emoji: '📍', label: contact.location?.text ?? contact.name }]
    : []

  function setPoint(lat: number, lng: number) {
    if (readonly) return
    onChange({ location: { ...contact.location, point: { lat, lon: lng } } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)' }}>
        Ubicación
      </span>
      <input
        value={contact.location?.text ?? ''}
        placeholder="Ciudad, dirección…"
        disabled={readonly}
        onChange={(e) => onChange({ location: { ...contact.location, text: e.target.value || undefined } })}
        style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)', opacity: readonly ? 0.7 : 1 }}
      />
      <div style={{ height: 220, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <MapView
          markers={markers}
          center={point ? [point.lat, point.lon] : undefined}
          zoom={point ? 12 : 2}
          onMapClick={setPoint}
          draggableMarkers={!readonly}
          onMarkerDrag={(_id, lat, lng) => setPoint(lat, lng)}
        />
      </div>
      {point && !readonly && (
        <button
          onClick={() => onChange({ location: contact.location?.text ? { text: contact.location.text } : undefined })}
          style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 11, padding: 0 }}
        >
          Quitar posición del mapa
        </button>
      )}
      {!readonly && <LinkedAccountSection contact={contact} onChange={onChange} />}
    </div>
  )
}

function LinkedAccountSection({ contact, onChange }: { contact: YContact; onChange: (patch: Partial<YContact>) => void }) {
  const linked = contact.linkedAccount
  const cache = useContactLocationCache((s) => s.byContact[contact.id])
  const load = useContactLocationCache((s) => s.load)
  const [urlDraft, setUrlDraft] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { void load(contact.id) }, [contact.id, load])

  async function refresh() {
    setSyncing(true)
    try { await pollContactLocation(contact) } finally { setSyncing(false) }
  }

  if (!linked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)' }}>
          Vincular cuenta muralink
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={urlDraft}
            placeholder="Pega aquí el link de invitación que te ha mandado…"
            onChange={(e) => setUrlDraft(e.target.value)}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', background: 'var(--bg-elevated)', color: 'var(--fg)' }}
          />
          <button
            disabled={!urlDraft.trim()}
            onClick={() => { onChange({ linkedAccount: { tunnelUrl: urlDraft.trim(), status: 'pending' } }); setUrlDraft('') }}
            style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--fg-dim)', borderRadius: 6, padding: '0 10px', cursor: urlDraft.trim() ? 'pointer' : 'default', fontSize: 12 }}
          >
            Vincular
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)' }}>
          Cuenta vinculada
        </span>
        <StatusBadge status={linked.status} />
        <button onClick={() => void refresh()} disabled={syncing} style={{ marginLeft: 'auto', border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-dim)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
          {syncing ? 'Actualizando…' : 'Actualizar'}
        </button>
        <button onClick={() => onChange({ linkedAccount: undefined })} title="Desvincular" style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}>✕</button>
      </div>
      {linked.status === 'accepted' && cache && cache.locations.length > 0 && (
        <div style={{ height: 180, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <CalendarApp events={cache.locations.map(locationToEvent)} defaultMode="year" />
        </div>
      )}
      {linked.status === 'accepted' && (!cache || cache.locations.length === 0) && (
        <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Sin ubicaciones visibles para ti todavía.</div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'accepted' | 'revoked' }) {
  const label = status === 'accepted' ? 'Aceptada' : status === 'revoked' ? 'Revocada' : 'Pendiente'
  const color = status === 'accepted' ? '#4caf7d' : status === 'revoked' ? '#e0645c' : 'var(--fg-faint)'
  return <span style={{ fontSize: 10, color, border: `1px solid ${color}`, borderRadius: 6, padding: '1px 6px' }}>{label}</span>
}
