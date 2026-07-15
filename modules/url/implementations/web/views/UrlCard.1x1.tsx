// UrlCard — minimal 1x1 view for a YUrl. Shows the domain, links to the url.
// A module never knows where it is rendered: this reads its data from
// ModuleContext.storage and stays platform-agnostic past the React import.

import type { ModuleContext, YUrl } from '@muralink/types'
import { useEffect, useState } from 'react'

interface UrlCardProps {
  context: ModuleContext
  instanceId: string
}

export function UrlCard({ context, instanceId }: UrlCardProps) {
  const [url, setUrl] = useState<YUrl | null>(null)

  useEffect(() => {
    // Offline-first: storage is always local; no network in a view.
    context.storage.get(`url/${instanceId}`).then((value) => {
      setUrl((value as YUrl) ?? null)
    })
  }, [context, instanceId])

  if (!url) return <div className="url-card url-card--empty">—</div>

  return (
    <a className="url-card" href={url.normalized} target="_blank" rel="noreferrer">
      <span className="url-card__domain">{url.domain}</span>
    </a>
  )
}
