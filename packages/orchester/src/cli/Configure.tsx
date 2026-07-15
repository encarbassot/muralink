// Configure screen — edit port / path / domain for a configurable service
// (e.g. the NAS folder or the https domain). Minimal inline editor, no extra
// deps: ↑/↓ switch field, type to edit, Backspace deletes, Enter saves, Esc cancels.

import { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ManagedService } from '../orchester'
import type { OrchesterClient } from '../client'

interface Props {
  service: ManagedService | undefined
  client: OrchesterClient
  onDone: () => void
}

const FIELDS = ['port', 'path', 'domain'] as const
type Field = (typeof FIELDS)[number]

export function Configure({ service, client, onDone }: Props) {
  const [values, setValues] = useState<Record<Field, string>>({
    port: service?.port ? String(service.port) : '',
    path: service?.path ?? '',
    domain: service?.domain ?? '',
  })
  const [field, setField] = useState(0)
  const [saving, setSaving] = useState(false)

  useInput((input, key) => {
    if (saving) return
    if (key.escape) {
      onDone()
      return
    }
    if (key.upArrow) {
      setField((f) => (f > 0 ? f - 1 : f))
      return
    }
    if (key.downArrow) {
      setField((f) => (f < FIELDS.length - 1 ? f + 1 : f))
      return
    }
    if (key.return) {
      if (!service) return
      setSaving(true)
      const port = values.port ? Number(values.port) : undefined
      client
        .configure(service.id, {
          port: Number.isFinite(port) ? port : undefined,
          path: values.path || undefined,
          domain: values.domain || undefined,
        })
        .finally(() => {
          setSaving(false)
          onDone()
        })
      return
    }
    const key0 = FIELDS[field]!
    if (key.backspace || key.delete) {
      setValues((v) => ({ ...v, [key0]: v[key0].slice(0, -1) }))
      return
    }
    if (input && !key.ctrl && !key.meta) {
      setValues((v) => ({ ...v, [key0]: v[key0] + input }))
    }
  })

  if (!service) {
    return <Text color="red">Service not found.</Text>
  }

  return (
    <Box flexDirection="column">
      <Text bold>Configure {service.label}</Text>
      <Box flexDirection="column" marginTop={1}>
        {FIELDS.map((f, i) => (
          <Box key={f}>
            <Text color={i === field ? 'cyan' : undefined}>
              {i === field ? '❯ ' : '  '}{f.padEnd(7)}
            </Text>
            <Text>{values[f]}</Text>
            {i === field ? <Text color="cyan">▌</Text> : null}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{saving ? 'saving…' : '↑/↓ field · type to edit · Enter save · Esc cancel'}</Text>
      </Box>
    </Box>
  )
}
