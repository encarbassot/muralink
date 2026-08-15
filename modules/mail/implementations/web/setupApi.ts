// Client for /api/mail/setup. Thin on purpose: the server owns every rule
// about what a valid mailbox is and which records it implies, so the wizard
// never computes a DNS record locally — it renders what the server returns.

import type {
  MailDnsCheck,
  MailDnsRecord,
  MailPortCheck,
  MailPortRequirement,
  YMailSetup,
} from '../../types.ts'

export interface MailSetupStatus {
  setup: YMailSetup
  dns: MailDnsRecord[]
  ports: MailPortRequirement[]
  env: string
}

export interface MailVerifyResult {
  dns: MailDnsCheck[]
  ports: MailPortCheck[]
  checkedAt: string
}

export interface MailSetupInput {
  domain: string
  mailbox: string
  publicIp?: string
  smtpPort?: number
  submissionPort?: number
  dkimSelector?: string
  tlsEmail?: string
}

const BASE = '/api/mail/setup'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...(init?.headers ?? {}) } : init?.headers,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error((detail as { error?: string }).error || `http_${res.status}`)
  }
  return res.json() as Promise<T>
}

export const mailSetupApi = {
  status: () => call<MailSetupStatus>('/status'),
  save: (input: MailSetupInput) => call<MailSetupStatus>('', { method: 'POST', body: JSON.stringify(input) }),
  verify: () => call<MailVerifyResult>('/verify', { method: 'POST' }),
  detectIp: () => call<{ ip: string }>('/detect-ip', { method: 'POST' }),
  enable: (enabled = true) =>
    call<{ setup: YMailSetup; restartRequired: boolean; env: string }>('/enable', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
}
