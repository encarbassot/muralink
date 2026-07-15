// url — the canonical minimal `type` module. Platform-agnostic only:
// no host SDKs, no framework. Migrated from elio-modules/modules/url/core.ts,
// reshaped to the YUrl contract from @muralink/types.

import type { YUrl } from '@muralink/types'

/** True when the string is a structurally valid URL. */
export function validate(raw: string): boolean {
  try {
    new URL(raw)
    return true
  } catch {
    return false
  }
}

/** Bare host of a url, e.g. "example.com". Empty string when invalid.
 *  (Was `hostname()` in the legacy module.) */
export function domain(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** Build a full YUrl from raw input. The normalized form lowercases the host
 *  and resolves the URL; `domain` is the bare host. Throws on invalid input —
 *  callers should `validate()` first when input is untrusted. */
export function normalize(raw: string): YUrl {
  const parsed = new URL(raw)
  parsed.hostname = parsed.hostname.toLowerCase()
  return {
    raw,
    normalized: parsed.href,
    domain: parsed.hostname,
  }
}

/** Safe variant: returns null instead of throwing on invalid input. */
export function tryNormalize(raw: string): YUrl | null {
  return validate(raw) ? normalize(raw) : null
}
