// Maps: GPX tracks + saved emoji locations on a Leaflet surface.
// GPX files load as toggleable layers; saved locations render as emoji markers.
// Local-first: everything persists to localStorage; only the tile fetch touches
// the network, and the UI stays fully usable without it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Polyline } from 'react-leaflet'
import L, { type Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapView, type MapMarker } from './MapView.tsx'

const STORE_KEY = 'mural.playground.map.v1'

const TRACK_COLORS = ['#e0645c', '#4c8dd6', '#4caf7d', '#c78f3d', '#9b6dd6', '#d66db0']
const EMOJIS = ['📍', '⛺', '🏔️', '🍽️', '⛽', '🏨', '📸', '🏖️', '🚩', '⭐']
const MAX_TRACK_POINTS = 4000

interface SavedLocation {
  id: string
  name: string
  emoji: string
  lat: number
  lng: number
}

interface GpxTrack {
  id: string
  name: string
  color: string
  visible: boolean
  points: [number, number][]
}

interface Persisted {
  locations: SavedLocation[]
  tracks: GpxTrack[]
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return JSON.parse(raw) as Persisted
  } catch { /* corrupt state falls back to empty */ }
  return { locations: [], tracks: [] }
}

function save(state: Persisted) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch { /* quota exceeded: the map still works, it just won't persist */ }
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// Parse trkpt/rtept coordinates out of a GPX document. Long tracks are strided
// down to MAX_TRACK_POINTS so localStorage and the polyline stay lightweight.
function parseGpx(xml: string): { name: string | null; points: [number, number][] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('GPX inválido')
  const pts = Array.from(doc.querySelectorAll('trkpt, rtept'))
  const points: [number, number][] = []
  for (const p of pts) {
    const lat = Number(p.getAttribute('lat'))
    const lng = Number(p.getAttribute('lon'))
    if (Number.isFinite(lat) && Number.isFinite(lng)) points.push([lat, lng])
  }
  const stride = Math.ceil(points.length / MAX_TRACK_POINTS)
  const sampled = stride > 1 ? points.filter((_, i) => i % stride === 0) : points
  return { name: doc.querySelector('trk > name, metadata > name')?.textContent ?? null, points: sampled }
}

// Haversine length of a track, in km.
function trackKm(points: [number, number][]): number {
  let km = 0
  for (let i = 1; i < points.length; i++) {
    const [la1, lo1] = points[i - 1]!
    const [la2, lo2] = points[i]!
    const dLat = ((la2 - la1) * Math.PI) / 180
    const dLon = ((lo2 - lo1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
    km += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
  return km
}

export function MapsApp() {
  const initial = useMemo(load, [])
  const [locations, setLocations] = useState<SavedLocation[]>(initial.locations)
  const [tracks, setTracks] = useState<GpxTrack[]>(initial.tracks)
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => save({ locations, tracks }), [locations, tracks])

  // First mount: frame whatever data exists (tracks + locations together).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const all: [number, number][] = [
      ...initial.tracks.flatMap((t) => t.points),
      ...initial.locations.map((l) => [l.lat, l.lng] as [number, number]),
    ]
    if (all.length) map.fitBounds(L.latLngBounds(all), { padding: [40, 40] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addLocation(lat: number, lng: number) {
    if (!adding) return
    const loc: SavedLocation = { id: newId('loc'), name: 'Nueva ubicación', emoji: '📍', lat, lng }
    setLocations((ls) => [...ls, loc])
    setSelectedId(loc.id)
    setAdding(false)
  }

  function updateLocation(id: string, patch: Partial<SavedLocation>) {
    setLocations((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function removeLocation(id: string) {
    setLocations((ls) => ls.filter((l) => l.id !== id))
    setSelectedId((s) => (s === id ? null : s))
  }

  function flyToLocation(loc: SavedLocation) {
    setSelectedId(loc.id)
    mapRef.current?.flyTo([loc.lat, loc.lng], Math.max(mapRef.current.getZoom(), 13), { duration: 0.6 })
  }

  function fitTrack(track: GpxTrack) {
    if (track.points.length) mapRef.current?.fitBounds(L.latLngBounds(track.points), { padding: [40, 40] })
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    const added: GpxTrack[] = []
    for (const file of Array.from(files)) {
      try {
        const { name, points } = parseGpx(await file.text())
        if (!points.length) throw new Error('sin puntos de track')
        added.push({
          id: newId('gpx'),
          name: name || file.name.replace(/\.gpx$/i, ''),
          color: TRACK_COLORS[(tracks.length + added.length) % TRACK_COLORS.length] ?? '#e0645c',
          visible: true,
          points,
        })
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : 'no se pudo leer'}`)
      }
    }
    const first = added[0]
    if (first) {
      setTracks((ts) => [...ts, ...added])
      fitTrack(first)
    }
  }

  const panelBtn: React.CSSProperties = {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--fg-dim)',
    cursor: 'pointer',
    fontSize: 11,
    padding: '2px 6px',
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Sidebar: layers + locations */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: 14,
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          fontSize: 13,
          color: 'var(--fg)',
        }}
      >
        {/* GPX layers */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>Capas GPX</span>
            <button style={panelBtn} onClick={() => fileRef.current?.click()}>+ GPX</button>
            <input
              ref={fileRef}
              type="file"
              accept=".gpx"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { void handleFiles(e.target.files); e.target.value = '' }}
            />
          </div>
          {error && <div style={{ color: 'var(--danger, #e0645c)', fontSize: 11, marginBottom: 6 }}>{error}</div>}
          {tracks.length === 0 && <div style={{ color: 'var(--fg-faint)', fontSize: 12 }}>Sube un .gpx para verlo como capa.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tracks.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={t.visible}
                  onChange={() => setTracks((ts) => ts.map((x) => (x.id === t.id ? { ...x, visible: !x.visible } : x)))}
                />
                <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color, flexShrink: 0 }} />
                <button
                  onClick={() => fitTrack(t)}
                  title="Centrar en el mapa"
                  style={{ ...panelBtn, border: 'none', padding: 0, flex: 1, textAlign: 'left', color: 'var(--fg)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {t.name}
                </button>
                <span style={{ color: 'var(--fg-faint)', fontSize: 11 }}>{trackKm(t.points).toFixed(0)} km</span>
                <button style={panelBtn} title="Eliminar capa" onClick={() => setTracks((ts) => ts.filter((x) => x.id !== t.id))}>✕</button>
              </div>
            ))}
          </div>
        </section>

        {/* Saved locations */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>Ubicaciones</span>
            <button
              style={{ ...panelBtn, ...(adding ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : null) }}
              onClick={() => setAdding((v) => !v)}
            >
              {adding ? 'Haz clic en el mapa…' : '+ Ubicación'}
            </button>
          </div>
          {locations.length === 0 && !adding && (
            <div style={{ color: 'var(--fg-faint)', fontSize: 12 }}>Guarda paradas de tu ruta: aparecen como emojis sobre el mapa.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {locations.map((l) => (
              <div key={l.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => flyToLocation(l)}
                    style={{
                      ...panelBtn,
                      border: 'none',
                      padding: '3px 4px',
                      flex: 1,
                      textAlign: 'left',
                      fontSize: 13,
                      color: 'var(--fg)',
                      background: selectedId === l.id ? 'var(--bg-hover, rgba(127,127,127,0.12))' : 'transparent',
                      borderRadius: 6,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {l.emoji} {l.name}
                  </button>
                  <button style={panelBtn} title="Eliminar" onClick={() => removeLocation(l.id)}>✕</button>
                </div>

                {/* Inline editor for the selected location */}
                {selectedId === l.id && (
                  <div style={{ padding: '6px 4px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      value={l.name}
                      autoFocus
                      onChange={(e) => updateLocation(l.id, { name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedId(null)}
                      style={{
                        background: 'var(--bg, transparent)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        color: 'var(--fg)',
                        fontSize: 13,
                        padding: '4px 8px',
                        outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => updateLocation(l.id, { emoji: e })}
                          style={{
                            background: l.emoji === e ? 'var(--bg-hover, rgba(127,127,127,0.18))' : 'transparent',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 16,
                            padding: '2px 4px',
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Map */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative', cursor: adding ? 'crosshair' : undefined }}>
        <MapView
          mapRef={mapRef}
          markers={locations.map((l): MapMarker => ({ id: l.id, lat: l.lat, lng: l.lng, emoji: l.emoji, label: l.name }))}
          selectedId={selectedId}
          onMapClick={addLocation}
          onMarkerClick={setSelectedId}
          draggableMarkers
          onMarkerDrag={(id, lat, lng) => updateLocation(id, { lat, lng })}
        >
          {tracks.filter((t) => t.visible).map((t) => (
            <Polyline key={t.id} positions={t.points} pathOptions={{ color: t.color, weight: 4, opacity: 0.85 }} />
          ))}
        </MapView>

        {adding && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              color: 'var(--fg)',
              boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
            }}
          >
            Haz clic en el mapa para guardar la ubicación
          </div>
        )}
      </div>
    </div>
  )
}
