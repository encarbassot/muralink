// Auth for direct fetch() calls to THIS instance's own /api/contacts routes
// (trust groups + my locations — server-resident, see trustGroupsStore.ts /
// myLocationsStore.ts). Mirrors platforms/server's default
// (ELIO_API_TOKEN ?? 'dev-token') and packages/app's api/client.ts pattern —
// a host embedding this module against a non-default token calls setApiToken.

let token = 'dev-token'

export function setApiToken(next: string): void {
  token = next
}

export function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}
