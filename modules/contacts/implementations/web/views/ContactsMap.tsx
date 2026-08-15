// Full-width map view for the "Mapa" tab: every contact with a placed location,
// as pins on an embedded @muralink/module-maps MapView. Clicking a pin opens
// that contact's detail (same navigation as the list).

import { useMemo } from 'react'
import { MapView, type MapMarker } from '@muralink/module-maps/web'
import type { YContact } from '../../../types.ts'

interface Props {
  contacts: YContact[]
  onSelect: (id: string) => void
  selectedId?: string
}

export function ContactsMap({ contacts, onSelect, selectedId }: Props) {
  const markers = useMemo<MapMarker[]>(
    () =>
      contacts
        .filter((c) => c.location?.point)
        .map((c) => ({
          id: c.id,
          lat: c.location!.point!.lat,
          lng: c.location!.point!.lon,
          emoji: '👤',
          label: c.name,
        })),
    [contacts],
  )

  if (markers.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>
        Ningún contacto tiene ubicación todavía — ábrelo y colócala en la pestaña de detalle.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <MapView
        markers={markers}
        cluster={markers.length > 20}
        selectedId={selectedId ?? null}
        onMarkerClick={onSelect}
        fitToMarkers
      />
    </div>
  )
}
