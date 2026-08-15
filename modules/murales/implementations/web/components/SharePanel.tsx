// Share menu for a mural — every option in one popover. V1: read-only shares.
//   · Enlace público: one stable link anyone can open.
//   · Cuentas mural.ink: grant specific accounts, kept as a growing list.
// Renders only when the host injected a sharing implementation.

import { useEffect, useState } from 'react'
import { useMurales } from '../muralesStore.ts'
import { getMuralSharing, type MuralShareEntry } from '../sharing.ts'

interface Props {
  muralId: string
  onClose: () => void
}

export function SharePanel({ muralId, onClose }: Props) {
  const sharing = getMuralSharing()
  const [shares, setShares] = useState<MuralShareEntry[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mural = useMurales((s) => s.murales.find((m) => m.id === muralId))
  const moveMural = useMurales((s) => s.moveMural)

  const load = () => {
    sharing?.list(muralId)
      .then(setShares)
      .catch(() => setError('No se pudieron cargar los enlaces.'))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [muralId])

  if (!sharing) return null
  const publicShare = shares?.find((s) => s.targetEmail === null) ?? null
  const accountShares = shares?.filter((s) => s.targetEmail !== null) ?? []

  // Guests read the mural from the host space (e.g. your cloud core) — a mural
  // living only in this browser must move there before sharing makes sense.
  const needsMove = Boolean(
    sharing.requiredSpaceId && mural && (mural.spaceId ?? 'local') !== sharing.requiredSpaceId,
  )

  if (needsMove) {
    return (
      <div className="mural-share-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div className="mural-share-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>Compartir mural</span>
            <button className="mural-tool-btn" title="Cerrar" onClick={onClose}>✕</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
            Este mural vive solo en este navegador. Para compartirlo tiene que
            guardarse en tu espacio, donde los invitados puedan leerlo.
          </div>
          <button
            className="mural-add-btn"
            disabled={busy}
            onClick={() => void run(() => moveMural(muralId, sharing.requiredSpaceId!))}
          >
            Mover a tu espacio y continuar
          </button>
          {error && <div style={{ fontSize: 11, color: '#f87171' }}>{error}</div>}
        </div>
      </div>
    )
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try { await fn(); load() }
    catch { setError('No se pudo completar la operación.') }
    finally { setBusy(false) }
  }

  function copy(share: MuralShareEntry) {
    void navigator.clipboard.writeText(sharing!.urlFor(share.token)).then(() => {
      setCopiedId(share.id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  return (
    <div className="mural-share-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mural-share-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>Compartir mural</span>
          <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>solo lectura</span>
          <button className="mural-tool-btn" title="Cerrar" onClick={onClose}>✕</button>
        </div>

        {/* Public link */}
        <div className="mural-share-section">
          <div className="mural-share-label">Enlace</div>
          {publicShare ? (
            <div className="mural-share-row">
              <input readOnly value={sharing.urlFor(publicShare.token)} onFocus={(e) => e.currentTarget.select()} />
              <button className="mural-tool-btn" title="Copiar enlace" onClick={() => copy(publicShare)}>
                {copiedId === publicShare.id ? '✅' : '📋'}
              </button>
              <button
                className="mural-tool-btn danger"
                title="Revocar enlace"
                disabled={busy}
                onClick={() => void run(() => sharing.remove(publicShare.id))}
              >
                🗑️
              </button>
            </div>
          ) : (
            <button
              className="mural-add-btn"
              disabled={busy || shares === null}
              onClick={() => void run(() => sharing.create(muralId))}
            >
              + Crear enlace público
            </button>
          )}
        </div>

        {/* Account grants */}
        <div className="mural-share-section">
          <div className="mural-share-label">Cuentas mural.ink</div>
          {accountShares.map((s) => (
            <div key={s.id} className="mural-share-row">
              <span style={{ flex: 1, fontSize: 12, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.targetEmail}
              </span>
              <button className="mural-tool-btn" title="Copiar su enlace" onClick={() => copy(s)}>
                {copiedId === s.id ? '✅' : '📋'}
              </button>
              <button
                className="mural-tool-btn danger"
                title="Quitar acceso"
                disabled={busy}
                onClick={() => void run(() => sharing.remove(s.id))}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="mural-share-row">
            <input
              type="email"
              placeholder="cuenta@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email.trim()) {
                  void run(() => sharing.create(muralId, email.trim())).then(() => setEmail(''))
                }
              }}
            />
            <button
              className="mural-tool-btn"
              title="Añadir cuenta"
              disabled={busy || !email.trim()}
              onClick={() => void run(() => sharing.create(muralId, email.trim())).then(() => setEmail(''))}
            >
              ➕
            </button>
          </div>
        </div>

        {error && <div style={{ fontSize: 11, color: '#f87171' }}>{error}</div>}
      </div>
    </div>
  )
}
