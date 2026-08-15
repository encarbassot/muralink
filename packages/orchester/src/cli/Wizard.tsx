// Deploy wizard — the checklist a self-hoster walks to put an orchester on a
// clean Linux box.
//
// It renders DEPLOY_STEPS and nothing else: the sequence, the checks and the
// apply logic all live in ../deploy. This screen only decides what to show and
// which key runs what, so the same steps can drive a web wizard later without
// any of this file moving.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import {
  DEPLOY_STEPS, type DeployStep, type StepContext, type StepReport,
} from '../deploy/steps'
import { loadDeployConfig, publicUrl, saveDeployConfig, type DeployConfig } from '../deploy/config'
import { DeployForm } from './DeployForm'
import { Spinner } from './Spinner'

interface Props {
  onBack: () => void
  onFlash: (msg: string) => void
}

const MARK: Record<StepReport['state'], string> = { ok: '●', todo: '○', warn: '▲', fail: '✗' }
const COLOR: Record<StepReport['state'], string> = { ok: 'green', todo: 'gray', warn: 'yellow', fail: 'red' }

export function Wizard({ onBack, onFlash }: Props) {
  const [config, setConfig] = useState<DeployConfig>(() => loadDeployConfig())
  const [password, setPassword] = useState('')
  const [reports, setReports] = useState<Map<string, StepReport>>(new Map())
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  // Applying every pending step in order, stopping at the first failure.
  const [runningAll, setRunningAll] = useState(false)

  const step = DEPLOY_STEPS[cursor]!

  const ctx: StepContext = useMemo(
    () => ({
      cfg: config,
      log: (line) => setLogLines((l) => [...l.slice(-40), line]),
      secrets: { basicAuthPassword: password || undefined },
    }),
    [config, password],
  )

  const checkOne = useCallback(async (s: DeployStep, c: StepContext): Promise<StepReport> => {
    let report: StepReport
    try {
      report = await s.check(c)
    } catch (err) {
      report = { state: 'fail', detail: String(err) }
    }
    setReports((m) => new Map(m).set(s.id, report))
    return report
  }, [])

  const checkAllSteps = useCallback(async (c: StepContext) => {
    setBusy('checking')
    for (const s of DEPLOY_STEPS) await checkOne(s, c)
    setBusy(null)
  }, [checkOne])

  // First paint runs the whole checklist so the operator lands on a real
  // picture of the box rather than an empty form.
  useEffect(() => {
    void checkAllSteps(ctx)
    // Intentionally once: re-checking on every config keystroke would hammer
    // the host. The `r` key and every apply re-check explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyOne = useCallback(async (s: DeployStep, c: StepContext): Promise<StepReport> => {
    if (!s.apply) return checkOne(s, c)
    setBusy(s.id)
    setLogLines([])
    let report: StepReport
    try {
      report = await s.apply(c)
    } catch (err) {
      report = { state: 'fail', detail: String(err) }
    }
    // Trust the check, not the apply: a step that claims success but whose
    // check still fails is a step that did not work.
    const verified = report.state === 'fail' ? report : await s.check(c)
    setReports((m) => new Map(m).set(s.id, verified))
    setBusy(null)
    return verified
  }, [checkOne])

  const applyAll = useCallback(async (c: StepContext) => {
    setRunningAll(true)
    for (const s of DEPLOY_STEPS) {
      const current = reports.get(s.id)
      if (current?.state === 'ok') continue
      if (s.manual) {
        // The form is the operator's job; stop and say so rather than looping.
        const r = await checkOne(s, c)
        if (r.state !== 'ok') {
          onFlash(`${s.title} needs input — press E`)
          setCursor(DEPLOY_STEPS.indexOf(s))
          break
        }
        continue
      }
      const r = await applyOne(s, c)
      if (r.state === 'fail') {
        setCursor(DEPLOY_STEPS.indexOf(s))
        onFlash(`stopped at "${s.title}"`)
        break
      }
    }
    setRunningAll(false)
  }, [applyOne, checkOne, onFlash, reports])

  useInput((input, key) => {
    if (busy || runningAll || editing) return
    if (key.escape) { onBack(); return }
    if (key.upArrow) { setCursor((c) => Math.max(0, c - 1)); return }
    if (key.downArrow) { setCursor((c) => Math.min(DEPLOY_STEPS.length - 1, c + 1)); return }
    if (key.return) {
      if (step.manual) { setEditing(true); return }
      void applyOne(step, ctx)
      return
    }
    if (input === 'e' || input === 'E') { setEditing(true); return }
    if (input === 'r' || input === 'R') { void checkAllSteps(ctx); return }
    if (input === 'A') { void applyAll(ctx); return }
  })

  if (editing) {
    return (
      <DeployForm
        config={config}
        password={password}
        onSave={(next, pw) => {
          saveDeployConfig(next)
          setConfig(next)
          setPassword(pw)
          setEditing(false)
          onFlash('deploy config saved')
          void checkAllSteps({ cfg: next, log: ctx.log, secrets: { basicAuthPassword: pw || undefined } })
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const report = reports.get(step.id)
  const done = DEPLOY_STEPS.filter((s) => reports.get(s.id)?.state === 'ok').length

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Deploy wizard</Text>
        <Text dimColor>  {done}/{DEPLOY_STEPS.length} green · {publicUrl(config)}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {DEPLOY_STEPS.map((s, i) => {
          const r = reports.get(s.id)
          const sel = i === cursor
          const working = busy === s.id
          return (
            <Box key={s.id}>
              <Text color={sel ? 'cyan' : undefined}>{sel ? '❯ ' : '  '}</Text>
              {working
                ? <Text color="yellow"><Spinner color="yellow" /> </Text>
                : <Text color={r ? COLOR[r.state] : 'gray'}>{r ? MARK[r.state] : '·'} </Text>}
              <Text bold={sel}>{s.title.padEnd(24)}</Text>
              <Text dimColor>{(r?.detail ?? '').slice(0, 46)}</Text>
            </Box>
          )
        })}
      </Box>

      {/* Detail pane for the selected step. */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>{step.description}</Text>
        {report ? (
          <Box marginTop={1} flexDirection="column">
            <Text color={COLOR[report.state]}>{report.detail}</Text>
            {(report.hints ?? []).map((h, i) => (
              <Text key={i} dimColor>  {h}</Text>
            ))}
          </Box>
        ) : null}
        {logLines.length ? (
          <Box marginTop={1} flexDirection="column">
            {logLines.slice(-6).map((l, i) => (
              <Text key={i} dimColor>│ {l}</Text>
            ))}
          </Box>
        ) : null}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {busy ? `working: ${busy}…` : runningAll ? 'running the whole checklist…' : '↑/↓ step · Enter apply · E edit config · R re-check · Shift+A apply all · Esc back'}
        </Text>
      </Box>
    </Box>
  )
}
