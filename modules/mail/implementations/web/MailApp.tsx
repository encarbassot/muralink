import { useCallback, useEffect, useRef, useState } from 'react'
import { CellMenu, type CellMenuItem } from '@muralink/ui'
import type { YMailFolder, YMailSetup } from '../../types.ts'
import { useMailStore } from './mailStore.ts'
import { mailSetupApi } from './setupApi.ts'
import { MailSetupWizard } from './MailSetupWizard.tsx'

export function MailApp() {
  const {
    folders,
    messages,
    currentFolderId,
    currentMessageId,
    loading,
    error,
    setFolders,
    setMessages,
    setCurrentFolder,
    setCurrentMessage,
    setError,
  } = useMailStore()

  // Setup state drives the empty screen: "no accounts yet" is the normal state
  // of a fresh instance, not an error. Only a dead/absent API is an error.
  const [setup, setSetup] = useState<YMailSetup | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null)
  const addBtn = useRef<HTMLButtonElement>(null)

  const loadSetup = useCallback(async () => {
    try {
      const s = await mailSetupApi.status()
      setSetup(s.setup)
      setError(null)
    } catch (err) {
      setSetup(null)
      setError(
        err instanceof Error && err.message === 'http_409'
          ? 'El módulo de correo no está instalado en esta instancia.'
          : 'Este servidor no expone la API de correo.',
      )
    }
  }, [setError])

  useEffect(() => { void loadSetup() }, [loadSetup])

  useEffect(() => {
    if (!setup?.configured) return
    void fetch('/api/mail/folders')
      .then(res => (res.ok ? res.json() : []))
      .then((data: YMailFolder[]) => {
        setFolders(data)
        const first = data[0]
        if (first) setCurrentFolder(first.id)
      })
      .catch(() => { /* configured but unreachable — the banner above already says so */ })
  }, [setup?.configured, setFolders, setCurrentFolder])

  useEffect(() => {
    if (!currentFolderId) return
    void fetch(`/api/mail/messages?folder=${currentFolderId}&limit=50`)
      .then(res => (res.ok ? res.json() : { messages: [] }))
      .then(data => setMessages(data.messages ?? []))
      .catch(() => setMessages([]))
  }, [currentFolderId, setMessages])

  function openMenu() {
    const r = addBtn.current?.getBoundingClientRect()
    if (!r) return
    setMenuAnchor({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }

  const menuItems: CellMenuItem[] = [
    {
      id: 'gmail',
      label: 'Gmail',
      icon: '📮',
      group: 'api',
      disabled: true,
      tag: 'pronto',
      hint: 'Requiere la API de Google — todavía no conectada.',
      onSelect: () => {},
    },
    {
      id: 'outlook',
      label: 'Outlook',
      icon: '📨',
      group: 'api',
      disabled: true,
      tag: 'pronto',
      hint: 'Requiere la API de Microsoft — todavía no conectada.',
      onSelect: () => {},
    },
    {
      id: 'local',
      label: 'Añadir cuenta local',
      icon: '🏠',
      group: 'local',
      tag: 'advanced',
      hint: 'Este servidor pasa a ser el servidor de correo de tu dominio.',
      onSelect: () => setWizardOpen(true),
    },
  ]

  const configured = !!setup?.configured

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--fg)' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>
          Correo
          {configured && (
            <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--fg-faint)', marginLeft: 8 }}>
              {setup?.address} {setup?.enabled ? '· activo' : '· configurado, sin activar'}
            </span>
          )}
        </div>
        <button
          ref={addBtn}
          onClick={openMenu}
          style={{
            padding: '5px 11px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-elevated)', color: 'var(--fg)', fontSize: 11, cursor: 'pointer',
          }}
        >
          + Añadir correo
        </button>
      </header>

      {error && (
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#ef4444', borderBottom: '1px solid var(--border)' }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside style={{ width: 170, borderRight: '1px solid var(--border)', padding: 8, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)', padding: '4px 6px' }}>
            Carpetas
          </div>
          {folders.length === 0 && <div style={{ fontSize: 11, color: 'var(--fg-faint)', padding: '4px 6px' }}>—</div>}
          {folders.map(folder => (
            <button
              key={folder.id}
              onClick={() => setCurrentFolder(folder.id)}
              style={{
                display: 'flex', width: '100%', gap: 6, alignItems: 'center',
                padding: '6px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
                textAlign: 'left',
                background: currentFolderId === folder.id ? 'var(--bg-elevated)' : 'transparent',
                color: 'var(--fg)',
              }}
            >
              <span style={{ flex: 1 }}>{folder.name}</span>
              {folder.unreadCount > 0 && <span style={{ fontSize: 10, fontWeight: 700 }}>{folder.unreadCount}</span>}
            </button>
          ))}
        </aside>

        <section style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          {!configured ? (
            <EmptyState onAdd={openMenu} />
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', borderRight: currentMessageId ? '1px solid var(--border)' : 'none' }}>
                {loading && <div style={{ padding: 14, fontSize: 12, color: 'var(--fg-faint)' }}>Cargando…</div>}
                {!loading && messages.length === 0 && (
                  <div style={{ padding: 14, fontSize: 12, color: 'var(--fg-faint)' }}>
                    Sin mensajes.{' '}
                    {!setup?.enabled && 'La cuenta está configurada pero el servicio no está activo todavía.'}
                  </div>
                )}
                {messages.map(msg => (
                  <button
                    key={msg.id}
                    onClick={() => setCurrentMessage(msg.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                      borderBottom: '1px solid var(--border)', border: 'none', cursor: 'pointer',
                      background: currentMessageId === msg.id ? 'var(--bg-elevated)' : 'transparent', color: 'var(--fg)',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.subject || '(sin asunto)'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{msg.from}</div>
                    <div style={{ fontSize: 10, color: 'var(--fg-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.body?.substring(0, 100)}
                    </div>
                  </button>
                ))}
              </div>
              {currentMessageId && (
                <div style={{ width: 340, padding: 14, overflowY: 'auto' }}>
                  <p style={{ fontSize: 12, color: 'var(--fg-faint)' }}>Lector de mensaje: pendiente.</p>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {menuAnchor && <CellMenu items={menuItems} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} />}
      {wizardOpen && (
        <MailSetupWizard
          onClose={() => { setWizardOpen(false); void loadSetup() }}
          onDone={s => setSetup(s)}
        />
      )}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 380, textAlign: 'center', display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 26 }}>✉️</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Todavía no hay ninguna cuenta</div>
        <p style={{ fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.6, margin: 0 }}>
          Conecta un proveedor (pronto) o convierte este servidor en tu propio servidor de correo con un dominio
          que controles.
        </p>
        <div>
          <button
            onClick={onAdd}
            style={{
              padding: '6px 13px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--fg)', color: 'var(--bg)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Añadir correo
          </button>
        </div>
      </div>
    </div>
  )
}
