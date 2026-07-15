// Service detail screen: actions laid out as a row (start / stop / restart /
// configure) with a live log panel below. ←/→ move between actions, Enter runs,
// Esc goes back.

import { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ManagedService } from '../orchester'
import type { OrchesterClient } from '../client'
import { copyToClipboard } from './clipboard'

interface Props {
  service: ManagedService | undefined
  client: OrchesterClient
  onConfigure: () => void
  onCopied: () => void
  onBack: () => void
}

type Action = 'start' | 'stop' | 'restart' | 'configure'

const LOG_ROWS = 12

export function ServiceActions({ service, client, onConfigure, onCopied, onBack }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [logs, setLogs] = useState<string[]>([])

  const serviceId = service?.id

  // Load history + stream live log lines for this service.
  useEffect(() => {
    if (!serviceId) return
    let cancelled = false
    void client.logs(serviceId).then((lines) => { if (!cancelled) setLogs(lines.slice(-LOG_ROWS)) })
    const unsub = client.subscribeLogs((entry) => {
      if (entry.id !== serviceId) return
      setLogs((prev) => [...prev, entry.line].slice(-LOG_ROWS))
    })
    return () => { cancelled = true; unsub() }
  }, [serviceId, client])

  const actions = useMemo<Action[]>(() => {
    if (!service) return []
    const list: Action[] = []
    if (service.status === 'stopped' || service.status === 'error') list.push('start')
    if (service.status === 'running' || service.status === 'starting') list.push('stop', 'restart')
    if (service.configurable) list.push('configure')
    return list
  }, [service])

  const max = Math.max(actions.length - 1, 0)

  useInput((input, key) => {
    if (busy) return
    if (key.escape) { onBack(); return }
    if (input === 'c' || input === 'C') {
      void copyToClipboard(logs.join('\n')).then((ok) => { if (ok) onCopied() })
      return
    }
    if (key.leftArrow) setCursor((c) => (c > 0 ? c - 1 : c))
    else if (key.rightArrow) setCursor((c) => (c < max ? c + 1 : c))
    else if (key.return) {
      const action = actions[cursor]
      if (!action || !service) return
      if (action === 'configure') { onConfigure(); return }
      setBusy(action)
      const run =
        action === 'start' ? client.start(service.id)
        : action === 'stop' ? client.stop(service.id)
        : client.restart(service.id)
      run.finally(() => setBusy(null))
    }
  })

  if (!service) return <Text color="red">Service not found.</Text>

  const detail = service.path ?? (service.port ? `:${service.port}` : '')

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>{service.label}</Text>
        <Text dimColor>  ({service.status})</Text>
        {detail ? <Text dimColor>  {detail}</Text> : null}
      </Text>
      {service.description ? <Text dimColor>{service.description}</Text> : null}

      {/* actions as a row */}
      <Box marginTop={1} gap={2}>
        {actions.map((a, i) => (
          <Text
            key={a}
            color={i === cursor ? 'black' : 'cyan'}
            backgroundColor={i === cursor ? 'cyan' : undefined}
          >
            {' '}{a}{' '}
          </Text>
        ))}
        {actions.length === 0 ? <Text dimColor>no actions</Text> : null}
      </Box>
      {busy ? <Text dimColor>{busy}…</Text> : null}

      {/* per-service logs */}
      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>logs — {service.id}</Text>
        {logs.length === 0
          ? <Text dimColor>(no output yet)</Text>
          : logs.map((line, i) => (
              <Text key={i} wrap="truncate-end">{line}</Text>
            ))}
      </Box>
    </Box>
  )
}
