// Account screen — link this orchester to a muralink account and share local
// folders through the tunnel. Same minimal inline editing as Configure: ↑/↓
// move, Enter select/save, Esc back. Login is OTP-only: the user generates a
// one-time code in the cloud frontend (account menu → Link device) and types it
// here — no password ever touches this machine.

import { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { OrchesterClient } from '../client'
import type { AccountStatus } from '../account'
import { Spinner } from './Spinner'

interface Props {
  client: OrchesterClient
  onFlash: (msg: string) => void
  onBack: () => void
}

const DEFAULT_TUNNEL = process.env['MURALINK_CLOUD_URL'] ?? 'https://app.mural.ink'

type Mode =
  | { name: 'menu' }
  | { name: 'login' }
  | { name: 'share' }
  | { name: 'shares' }

interface TunnelShare { pathLabel: string; rootPath: string; role: string; url?: string }

export function Account({ client, onFlash, onBack }: Props) {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [mode, setMode] = useState<Mode>({ name: 'menu' })
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shares, setShares] = useState<TunnelShare[]>([])

  // Field editors (login + share) — plain string maps keep the key-handler generic.
  const [loginFields, setLoginFields] = useState<Record<string, string>>({ url: DEFAULT_TUNNEL, code: '', label: 'mi portátil' })
  const [loginField, setLoginField] = useState(0)
  const [shareFields, setShareFields] = useState<Record<string, string>>({ path: '', label: '', email: '' })
  const [shareField, setShareField] = useState(0)

  const refresh = () => {
    void client.accountStatus().then(setStatus).catch((e) => setError(String(e)))
    void client.tunnelShares().then(setShares).catch(() => setShares([]))
  }
  useEffect(refresh, [client])

  const linked = status?.linked === true
  const menuItems: { label: string; run: () => void }[] = linked
    ? [
        { label: '⇪ Compartir carpeta…', run: () => { setShareField(0); setError(null); setMode({ name: 'share' }) } },
        { label: `☁ Shares activos (${shares.length})`, run: () => setMode({ name: 'shares' }) },
        { label: '⏻ Cerrar sesión', run: () => { setBusy(true); void client.accountLogout().then(() => { setBusy(false); refresh(); onFlash('Sesión cerrada') }) } },
      ]
    : [
        { label: '🔑 Login con código (OTP)…', run: () => { setLoginField(0); setError(null); setMode({ name: 'login' }) } },
      ]

  useInput((input, key) => {
    if (busy) return

    if (mode.name === 'menu') {
      if (key.escape) { onBack(); return }
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
      else if (key.downArrow) setCursor((c) => Math.min(menuItems.length - 1, c + 1))
      else if (key.return) menuItems[Math.min(cursor, menuItems.length - 1)]?.run()
      return
    }

    if (mode.name === 'shares') {
      if (key.escape || key.return) setMode({ name: 'menu' })
      return
    }

    // login / share: field editors
    const isLogin = mode.name === 'login'
    const fields = isLogin ? (['url', 'code', 'label'] as const) : (['path', 'label', 'email'] as const)
    const fieldIdx = isLogin ? loginField : shareField
    const setFieldIdx = isLogin ? setLoginField : setShareField

    if (key.escape) { setMode({ name: 'menu' }); return }
    if (key.upArrow) { setFieldIdx((f) => Math.max(0, f - 1)); return }
    if (key.downArrow) { setFieldIdx((f) => Math.min(fields.length - 1, f + 1)); return }
    if (key.return) {
      setBusy(true)
      setError(null)
      if (isLogin) {
        client
          .accountLoginOtp({ tunnelBaseUrl: (loginFields['url'] ?? '').trim(), code: loginFields['code'] ?? '', label: (loginFields['label'] ?? '').trim() || 'orchester' })
          .then(() => { setMode({ name: 'menu' }); setCursor(0); refresh(); onFlash('Cuenta vinculada ✓') })
          .catch((e) => setError(String(e)))
          .finally(() => setBusy(false))
      } else {
        const path = (shareFields['path'] ?? '').trim()
        client
          .tunnelShare({
            rootPath: path,
            pathLabel: (shareFields['label'] ?? '').trim() || path,
            role: 'viewer',
            targetEmail: (shareFields['email'] ?? '').trim() || null,
          })
          .then(({ url }) => { setMode({ name: 'menu' }); refresh(); onFlash(`Compartido → ${url}`) })
          .catch((e) => setError(String(e)))
          .finally(() => setBusy(false))
      }
      return
    }
    const k = fields[fieldIdx]!
    const setter = isLogin ? setLoginFields : setShareFields
    if (key.backspace || key.delete) {
      setter((v) => ({ ...v, [k]: (v[k] ?? '').slice(0, -1) }))
      return
    }
    if (input && !key.ctrl && !key.meta) {
      setter((v) => ({ ...v, [k]: (v[k] ?? '') + input }))
    }
  })

  if (!status) {
    return <Box><Spinner color="cyan" /><Text> Cargando cuenta…</Text></Box>
  }

  return (
    <Box flexDirection="column">
      <Text bold>Cuenta muralink</Text>
      <Box marginTop={1} flexDirection="column">
        {linked ? (
          <Text>
            <Text color="green">●</Text> {status.email}  <Text dimColor>({status.online ? 'túnel conectado' : 'túnel desconectado'} · {status.tunnelBaseUrl})</Text>
          </Text>
        ) : (
          <Text dimColor>○ Sin vincular — genera un código en {DEFAULT_TUNNEL} (menú de cuenta → Vincular dispositivo) y úsalo aquí.</Text>
        )}
      </Box>

      {mode.name === 'menu' && (
        <Box flexDirection="column" marginTop={1}>
          {menuItems.map((it, i) => (
            <Text key={it.label} inverse={i === Math.min(cursor, menuItems.length - 1)}>
              {'  '}{it.label}{'  '}
            </Text>
          ))}
        </Box>
      )}

      {mode.name === 'login' && (
        <Box flexDirection="column" marginTop={1}>
          {(['url', 'code', 'label'] as const).map((f, i) => (
            <Text key={f}>
              {i === loginField ? '▸ ' : '  '}
              {f === 'url' ? 'Servidor ' : f === 'code' ? 'Código   ' : 'Nombre   '}
              <Text inverse={i === loginField}>{loginFields[f] || ' '}</Text>
            </Text>
          ))}
          <Text dimColor>Enter = vincular · Esc = cancelar</Text>
        </Box>
      )}

      {mode.name === 'share' && (
        <Box flexDirection="column" marginTop={1}>
          {(['path', 'label', 'email'] as const).map((f, i) => (
            <Text key={f}>
              {i === shareField ? '▸ ' : '  '}
              {f === 'path' ? 'Carpeta      ' : f === 'label' ? 'Nombre       ' : 'Email (opc.) '}
              <Text inverse={i === shareField}>{shareFields[f] || ' '}</Text>
            </Text>
          ))}
          <Text dimColor>Email vacío = enlace público · Enter = compartir · Esc = cancelar</Text>
        </Box>
      )}

      {mode.name === 'shares' && (
        <Box flexDirection="column" marginTop={1}>
          {shares.length === 0 && <Text dimColor>No hay shares activos.</Text>}
          {shares.map((s) => (
            <Text key={s.rootPath + s.pathLabel}>
              ⇪ {s.pathLabel} <Text dimColor>({s.rootPath})</Text> → <Text color="cyan">{s.url ?? 'registrando…'}</Text>
            </Text>
          ))}
          <Text dimColor>Esc = volver</Text>
        </Box>
      )}

      {busy && <Box marginTop={1}><Spinner color="cyan" /><Text> Trabajando…</Text></Box>}
      {error && <Box marginTop={1}><Text color="red">{error}</Text></Box>}
    </Box>
  )
}
