// OPTIONAL — delete if the module automates no external service. Each file here
// is ONE automatable action: a self-contained function run in a headless browser
// (Playwright) on the interceptor host. Scripts are open source and community-maintained.
//
// Listed in manifest.interceptorScripts to be discoverable.

// `page` is a Playwright Page on the host; typed loosely to keep the module
// free of a Playwright dependency.
export interface ActionParams {
  [key: string]: unknown
}

export interface ActionResult {
  success: boolean
  timestamp: string
}

export async function action(page: unknown, params: ActionParams): Promise<ActionResult> {
  void page
  void params
  // await page.goto('https://example.com')
  // ... navigate, act, read result
  return { success: false, timestamp: new Date().toISOString() }
}
