// MapView: the reusable, prop-driven Leaflet surface behind MapsApp.
// State-free — the host owns markers/data. This is the component other
// modules embed (e.g. modules/contacts) instead of the full Playground app.

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L, { type Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  emoji?: string
  label?: string
  color?: string
}

export interface MapViewProps {
  markers: MapMarker[]
  cluster?: boolean
  center?: [number, number]
  zoom?: number
  selectedId?: string | null
  onMarkerClick?: (id: string) => void
  onMapClick?: (lat: number, lng: number) => void
  draggableMarkers?: boolean
  onMarkerDrag?: (id: string, lat: number, lng: number) => void
  fitToMarkers?: boolean
  children?: React.ReactNode
  /** Host-owned ref to the underlying Leaflet map, for imperative control (flyTo, fitBounds…). */
  mapRef?: React.RefObject<LeafletMap | null>
}

const DEFAULT_CENTER: [number, number] = [41.3874, 2.1686]

export function markerIcon(marker: MapMarker, selected: boolean) {
  const label = marker.emoji ?? '📍'
  return L.divIcon({
    className: '',
    html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45));transform:scale(${selected ? 1.25 : 1});transition:transform 120ms">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 26],
  })
}

// Bridges map click events to the host.
function ClickCapture({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) })
  return null
}

export function MapView({
  markers,
  center,
  zoom = 6,
  selectedId = null,
  onMarkerClick,
  onMapClick,
  draggableMarkers = false,
  onMarkerDrag,
  fitToMarkers = false,
  children,
  mapRef: externalMapRef,
}: MapViewProps) {
  const internalMapRef = useRef<LeafletMap | null>(null)
  const mapRef = externalMapRef ?? internalMapRef

  // On mount (and whenever fitToMarkers is requested), frame all markers.
  useEffect(() => {
    if (!fitToMarkers) return
    const map = mapRef.current
    if (!map || markers.length === 0) return
    const all: [number, number][] = markers.map((m) => [m.lat, m.lng])
    map.fitBounds(L.latLngBounds(all), { padding: [40, 40] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToMarkers, markers.length])

  return (
    <MapContainer ref={mapRef} center={center ?? DEFAULT_CENTER} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickCapture onPick={onMapClick} />
      {children}
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={markerIcon(m, selectedId === m.id)}
          draggable={draggableMarkers}
          eventHandlers={{
            click: () => onMarkerClick?.(m.id),
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng()
              onMarkerDrag?.(m.id, p.lat, p.lng)
            },
          }}
        >
          {m.label && <Popup>{m.emoji} {m.label}</Popup>}
        </Marker>
      ))}
    </MapContainer>
  )
}
