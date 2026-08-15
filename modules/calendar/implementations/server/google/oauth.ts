// OAuth 2.0 for Google Calendar — web-application flow with a client secret,
// run entirely on the orchester so no secret ever reaches the browser. We hit
// Google's token endpoints directly with fetch (no googleapis dependency).

import type { Database } from 'better-sqlite3'
import type { GoogleConfig } from './config.ts'
import { getAccount, patchAccountTokens, saveAccount, type GoogleAccount } from './store.ts'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo'

// A minute of slack so we never present an access token about to expire.
const EXPIRY_SKEW_MS = 60_000

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: string
}

export function buildAuthUrl(cfg: GoogleConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    // offline + consent are what actually returns a refresh_token; without
    // them Google gives only a short-lived access token on re-auth.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_ENDPOINT}?${params}`
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`google token endpoint ${res.status}: ${text}`)
  }
  return (await res.json()) as TokenResponse
}

async function fetchEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return undefined
    const info = (await res.json()) as { email?: string }
    return info.email
  } catch {
    return undefined
  }
}

// Exchange the authorization code for tokens and persist the account.
export async function exchangeCode(db: Database, cfg: GoogleConfig, code: string): Promise<GoogleAccount> {
  const tokens = await postToken(
    new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
    }),
  )
  if (!tokens.refresh_token) {
    // Happens if the user previously granted access and Google withheld a new
    // refresh token. prompt=consent above should prevent it; surface clearly.
    throw new Error('google returned no refresh_token — revoke prior access and retry')
  }
  const email = await fetchEmail(tokens.access_token)
  const account: GoogleAccount = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryMs: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope ?? cfg.scopes.join(' '),
    email,
  }
  saveAccount(db, account)
  return account
}

// Return a valid access token, refreshing (and persisting) if it is expired or
// about to. Throws if there is no connected account.
export async function validAccessToken(db: Database, cfg: GoogleConfig): Promise<string> {
  const account = getAccount(db)
  if (!account) throw new Error('google not connected')
  if (Date.now() < account.expiryMs - EXPIRY_SKEW_MS) return account.accessToken

  const tokens = await postToken(
    new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: account.refreshToken,
      grant_type: 'refresh_token',
    }),
  )
  patchAccountTokens(db, {
    accessToken: tokens.access_token,
    expiryMs: Date.now() + tokens.expires_in * 1000,
  })
  return tokens.access_token
}
