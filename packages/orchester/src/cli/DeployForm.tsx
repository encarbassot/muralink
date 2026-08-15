// The deploy wizard's answer sheet, as a form.
//
// This is the one screen where the operator types. Everything else in the
// wizard is check-and-apply against what is written here. Text fields edit in
// place; choice fields cycle with ←/→; the token field generates rather than
// accepting typed input, because a hand-typed secret is a weak secret.

import { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { newApiToken, type DeployConfig, type TlsMode, type WebServer } from '../deploy/config'

interface Props {
  config: DeployConfig
  // The basic-auth password never lands in the config — it is hashed into the
  // htpasswd file and forgotten. The wizard holds it for this session only.
  password: string
  onSave: (config: DeployConfig, password: string) => void
  onCancel: () => void
}

type FieldKind = 'text' | 'number' | 'choice' | 'secret' | 'generated'

interface Field {
  key: string
  label: string
  kind: FieldKind
  help?: string
  choices?: readonly string[]
}

const FIELDS: Field[] = [
  { key: 'domain', label: 'domain', kind: 'text', help: 'public hostname, e.g. mi-instancia.mural.ink' },
  { key: 'aliases', label: 'aliases', kind: 'text', help: 'comma separated extra names (LAN ip, bare host)' },
  { key: 'adminEmail', label: 'admin email', kind: 'text', help: 'required for Let’s Encrypt expiry notices' },
  { key: 'serviceUser', label: 'service user', kind: 'text', help: 'unix user the daemon runs as — never root' },
  { key: 'repoRoot', label: 'repo root', kind: 'text' },
  { key: 'repoUrl', label: 'repo url', kind: 'text', help: 'cloned here if repo root is empty — the public repo needs no key' },
  { key: 'repoBranch', label: 'repo branch', kind: 'text' },
  { key: 'dataDir', label: 'data dir', kind: 'text', help: 'sqlite database and regenerable caches' },
  { key: 'storageRoot', label: 'storage root', kind: 'text', help: 'the folder served at /api/storage — your files' },
  { key: 'corePort', label: 'core port', kind: 'number' },
  { key: 'webPort', label: 'web port', kind: 'number' },
  { key: 'webServer', label: 'web server', kind: 'choice', choices: ['nginx', 'none'] },
  { key: 'tls', label: 'tls', kind: 'choice', choices: ['acme', 'self-signed', 'none'] },
  { key: 'basicAuthUser', label: 'auth user', kind: 'text', help: 'empty = no gate; the instance is then open to anyone' },
  { key: 'basicAuthPassword', label: 'auth password', kind: 'secret' },
  { key: 'apiToken', label: 'api token', kind: 'generated', help: 'Enter regenerates — nginx injects it, the browser never sees it' },
]

export function DeployForm({ config, password, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<DeployConfig>(config)
  const [pw, setPw] = useState(password)
  const [cursor, setCursor] = useState(0)

  const field = FIELDS[cursor]!

  const valueOf = (f: Field): string => {
    if (f.key === 'basicAuthPassword') return pw
    if (f.key === 'aliases') return draft.aliases.join(',')
    return String((draft as unknown as Record<string, unknown>)[f.key] ?? '')
  }

  const setValue = (f: Field, next: string): void => {
    if (f.key === 'basicAuthPassword') { setPw(next); return }
    if (f.key === 'aliases') {
      setDraft((d) => ({ ...d, aliases: next.split(',').map((s) => s.trim()).filter(Boolean) }))
      return
    }
    if (f.kind === 'number') {
      const n = Number(next)
      setDraft((d) => ({ ...d, [f.key]: Number.isFinite(n) ? n : 0 }) as DeployConfig)
      return
    }
    setDraft((d) => ({ ...d, [f.key]: next }) as DeployConfig)
  }

  const cycle = (f: Field, dir: 1 | -1): void => {
    if (!f.choices) return
    const cur = valueOf(f)
    const i = Math.max(0, f.choices.indexOf(cur))
    const next = f.choices[(i + dir + f.choices.length) % f.choices.length]!
    if (f.key === 'webServer') setDraft((d) => ({ ...d, webServer: next as WebServer }))
    else if (f.key === 'tls') setDraft((d) => ({ ...d, tls: next as TlsMode }))
  }

  useInput((input, key) => {
    if (key.escape) { onCancel(); return }
    if (key.upArrow) { setCursor((c) => Math.max(0, c - 1)); return }
    if (key.downArrow || key.tab) { setCursor((c) => Math.min(FIELDS.length - 1, c + 1)); return }

    if (field.kind === 'choice') {
      if (key.leftArrow) { cycle(field, -1); return }
      if (key.rightArrow) { cycle(field, 1); return }
    }

    if (key.return) {
      if (field.kind === 'generated') { setDraft((d) => ({ ...d, apiToken: newApiToken() })); return }
      // Enter on the last field saves; elsewhere it moves on, which is what
      // anyone filling a form expects.
      if (cursor < FIELDS.length - 1) { setCursor((c) => c + 1); return }
      onSave(draft, pw)
      return
    }

    // Ctrl+S saves from anywhere — the form is long.
    if (key.ctrl && input === 's') { onSave(draft, pw); return }

    if (field.kind === 'generated' || field.kind === 'choice') return

    if (key.backspace || key.delete) { setValue(field, valueOf(field).slice(0, -1)); return }
    if (input && !key.ctrl && !key.meta) setValue(field, valueOf(field) + input)
  })

  return (
    <Box flexDirection="column">
      <Text bold>Deploy configuration</Text>
      <Box flexDirection="column" marginTop={1}>
        {FIELDS.map((f, i) => {
          const sel = i === cursor
          const raw = valueOf(f)
          const shown =
            f.kind === 'secret'
              ? raw ? '•'.repeat(Math.min(raw.length, 24)) : ''
              : f.kind === 'generated'
                ? raw ? `${raw.slice(0, 12)}… (${raw.length} chars)` : '— press Enter to generate —'
                : raw
          return (
            <Box key={f.key}>
              <Text color={sel ? 'cyan' : undefined}>{sel ? '❯ ' : '  '}{f.label.padEnd(15)}</Text>
              {f.kind === 'choice'
                ? <Text color={sel ? 'cyan' : undefined}>‹ {shown} ›</Text>
                : <Text>{shown}</Text>}
              {sel && (f.kind === 'text' || f.kind === 'number' || f.kind === 'secret')
                ? <Text color="cyan">▌</Text>
                : null}
            </Box>
          )
        })}
      </Box>

      {field.help ? (
        <Box marginTop={1}>
          <Text dimColor>{field.help}</Text>
        </Box>
      ) : null}

      {!draft.basicAuthUser ? (
        <Box marginTop={1}>
          <Text color="red">
            No auth user: everything on {draft.domain || 'this address'} — files, notes, passwords — is readable by anyone who finds it.
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>↑/↓ field · ←/→ choose · Enter next/generate · Ctrl+S save · Esc cancel</Text>
      </Box>
    </Box>
  )
}
