// Acceptance test for docs/integrations/bikehunter/INTEGRATION.md — this file
// is (deliberately) the same code the guide tells BikeHunter to write, plus a
// fake Turbo navigation to prove idempotent mounting.

import { createRoot } from 'react-dom/client'
import { MuralBoard, MuralDashboard, type MuralUser } from '@muralink/embed'

function readMeta(name: string): string | null {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null
}

function mount() {
  const el = document.getElementById('elio-pinboard-root')
  if (!el || el.dataset['mounted']) return // idempotent (Turbo)
  el.dataset['mounted'] = 'true'

  const user = JSON.parse(readMeta('pinboard-user') ?? 'null') as MuralUser | null
  const token = readMeta('elio-token')
  // Dev: talk straight to the local core server. In production this is '/elio'
  // behind nginx (same-origin).
  const baseUrl = new URLSearchParams(location.search).get('api') ?? 'http://localhost:3001'

  const spaces = token ? { orchester: { baseUrl, token, label: 'Servidor' } } : undefined
  const mode = new URLSearchParams(location.search).get('mode')

  createRoot(el).render(
    mode === 'grid' ? (
      <MuralDashboard
        theme="light"
        user={user ?? undefined}
        spaces={spaces}
        storageKey={`pb:${user?.id ?? 'anon'}:board`}
      />
    ) : (
      <MuralBoard theme="light" user={user ?? undefined} spaces={spaces} />
    ),
  )
}

mount()

// ── Host-sim chrome (not part of the integration guide) ──────────────────────

document.getElementById('pad')?.addEventListener('click', () => {
  document.getElementById('drawer')?.classList.toggle('open')
})

// Fake Turbo: replace <main>, re-run mount(). The pinboard root is
// data-turbo-permanent in the real app; here we just prove mount() is a no-op
// the second time and the React tree survives.
document.getElementById('turbo-visit')?.addEventListener('click', () => {
  const main = document.querySelector('.bh-main')
  if (main) main.innerHTML = `<div class="bh-card"><h2>Otra página (${new Date().toLocaleTimeString()})</h2><p>Simulated turbo:load — Mural no se re-monta.</p></div>`
  mount()
})
