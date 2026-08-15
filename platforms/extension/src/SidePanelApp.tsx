// Side panel top level: launcher (an ActionRow of the registry's modules —
// dogfooding the new atoms), the vertical stack of temporary cards, and the
// cloud auth gate. The panel page is destroyed whenever it closes — data lives
// in IndexedDB/cloud, only the open-card list survives via localStorage.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CellContext } from '@muralink/shell'
import { ActionButton, ActionRow, Button, Input } from '@muralink/ui'
import type { GridCellRecord } from '@muralink/types'
import { buildExtensionRegistry } from './cards.tsx'
import { SidePanelCard } from './SidePanelCard.tsx'
import { CLOUD_ORIGIN, clearAccountToken, fetchMe, getAccountToken, login, logout, setAccountToken, type Account } from './account.ts'
import { installCloudVault, uninstallCloudVault } from './cloudVault.ts'

const CARDS_KEY = 'muralink_ext_cards'

interface OpenCard {
  id: string
  moduleId: string
  props?: Record<string, unknown>
}

function loadCards(): OpenCard[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY)
    return raw ? (JSON.parse(raw) as OpenCard[]) : []
  } catch {
    return []
  }
}

function toCell(c: OpenCard): GridCellRecord {
  return {
    id: c.id,
    viewSpecId: c.moduleId,
    moduleId: c.moduleId,
    position: { col: 0, row: 0 },
    size: '2x2',
    ...(c.props ? { props: c.props } : {}),
  }
}

export function SidePanelApp() {
  const registry = useMemo(() => buildExtensionRegistry(), [])
  const [cards, setCards] = useState<OpenCard[]>(loadCards)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const nextId = useRef(1)

  // Persist the open-card list (ids + props only).
  useEffect(() => {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards))
  }, [cards])

  // Auth gate: validate any stored token, then wire the cloud spaces.
  useEffect(() => {
    const token = getAccountToken()
    if (!token) return
    void fetchMe(token).then((me) => {
      if (me) {
        setAccount(me)
        installCloudVault(token, CLOUD_ORIGIN)
      } else {
        clearAccountToken()
      }
    })
  }, [])

  async function handleLogin() {
    setAuthError(null)
    try {
      const { token, user } = await login(email, password)
      setAccountToken(token)
      setAccount(user)
      setPassword('')
      installCloudVault(token, CLOUD_ORIGIN)
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Error')
    }
  }
  function handleLogout() {
    const token = getAccountToken()
    if (token) void logout(token)
    clearAccountToken()
    uninstallCloudVault()
    setAccount(null)
  }

  function openCard(moduleId: string) {
    const id = `card-${Date.now()}-${nextId.current++}`
    setCards((prev) => [{ id, moduleId }, ...prev])
    setFocusedId(id)
  }
  function closeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id))
    if (focusedId === id) setFocusedId(null)
  }
  function updateCell(cellId: string, patch: Partial<GridCellRecord>) {
    setCards((prev) =>
      prev.map((c) => (c.id === cellId ? { ...c, ...(patch.props !== undefined ? { props: patch.props as Record<string, unknown> } : {}) } : c)),
    )
  }

  const ctxFor = (id: string): CellContext => ({
    focused: focusedId === id,
    updateCell,
  })

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setFocusedId(null)
      }}
    >
      {/* Launcher — an ActionRow of the registry's modules. */}
      <div style={{ borderBottom: '1px solid var(--border, #262c34)', display: 'flex', justifyContent: 'center' }}>
        <ActionRow edge="top" contextView="launcher">
          {registry.list().map((d) => (
            <ActionButton
              key={d.moduleId}
              id={`launch-${d.moduleId}`}
              title={d.label}
              label={<span style={{ fontSize: 12, color: 'var(--fg, #e6e9ee)' }}>{d.label}</span>}
              onActivate={() => openCard(d.moduleId)}
            >
              {d.icon}
            </ActionButton>
          ))}
        </ActionRow>
      </div>

      {/* Card stack. */}
      <div
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28, padding: '16px 12px 40px' }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setFocusedId(null)
        }}
      >
        {cards.length === 0 && (
          <div style={{ color: 'var(--fg-faint, #6b7280)', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>
            Abre una app con los botones de arriba
          </div>
        )}
        {cards.map((c) => (
          <SidePanelCard
            key={c.id}
            cell={toCell(c)}
            registry={registry}
            ctx={ctxFor(c.id)}
            focused={focusedId === c.id}
            onFocus={() => setFocusedId(c.id)}
            onClose={() => closeCard(c.id)}
          />
        ))}
      </div>

      {/* Auth footer. */}
      <div style={{ borderTop: '1px solid var(--border, #262c34)', padding: 10, fontSize: 12 }}>
        {account ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, color: 'var(--fg-dim, #b7bfc9)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ☁️ {account.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Salir</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ color: 'var(--fg-faint, #6b7280)' }}>Local — inicia sesión para sincronizar tu vault</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" type="email" />
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="contraseña" type="password" />
              <Button size="sm" onClick={() => void handleLogin()}>Entrar</Button>
            </div>
            {authError && <div style={{ color: 'var(--danger, #f87171)' }}>{authError}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
