import { useEffect, useState } from 'react'
import { CellHeader } from '@muralink/ui'
import { useVault, type DecryptedEntry } from '../vaultStore.ts'

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border, #d4cfc9)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
  background: 'var(--background, #f9f7f4)',
  boxSizing: 'border-box',
}

const buttonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  background: 'var(--accent, #b5936a)',
  color: '#fff',
}

const ghostButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 11,
  color: 'var(--muted-foreground, #6b6560)',
}

function PinGate({
  mode,
  error,
  onSetup,
  onUnlock,
}: {
  mode: 'setup' | 'unlock'
  error?: string
  onSetup: (pin: string, confirm: string) => void
  onUnlock: (pin: string) => void
}) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)
  const ready = mode === 'setup' ? pin.length === 6 && confirm.length === 6 : pin.length === 6

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 16,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 24 }}>🔒</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>
        {mode === 'setup' ? 'Crea el PIN de la bóveda' : 'Bóveda bloqueada'}
      </div>
      {mode === 'setup' && (
        <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)', maxWidth: 220 }}>
          6 dígitos. Si lo pierdes, es imposible recuperar los datos guardados.
        </div>
      )}
      <input
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(digits(e.target.value))}
        placeholder="PIN"
        style={{ ...inputStyle, textAlign: 'center', letterSpacing: 4, maxWidth: 140 }}
      />
      {mode === 'setup' && (
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(digits(e.target.value))}
          placeholder="Repite el PIN"
          style={{ ...inputStyle, textAlign: 'center', letterSpacing: 4, maxWidth: 140 }}
        />
      )}
      {error && <div style={{ fontSize: 11, color: '#c0392b' }}>{error}</div>}
      <button
        disabled={!ready}
        onClick={() => (mode === 'setup' ? onSetup(pin, confirm) : onUnlock(pin))}
        style={{ ...buttonStyle, opacity: ready ? 1 : 0.5, maxWidth: 140, width: '100%' }}
      >
        {mode === 'setup' ? 'Crear bóveda' : 'Desbloquear'}
      </button>
    </div>
  )
}

function EntryRow({ entry, onRemove }: { entry: DecryptedEntry; onRemove: () => void }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '10px 12px',
        borderBottom: '1px solid var(--border, #d4cfc9)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.url}
        </div>
        <button onClick={onRemove} style={{ ...ghostButtonStyle, fontSize: 13 }} aria-label="Eliminar">
          ✕
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)' }}>{entry.username}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ fontSize: 12, fontFamily: 'monospace', minWidth: 90 }}>
          {revealed ? entry.password : '•'.repeat(Math.max(entry.password.length, 8))}
        </div>
        <button onClick={() => setRevealed((r) => !r)} style={ghostButtonStyle}>
          {revealed ? 'ocultar' : 'ver'}
        </button>
        <button onClick={() => navigator.clipboard.writeText(entry.password)} style={ghostButtonStyle}>
          copiar
        </button>
      </div>
    </div>
  )
}

export function PasswordVault() {
  const { hasVault, unlocked, error, entries, init, setup, unlock, lock, add, remove } = useVault()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ url: '', username: '', password: '' })

  useEffect(() => {
    init()
  }, [])

  if (!hasVault) {
    return <PinGate mode="setup" error={error} onSetup={(pin, confirm) => void setup(pin, confirm)} onUnlock={() => {}} />
  }
  if (!unlocked) {
    return <PinGate mode="unlock" error={error} onSetup={() => {}} onUnlock={(pin) => void unlock(pin)} />
  }

  async function submitAdd() {
    if (!form.url || !form.username || !form.password) return
    await add(form)
    setForm({ url: '', username: '', password: '' })
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <CellHeader
        title={`🔐 Bóveda (${entries.length})`}
        actions={
          <>
            <button onClick={() => setAdding((a) => !a)} style={{ ...buttonStyle, padding: '4px 8px' }}>
              {adding ? 'Cancelar' : '+ Añadir'}
            </button>
            <button
              onClick={lock}
              style={{ ...buttonStyle, background: 'var(--border, #d4cfc9)', color: 'inherit', padding: '4px 8px' }}
            >
              Bloquear
            </button>
          </>
        }
      />

      {adding && (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderBottom: '1px solid var(--border, #d4cfc9)' }}
        >
          <input placeholder="URL" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} style={inputStyle} />
          <input
            placeholder="Usuario"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            style={inputStyle}
          />
          <button onClick={() => void submitAdd()} style={buttonStyle}>
            Guardar
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} onRemove={() => void remove(e.id)} />
        ))}
        {entries.length === 0 && !adding && (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Bóveda vacía</div>
        )}
      </div>
    </div>
  )
}
