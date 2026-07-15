// Root TUI component. Owns the daemon connection + a small screen/menu stack.
// Navigation: ↑/↓ move, Enter select/toggle, Esc back (or quit at the root).

import { useEffect, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { ensureDaemon, type OrchesterClient } from '../client'
import type { ManagedService } from '../orchester'
import { Dashboard } from './Dashboard'
import { ServiceActions } from './ServiceActions'
import { Configure } from './Configure'
import { StatusBar, type Shortcut } from './StatusBar'
import { Spinner } from './Spinner'

type Screen =
  | { name: 'dashboard' }
  | { name: 'actions'; serviceId: string }
  | { name: 'configure'; serviceId: string }

export function App() {
  const { exit } = useApp()
  const [client, setClient] = useState<OrchesterClient | null>(null)
  const [services, setServices] = useState<ManagedService[]>([])
  const [stack, setStack] = useState<Screen[]>([{ name: 'dashboard' }])
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const screen = stack[stack.length - 1]!

  // Transient status-bar note (e.g. "Copied"), auto-clears.
  const flash = (msg: string) => {
    setNote(msg)
    setTimeout(() => setNote(null), 1500)
  }

  useEffect(() => {
    let unsub: (() => void) | undefined
    ensureDaemon()
      .then((c) => {
        setClient(c)
        unsub = c.subscribe((s) => setServices(s))
      })
      .catch((e) => setError(String(e)))
    return () => {
      unsub?.()
      client?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Global quit on Ctrl+C / q at the root.
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      client?.close()
      exit()
    }
  })

  const push = (s: Screen) => setStack((st) => [...st, s])
  const pop = () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st))
  const quit = () => {
    client?.close()
    exit()
  }

  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">orchester error: {error}</Text>
        <Text dimColor>Press Ctrl+C to exit.</Text>
      </Box>
    )
  }

  if (!client) {
    return (
      <Box padding={1}>
        <Spinner color="cyan" />
        <Text> Connecting to orchester daemon…</Text>
      </Box>
    )
  }

  const toggle = (id: string) => {
    const s = services.find((x) => x.id === id)
    if (!s) return
    if (s.status === 'running' || s.status === 'starting') void client.stop(id)
    else void client.start(id)
  }

  const shortcuts: Shortcut[] =
    screen.name === 'dashboard'
      ? [{ key: '↑↓', label: 'select' }, { key: '↵', label: 'open' }, { key: 'Space', label: 'start/stop' }, { key: 'Q', label: 'quit' }]
      : screen.name === 'actions'
        ? [{ key: '←→', label: 'choose' }, { key: '↵', label: 'run' }, { key: 'C', label: 'copy log' }, { key: 'Esc', label: 'back' }]
        : [{ key: '↑↓', label: 'field' }, { key: '↵', label: 'save' }, { key: 'Esc', label: 'cancel' }]

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">elio · orchester</Text>
      </Box>

      {screen.name === 'dashboard' && (
        <Dashboard
          services={services}
          onSelectService={(id) => push({ name: 'actions', serviceId: id })}
          onToggle={toggle}
          onQuit={quit}
        />
      )}

      {screen.name === 'actions' && (
        <ServiceActions
          service={services.find((s) => s.id === screen.serviceId)}
          client={client}
          onConfigure={() => push({ name: 'configure', serviceId: screen.serviceId })}
          onCopied={() => flash('Copied log to clipboard')}
          onBack={pop}
        />
      )}

      {screen.name === 'configure' && (
        <Configure
          service={services.find((s) => s.id === screen.serviceId)}
          client={client}
          onDone={pop}
        />
      )}

      <StatusBar shortcuts={shortcuts} note={note ?? undefined} />
    </Box>
  )
}
