// "Compartir" tab: manage trust groups and MY OWN published locations — each
// with a date range (start/end) and a visibility (private/trustgroup/public).
// A linked contact reads these back through /api/contacts/shared-locations,
// gated by @muralink/types' canView. Top: a read-only embedded CalendarApp
// year view of every location's range. Below: the editable list, each row
// with its own mini MapView for placing the pin.

import { useEffect, useState } from 'react'
import type { YVisibility } from '@muralink/types'
import { CalendarApp } from '@muralink/module-calendar/web'
import { MapView, type MapMarker } from '@muralink/module-maps/web'
import type { YContactLocation } from '../../../types.ts'
import { useMyLocations, ensureMyLocationsLoaded } from '../myLocationsStore.ts'
import { useTrustGroups, ensureTrustGroupsLoaded } from '../trustGroupsStore.ts'
import { locationToEvent } from '../toCalendarEvents.ts'

function toDateInput(iso?: string) {
  return iso ? iso.slice(0, 10) : ''
}
function fromDateInput(v: string) {
  return v ? { iso: new Date(v).toISOString(), timezone: 'UTC' } : undefined
}

export function MyLocationsPanel() {
  const locations = useMyLocations((s) => s.locations)
  const locLoaded = useMyLocations((s) => s.loaded)
  const create = useMyLocations((s) => s.create)
  const update = useMyLocations((s) => s.update)
  const remove = useMyLocations((s) => s.remove)

  const groups = useTrustGroups((s) => s.groups)
  const groupsLoaded = useTrustGroups((s) => s.loaded)
  const createGroup = useTrustGroups((s) => s.create)
  const updateGroup = useTrustGroups((s) => s.update)
  const removeGroup = useTrustGroups((s) => s.remove)

  useEffect(() => {
    ensureMyLocationsLoaded()
    ensureTrustGroupsLoaded()
  }, [])

  const events = locations.filter((l) => l.point).map(locationToEvent)

  async function handleAddLocation() {
    await create({ point: { lat: 41.3874, lon: 2.1686 }, visibility: 'private', startAt: { iso: new Date().toISOString(), timezone: 'UTC' } })
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionTitle>Calendario de ubicaciones</SectionTitle>
        <div style={{ height: 220, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <CalendarApp events={events} defaultMode="year" />
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SectionTitle>Mis ubicaciones públicas</SectionTitle>
          <button onClick={() => void handleAddLocation()} style={addBtnStyle}>+ Nueva ubicación</button>
        </div>
        {locLoaded && locations.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>Ninguna todavía — un contacto vinculado no verá nada hasta que publiques una.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {locations.map((loc) => (
            <LocationRow
              key={loc.id}
              loc={loc}
              groups={groups}
              onChange={(patch) => void update(loc.id, patch)}
              onDelete={() => void remove(loc.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SectionTitle>Grupos de confianza</SectionTitle>
          <button onClick={() => void createGroup('Nuevo grupo')} style={addBtnStyle}>+ Nuevo grupo</button>
        </div>
        {groupsLoaded && groups.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--fg-faint)' }}>Sin grupos — crea uno para poder compartir una ubicación solo con ciertos contactos.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groups.map((g) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              <input
                value={g.name}
                onChange={(e) => void updateGroup(g.id, { name: e.target.value })}
                style={{ ...inputStyle, width: 140 }}
              />
              <input
                value={g.memberEmails.join(', ')}
                placeholder="email1@x.com, email2@x.com"
                onChange={(e) => void updateGroup(g.id, { memberEmails: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => void removeGroup(g.id)} style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LocationRow({
  loc,
  groups,
  onChange,
  onDelete,
}: {
  loc: YContactLocation
  groups: { id: string; name: string }[]
  onChange: (patch: Partial<Omit<YContactLocation, 'id' | 'createdAt'>>) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const markers: MapMarker[] = [{ id: loc.id, lat: loc.point.lat, lng: loc.point.lon, emoji: '📍', label: loc.label ?? 'Ubicación' }]

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          value={loc.label ?? ''}
          placeholder="Etiqueta (p.ej. Barcelona)"
          onChange={(e) => onChange({ label: e.target.value || undefined })}
          style={{ ...inputStyle, flex: 1 }}
        />
        <select value={loc.visibility} onChange={(e) => onChange({ visibility: e.target.value as YVisibility })} style={inputStyle}>
          <option value="private">Privado</option>
          <option value="trustgroup">Grupo de confianza</option>
          <option value="public">Público</option>
        </select>
        {loc.visibility === 'trustgroup' && (
          <select value={loc.trustGroupId ?? ''} onChange={(e) => onChange({ trustGroupId: e.target.value || undefined })} style={inputStyle}>
            <option value="">Elige grupo…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <button onClick={() => setExpanded((v) => !v)} style={{ ...inputStyle, cursor: 'pointer' }}>{expanded ? 'Ocultar mapa' : 'Mapa'}</button>
        <button onClick={onDelete} title="Eliminar" style={{ border: 'none', background: 'transparent', color: 'var(--fg-faint)', cursor: 'pointer', fontSize: 12 }}>✕</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--fg-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Desde
          <input type="date" value={toDateInput(loc.startAt.iso)} onChange={(e) => { const v = fromDateInput(e.target.value); if (v) onChange({ startAt: v }) }} style={inputStyle} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--fg-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Hasta
          <input type="date" value={toDateInput(loc.endAt?.iso)} onChange={(e) => onChange({ endAt: fromDateInput(e.target.value) })} style={inputStyle} />
          <span title="Vacío = 'aquí actualmente'">(vacío = actual)</span>
        </label>
      </div>
      {expanded && (
        <div style={{ height: 200, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <MapView
            markers={markers}
            center={[loc.point.lat, loc.point.lon]}
            zoom={11}
            draggableMarkers
            onMarkerDrag={(_id, lat, lng) => onChange({ point: { lat, lon: lng } })}
            onMapClick={(lat, lng) => onChange({ point: { lat, lon: lng } })}
          />
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)' }}>{children}</span>
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '5px 8px',
  fontSize: 12,
  outline: 'none',
  background: 'var(--bg-elevated)',
  color: 'var(--fg)',
}

const addBtnStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--fg-dim)',
  borderRadius: 6,
  padding: '3px 8px',
  cursor: 'pointer',
  fontSize: 11,
}
