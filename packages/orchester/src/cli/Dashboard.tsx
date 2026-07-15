// Dashboard — the orchester home. Shows how to reach the frontend (LAN ip+port)
// and the services with quick reachability checks, all in one navigable list.
//
// Selection starts at nothing. First ↑ selects the frontend URL, first ↓ selects
// the first service. Enter on a service opens its detail; Space toggles it.

import { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ManagedService, ServiceStatus } from '../orchester'
import { localIp } from './netinfo'
import { Spinner } from './Spinner'

interface Props {
  services: ManagedService[]
  onSelectService: (id: string) => void
  onToggle: (id: string) => void
  onQuit: () => void
}

type Check = boolean | null

const DOT: Record<ServiceStatus, string> = { running: '●', starting: '◐', stopped: '○', error: '✗' }
const COLOR: Record<ServiceStatus, string> = { running: 'green', starting: 'yellow', stopped: 'gray', error: 'red' }

async function reachable(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    return true
  } catch {
    return false
  }
}

export function Dashboard({ services, onSelectService, onToggle, onQuit }: Props) {
  // cursor: -1 = nothing, 0 = frontend URL, 1..N = services[cursor-1]
  const [cursor, setCursor] = useState(-1)
  const ip = useMemo(localIp, [])

  const svc = (id: string) => services.find((s) => s.id === id)
  const web = svc('web-frontend')
  const core = svc('core')
  const https = svc('https')
  const last = services.length // max cursor (0 = frontend, 1..N = services)

  useInput((input, key) => {
    if (key.upArrow) setCursor((c) => (c < 0 ? 0 : Math.max(0, c - 1)))
    else if (key.downArrow) setCursor((c) => (c < 0 ? Math.min(1, last) : Math.min(last, c + 1)))
    else if (key.return && cursor >= 1) onSelectService(services[cursor - 1]!.id)
    else if (input === ' ' && cursor >= 1) onToggle(services[cursor - 1]!.id)
    else if (input === 'q' || key.escape) onQuit()
  })

  const [coreCheck, setCoreCheck] = useState<Check>(null)
  const [webCheck, setWebCheck] = useState<Check>(null)

  useEffect(() => {
    let stop = false
    const run = async () => {
      const [c, w] = await Promise.all([
        reachable(`http://127.0.0.1:${core?.port ?? 3001}/health`),
        reachable(`http://127.0.0.1:${web?.port ?? 3000}/`),
      ])
      if (!stop) { setCoreCheck(c); setWebCheck(w) }
    }
    void run()
    const iv = setInterval(() => void run(), 4000)
    return () => { stop = true; clearInterval(iv) }
  }, [core?.port, web?.port])

  const webUp = web?.status === 'running'
  const httpsUp = https?.status === 'running'
  const frontendSel = cursor === 0

  return (
    <Box flexDirection="column">
      {/* Frontend address (cursor 0) */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Frontend</Text>
        <Box>
          <Text color={frontendSel ? 'cyan' : undefined}>{frontendSel ? '❯ ' : '  '}</Text>
          {webUp
            ? <Text color="green">http://{ip}:{web?.port}</Text>
            : <Text dimColor>web-frontend stopped</Text>}
          {httpsUp ? <Text color="green">  ·  https://{ip}:{https?.port}</Text> : null}
        </Box>
      </Box>

      {/* Services (cursor 1..N) with quick checks */}
      <Box flexDirection="column">
        <Text bold>Services</Text>
        {services.map((s, i) => {
          const sel = cursor === i + 1
          const detail = s.path ?? (s.port ? `:${s.port}` : '')
          const check = s.id === 'core' ? coreCheck : s.id === 'web-frontend' ? webCheck : undefined
          return (
            <Box key={s.id}>
              <Text color={sel ? 'cyan' : undefined}>{sel ? '❯ ' : '  '}</Text>
              {s.status === 'starting'
                ? <Text color={COLOR.starting}><Spinner color={COLOR.starting} /> </Text>
                : <Text color={COLOR[s.status]}>{DOT[s.status]} </Text>}
              <Text bold={sel}>{s.label.padEnd(16)}</Text>
              <Text dimColor>{detail}</Text>
              {check !== undefined ? <Text color={check ? 'green' : 'red'}>  {check === null ? '' : check ? 'up' : 'down'}</Text> : null}
              {s.error ? <Text color="red">  {s.error}</Text> : null}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
