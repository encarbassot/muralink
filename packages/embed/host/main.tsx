import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MuralBoard, type MuralBoardProps, type MuralUser } from '@muralink/embed'

// Standalone iframe host. A closed product embeds Mural with full isolation:
//
//   <iframe src="https://embed.elio.dev/?theme=light&tabs=notes,contacts" />
//
// Configure via query params — no build needed on the host side:
//   theme=dark|light              colour scheme
//   tabs=notes,reminders,contacts,calendar   restrict to a subset
//   initialTab=notes              which module opens first
//   api=<base>&token=<t>          add the company server ("orchester") space
//   user=<url-encoded JSON>       {"id","name","role","color"} for attribution
//
// Everything runs local-first inside the iframe's own IndexedDB; the server
// space only receives items the user saves/moves there.

const q = new URLSearchParams(location.search)

const theme = q.get('theme') === 'light' ? 'light' : 'dark'
const tabs = q.get('tabs')?.split(',').map((t) => t.trim()) as MuralBoardProps['tabs'] | undefined
const initialTab = (q.get('initialTab') ?? undefined) as MuralBoardProps['initialTab']

let user: MuralUser | undefined
try {
  const raw = q.get('user')
  if (raw) user = JSON.parse(raw) as MuralUser
} catch {
  console.warn('[elio-embed] invalid user param — expected URL-encoded JSON')
}

const api = q.get('api')
const token = q.get('token')
const spaces =
  api !== null && token
    ? { orchester: { baseUrl: api, token, label: q.get('spaceLabel') ?? undefined } }
    : undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MuralBoard theme={theme} tabs={tabs} initialTab={initialTab} user={user} spaces={spaces} />
  </StrictMode>,
)
