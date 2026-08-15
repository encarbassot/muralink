// Runnable entry for the enterprise multi-user front (shared-workspace model).
// An enterprise instance runs THIS in front of the single core instead of
// pointing the web frontend straight at it. It self-gates on the instance's
// entitlement: with no valid multi-user entitlement it is a transparent
// pass-through (SINGLE mode) and behaves exactly like a free self-host.
//
// Env:
//   PORT               listen port (default 3000)
//   ELIO_HOME          state home (default ~/.elio) — holds the users db
//   ELIO_CORE_ORIGIN   the single shared core (default http://127.0.0.1:3001)
//   ELIO_API_TOKEN     the core's master token (injected per request in
//                      MULTIUSER mode so the browser never holds it)

import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createMultiuserFront } from './server.ts'

const home = process.env['ELIO_HOME'] ?? join(homedir(), '.elio')
const port = Number(process.env['PORT'] ?? 3000)

// Enroll a new local user as a cloud seat, using the instance's account link
// (~/.elio/account.json: { tunnelBaseUrl, sessionToken }). Best-effort: no link
// or unreachable master → the user still works locally and gets cloud-authorized
// once enrolled. Read fresh each call so a link established after boot is picked
// up without a restart.
async function enrollSeat(who: string, label?: string): Promise<void> {
  let link: { tunnelBaseUrl?: string; sessionToken?: string }
  try {
    link = JSON.parse(readFileSync(join(home, 'account.json'), 'utf-8'))
  } catch {
    return // anonymous instance — no cloud seat to enroll yet
  }
  if (!link.tunnelBaseUrl || !link.sessionToken) return
  const base = link.tunnelBaseUrl.replace(/\/$/, '')
  try {
    await fetch(`${base}/seats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${link.sessionToken}` },
      body: JSON.stringify({ who, label }),
    })
  } catch {
    // master unreachable — retried on next signup / a future reconcile pass
  }
}

// Resolve the cloud master origin + account token from the link, fresh each call.
function masterLink(): { origin: string; accountToken: string } | null {
  try {
    const link = JSON.parse(readFileSync(join(home, 'account.json'), 'utf-8')) as {
      tunnelBaseUrl?: string
      sessionToken?: string
    }
    if (!link.tunnelBaseUrl || !link.sessionToken) return null
    return { origin: link.tunnelBaseUrl, accountToken: link.sessionToken }
  } catch {
    return null
  }
}

const { app, mode } = createMultiuserFront({
  usersDbPath: join(home, 'multiuser.db'),
  coreOrigin: process.env['ELIO_CORE_ORIGIN'] ?? 'http://127.0.0.1:3001',
  coreToken: process.env['ELIO_API_TOKEN'],
  enrollSeat,
  masterLink,
})

app.listen(port, () => {
  console.log(`[multiuser] listening on :${port} — mode=${mode}`)
})
