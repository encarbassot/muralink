// "Añadir cuenta local" — the advanced path: this instance becomes the mail
// server for a domain, instead of talking to Gmail/Outlook through an API.
//
// The wizard's job is honesty about what self-hosted mail costs: a domain you
// control, a fixed public IP, six DNS records, an outbound port 25 most home
// ISPs block, and a PTR only your hosting provider can set. It writes the
// config, generates the DKIM keypair server-side, and then tells you exactly
// what to publish and open — it cannot do those two steps for you.

import { useEffect, useMemo, useState } from 'react'
import type { MailDnsCheck, MailDnsRecord, MailPortCheck, MailPortRequirement, YMailSetup } from '../../types.ts'
import { mailSetupApi, type MailSetupStatus, type MailVerifyResult } from './setupApi.ts'

const STEPS = ['Requisitos', 'Dirección', 'DNS', 'Puertos', 'Activar'] as const
type StepIndex = 0 | 1 | 2 | 3 | 4

const DEFAULT_DOMAIN = 'elioputo.mural.ink'
const DEFAULT_MAILBOX = 'hello'

export interface MailSetupWizardProps {
  onClose: () => void
  onDone?: (setup: YMailSetup) => void
}

export function MailSetupWizard({ onClose, onDone }: MailSetupWizardProps) {
  const [step, setStep] = useState<StepIndex>(0)
  const [status, setStatus] = useState<MailSetupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // form state
  const [mailbox, setMailbox] = useState(DEFAULT_MAILBOX)
  const [domain, setDomain] = useState(DEFAULT_DOMAIN)
  const [publicIp, setPublicIp] = useState('')
  const [tlsEmail, setTlsEmail] = useState('')
  const [selector, setSelector] = useState('default')
  const [smtpPort, setSmtpPort] = useState(25)
  const [submissionPort, setSubmissionPort] = useState(587)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [verify, setVerify] = useState<MailVerifyResult | null>(null)

  useEffect(() => {
    void mailSetupApi
      .status()
      .then(s => {
        setStatus(s)
        if (s.setup.configured) {
          setMailbox(s.setup.mailbox)
          setDomain(s.setup.domain)
          setPublicIp(s.setup.publicIp)
          setTlsEmail(s.setup.tlsEmail)
          setSelector(s.setup.dkimSelector)
          setSmtpPort(s.setup.smtpPort)
          setSubmissionPort(s.setup.submissionPort)
          setStep(2) // already configured → straight to the records
        }
      })
      .catch(e => setError(humanError(e)))
  }, [])

  const address = `${mailbox || '…'}@${domain || '…'}`

  async function saveAndContinue() {
    setBusy(true)
    setError(null)
    try {
      const next = await mailSetupApi.save({
        domain: domain.trim().toLowerCase(),
        mailbox: mailbox.trim().toLowerCase(),
        publicIp: publicIp.trim(),
        tlsEmail: tlsEmail.trim(),
        dkimSelector: selector.trim().toLowerCase(),
        smtpPort,
        submissionPort,
      })
      setStatus(next)
      setStep(2)
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function runVerify() {
    setBusy(true)
    setError(null)
    try {
      setVerify(await mailSetupApi.verify())
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function detectIp() {
    setBusy(true)
    setError(null)
    try {
      const { ip } = await mailSetupApi.detectIp()
      setPublicIp(ip)
    } catch {
      setError('No se ha podido detectar la IP (sin salida a internet o servicio bloqueado). Escríbela a mano.')
    } finally {
      setBusy(false)
    }
  }

  async function activate() {
    setBusy(true)
    setError(null)
    try {
      const r = await mailSetupApi.enable(true)
      setStatus(s => (s ? { ...s, setup: r.setup, env: r.env } : s))
      onDone?.(r.setup)
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={S.backdrop} onPointerDown={onClose}>
      <div style={S.panel} onPointerDown={e => e.stopPropagation()}>
        <header style={S.header}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Cuenta de correo local</div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
              Este servidor será el servidor de correo de <code>{domain || 'tu dominio'}</code>
            </div>
          </div>
          <button onClick={onClose} style={S.iconBtn} title="Cerrar">✕</button>
        </header>

        <nav style={S.steps}>
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => { if (i <= step || status?.setup.configured) setStep(i as StepIndex) }}
              disabled={i > step && !status?.setup.configured}
              style={{
                ...S.stepPill,
                color: i === step ? 'var(--fg)' : 'var(--fg-faint)',
                borderColor: i === step ? 'var(--accent, var(--fg-dim))' : 'var(--border)',
                cursor: i <= step || status?.setup.configured ? 'pointer' : 'default',
              }}
            >
              {i + 1}. {label}
            </button>
          ))}
        </nav>

        <div style={S.body}>
          {error && <div style={S.error}>{error}</div>}

          {step === 0 && <RequirementsStep />}

          {step === 1 && (
            <AddressStep
              mailbox={mailbox} setMailbox={setMailbox}
              domain={domain} setDomain={setDomain}
              publicIp={publicIp} setPublicIp={setPublicIp}
              tlsEmail={tlsEmail} setTlsEmail={setTlsEmail}
              selector={selector} setSelector={setSelector}
              smtpPort={smtpPort} setSmtpPort={setSmtpPort}
              submissionPort={submissionPort} setSubmissionPort={setSubmissionPort}
              showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced}
              address={address}
              busy={busy}
              onDetectIp={detectIp}
            />
          )}

          {step === 2 && <DnsStep records={status?.dns ?? []} checks={verify?.dns ?? []} busy={busy} onVerify={runVerify} checkedAt={verify?.checkedAt} />}

          {step === 3 && <PortsStep ports={status?.ports ?? []} checks={verify?.ports ?? []} setup={status?.setup} />}

          {step === 4 && <ActivateStep setup={status?.setup} env={status?.env ?? ''} busy={busy} onActivate={activate} />}
        </div>

        <footer style={S.footer}>
          <button
            onClick={() => setStep(s => Math.max(0, s - 1) as StepIndex)}
            disabled={step === 0}
            style={{ ...S.btn, opacity: step === 0 ? 0.4 : 1 }}
          >
            Atrás
          </button>
          <div style={{ flex: 1 }} />
          {step === 1 ? (
            <button onClick={() => void saveAndContinue()} disabled={busy || !mailbox || !domain} style={S.btnPrimary}>
              {busy ? 'Guardando…' : 'Generar claves y continuar'}
            </button>
          ) : step < 4 ? (
            <button onClick={() => setStep(s => Math.min(4, s + 1) as StepIndex)} style={S.btnPrimary}>Siguiente</button>
          ) : (
            <button onClick={onClose} style={S.btn}>Cerrar</button>
          )}
        </footer>
      </div>
    </div>
  )
}

// ─── Steps ──────────────────────────────────────────────────────────────────

function RequirementsStep() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={S.p}>
        Alojar el correo aquí significa que este servidor recibe y entrega los mensajes: sin Gmail, sin Outlook,
        sin intermediarios. Los mensajes se guardan en la base de datos local de la instancia y las claves de firma
        nunca salen de la máquina.
      </p>
      <p style={S.p}>Antes de empezar necesitas cuatro cosas. Si te falta alguna, el correo saliente no funcionará:</p>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
        <Req title="Un dominio con acceso al DNS">Vas a publicar 5 registros (MX, A, SPF, DKIM, DMARC).</Req>
        <Req title="IP pública fija">
          El registro A del host de correo apunta ahí. Con IP dinámica los rebotes son constantes.
        </Req>
        <Req title="Puerto 25 de salida abierto">
          Los ISP domésticos casi siempre lo bloquean. Con el 25 bloqueado <strong>recibes pero no envías</strong>;
          la salida requeriría un VPS o un relay.
        </Req>
        <Req title="PTR (DNS inverso) sobre tu IP">
          Solo lo puede poner tu proveedor de VPS/ISP. Sin PTR, Gmail y Outlook mandan tu correo a spam o lo rechazan.
        </Req>
      </ul>
      <div style={S.callout}>
        Nada de esto se activa solo. Al terminar el asistente el servicio queda armado, pero la entrega real depende
        de que el DNS haya propagado y de que los puertos estén realmente abiertos desde fuera.
      </div>
    </div>
  )
}

function Req({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li style={{ fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
      <strong style={{ color: 'var(--fg)' }}>{title}</strong> — {children}
    </li>
  )
}

function AddressStep(p: {
  mailbox: string; setMailbox: (v: string) => void
  domain: string; setDomain: (v: string) => void
  publicIp: string; setPublicIp: (v: string) => void
  tlsEmail: string; setTlsEmail: (v: string) => void
  selector: string; setSelector: (v: string) => void
  smtpPort: number; setSmtpPort: (v: number) => void
  submissionPort: number; setSubmissionPort: (v: number) => void
  showAdvanced: boolean; setShowAdvanced: (v: boolean) => void
  address: string
  busy: boolean
  onDetectIp: () => void
}) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Field label="Buzón" style={{ width: 140 }}>
          <input value={p.mailbox} onChange={e => p.setMailbox(e.target.value)} placeholder="hello" style={S.input} />
        </Field>
        <div style={{ paddingBottom: 8, color: 'var(--fg-faint)' }}>@</div>
        <Field label="Dominio" style={{ flex: 1 }}>
          <input value={p.domain} onChange={e => p.setDomain(e.target.value)} placeholder="elioputo.mural.ink" style={S.input} />
        </Field>
      </div>
      <div style={S.preview}>
        Dirección: <strong>{p.address}</strong>
        <span style={{ color: 'var(--fg-faint)' }}> · host de correo: {p.domain ? `mail.${p.domain}` : 'mail.<dominio>'}</span>
      </div>

      <Field label="IP pública del servidor" hint="La que verá el resto de internet. Se usa en el registro A y en el PTR.">
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={p.publicIp} onChange={e => p.setPublicIp(e.target.value)} placeholder="203.0.113.10" style={{ ...S.input, flex: 1 }} />
          <button onClick={p.onDetectIp} disabled={p.busy} style={S.btn} title="Consulta un servicio externo — es una llamada de red opcional">
            Detectar
          </button>
        </div>
      </Field>

      <Field label="Email para el certificado TLS" hint="Let's Encrypt lo usa para avisos de caducidad. Puede ser cualquier dirección tuya que ya funcione.">
        <input value={p.tlsEmail} onChange={e => p.setTlsEmail(e.target.value)} placeholder="tu@correo.tld" style={S.input} />
      </Field>

      <button onClick={() => p.setShowAdvanced(!p.showAdvanced)} style={S.linkBtn}>
        {p.showAdvanced ? '▾' : '▸'} Opciones avanzadas
      </button>
      {p.showAdvanced && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Field label="Selector DKIM" hint="Cambiarlo regenera el par de claves.">
            <input value={p.selector} onChange={e => p.setSelector(e.target.value)} style={S.input} />
          </Field>
          <Field label="Puerto SMTP" hint="25 en producción.">
            <input type="number" value={p.smtpPort} onChange={e => p.setSmtpPort(Number(e.target.value))} style={S.input} />
          </Field>
          <Field label="Puerto submission" hint="587 con STARTTLS.">
            <input type="number" value={p.submissionPort} onChange={e => p.setSubmissionPort(Number(e.target.value))} style={S.input} />
          </Field>
        </div>
      )}

      <div style={S.callout}>
        Al continuar se genera un par de claves DKIM RSA-2048 en el servidor. La privada se queda en la base de datos
        local; la pública aparece en el siguiente paso, para publicarla en el DNS.
      </div>
    </div>
  )
}

function DnsStep({ records, checks, busy, onVerify, checkedAt }: {
  records: MailDnsRecord[]
  checks: MailDnsCheck[]
  busy: boolean
  onVerify: () => void
  checkedAt?: string
}) {
  const byId = useMemo(() => new Map(checks.map(c => [c.id, c])), [checks])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <p style={{ ...S.p, flex: 1, margin: 0 }}>
          Añade estos registros en el panel DNS de tu dominio. Propagar puede tardar de minutos a horas.
        </p>
        <button onClick={onVerify} disabled={busy} style={S.btn}>{busy ? 'Comprobando…' : 'Comprobar DNS'}</button>
      </div>
      {checkedAt && (
        <div style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
          Última comprobación: {new Date(checkedAt).toLocaleTimeString()} — se consulta el resolver del sistema, puede ir por detrás de tu registrador.
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {records.map(r => {
          const check = byId.get(r.id)
          return (
            <div key={r.id} style={{ ...S.record, borderColor: check ? (check.ok ? '#22c55e55' : '#ef444455') : 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={S.type}>{r.type}</span>
                {r.priority !== undefined && <span style={S.badge}>prio {r.priority}</span>}
                {!r.required && <span style={S.badge}>opcional</span>}
                <span style={{ fontSize: 11, color: 'var(--fg-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>TTL {r.ttl}</span>
                {check && <span title={check.error ?? check.found.join(', ')}>{check.ok ? '✅' : '❌'}</span>}
                <CopyButton value={r.value} />
              </div>
              <code style={S.code}>{r.value}</code>
              {r.note && <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 6, lineHeight: 1.4 }}>{r.note}</div>}
              {check && !check.ok && (
                <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>
                  {check.error ? `No resuelve: ${check.error}` : `Encontrado: ${check.found.join(' · ') || '(nada)'}`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PortsStep({ ports, checks, setup }: { ports: MailPortRequirement[]; checks: MailPortCheck[]; setup?: YMailSetup }) {
  const smtp = setup?.smtpPort ?? 25
  const sub = setup?.submissionPort ?? 587
  const ufw = [`sudo ufw allow ${smtp}/tcp`, 'sudo ufw allow 80/tcp', `sudo ufw allow ${sub}/tcp`].join('\n')

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={S.p}>
        Abre estos puertos en el firewall de la máquina <em>y</em> redirígelos en el router hacia ella.
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        {ports.map(p => {
          const check = checks.find(c => c.port === p.port && p.direction === 'inbound')
          return (
            <div key={`${p.port}-${p.direction}`} style={S.record}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={S.type}>{p.port}</span>
                <span style={S.badge}>{p.direction === 'inbound' ? 'entrada' : 'salida'}</span>
                {!p.required && <span style={S.badge}>opcional</span>}
                <span style={{ fontSize: 11, color: 'var(--fg)', flex: 1 }}>{p.purpose}</span>
                {check && <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{check.listening ? 'escuchando' : 'sin listener'}</span>}
              </div>
              {p.note && <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 5, lineHeight: 1.4 }}>{p.note}</div>}
            </div>
          )
        })}
      </div>
      <Field label="Firewall (ufw)">
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <pre style={{ ...S.code, flex: 1, whiteSpace: 'pre', margin: 0 }}>{ufw}</pre>
          <CopyButton value={ufw} />
        </div>
      </Field>
      <div style={S.callout}>
        La comprobación local solo dice si hay un proceso escuchando en esta máquina. Saber si el puerto 25 es
        alcanzable desde fuera requiere un sondeo externo — la vía honesta hoy es enviarte un correo de prueba
        desde otra cuenta y ver si llega.
      </div>
    </div>
  )
}

function ActivateStep({ setup, env, busy, onActivate }: { setup?: YMailSetup; env: string; busy: boolean; onActivate: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {setup?.enabled ? (
        <>
          <div style={{ ...S.callout, borderColor: '#22c55e55' }}>
            <strong>Correo armado</strong> para <code>{setup.address}</code>. El daemon levanta los listeners en su
            próximo arranque: reinicia el servicio <code>mail</code> desde el orchester (o el proceso del servidor).
          </div>
          <p style={S.p}>
            Los listeners SMTP todavía no están implementados en el daemon — la configuración, las claves y los
            registros ya son reales, la recepción llega con el listener del puerto 25.
          </p>
        </>
      ) : (
        <>
          <p style={S.p}>
            Al activar, este servidor pasa a ser responsable del correo de <code>{setup?.domain || 'tu dominio'}</code>.
            Hazlo cuando el DNS ya esté publicado: activarlo antes hace que los remitentes reciban rebotes.
          </p>
          <button onClick={onActivate} disabled={busy || !setup?.configured} style={S.btnPrimary}>
            {busy ? 'Activando…' : `Activar correo en ${setup?.address ?? ''}`}
          </button>
        </>
      )}

      {env && (
        <Field label="Variables de entorno" hint="Pégalas en systemd/docker para que la config sobreviva a un despliegue desde cero.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <pre style={{ ...S.code, flex: 1, whiteSpace: 'pre', margin: 0 }}>{env}</pre>
            <CopyButton value={env} />
          </div>
        </Field>
      )}
    </div>
  )
}

// ─── Bits ───────────────────────────────────────────────────────────────────

function Field({ label, hint, children, style }: { label: string; hint?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'grid', gap: 4, ...style }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10, color: 'var(--fg-faint)', lineHeight: 1.4 }}>{hint}</span>}
    </label>
  )
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
      style={{ ...S.btn, padding: '3px 7px', fontSize: 10 }}
      title="Copiar"
    >
      {done ? '✓' : 'Copiar'}
    </button>
  )
}

function humanError(e: unknown): string {
  const code = e instanceof Error ? e.message : String(e)
  const map: Record<string, string> = {
    invalid_domain: 'Dominio no válido. Usa algo como elioputo.mural.ink.',
    invalid_mailbox: 'Buzón no válido. Solo letras, números y . _ + -',
    mail_not_configured: 'Todavía no hay cuenta configurada.',
    http_409: 'El módulo de correo no está instalado en esta instancia.',
    http_404: 'Este servidor no expone /api/mail — actualiza el orchester.',
  }
  return map[code] ?? `Error: ${code}`
}

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  panel: {
    width: 'min(760px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14,
    boxShadow: '0 24px 70px rgba(0,0,0,0.45)', color: 'var(--fg)', overflow: 'hidden',
  },
  header: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' },
  steps: { display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' },
  stepPill: { fontSize: 11, padding: '4px 9px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent' },
  body: { padding: 16, overflowY: 'auto', flex: 1 },
  footer: { display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)' },
  p: { fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.6, margin: 0 },
  input: {
    width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--fg)', fontSize: 12, outline: 'none',
  },
  btn: {
    padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--fg)', fontSize: 11, cursor: 'pointer',
  },
  btnPrimary: {
    padding: '6px 13px', borderRadius: 8, border: '1px solid var(--border-strong, var(--border))',
    background: 'var(--fg)', color: 'var(--bg)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
  },
  linkBtn: { border: 'none', background: 'transparent', color: 'var(--fg-dim)', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: 0 },
  iconBtn: { border: 'none', background: 'transparent', color: 'var(--fg-faint)', fontSize: 13, cursor: 'pointer' },
  error: { fontSize: 11, color: '#ef4444', border: '1px solid #ef444455', borderRadius: 8, padding: '7px 9px', marginBottom: 12 },
  callout: { fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.5, border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', background: 'var(--bg)' },
  preview: { fontSize: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' },
  record: { border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', background: 'var(--bg)' },
  type: { fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--border)', color: 'var(--fg-dim)' },
  badge: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4, padding: '2px 5px', borderRadius: 5, border: '1px solid var(--border)', color: 'var(--fg-faint)' },
  code: { display: 'block', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: 'var(--fg)', wordBreak: 'break-all', lineHeight: 1.5 },
}
