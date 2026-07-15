# Deeplink — the Interceptor

An AI agent (optional) that acts on behalf of the user on external services.
Also runs deterministic, recorded automations with no AI at all.

## Two modes

### 1. Deterministic automation (no AI)
Record a workflow — click this, type that, submit — and store it as a registered
action. Replays exactly. No tokens, no LLM. This is the default and free mode.

### 2. AI-assisted generation / repair
InterceptorAI generates a script from intent, or repairs one when a target site
changes its DOM. AI is **always optional, always labeled**, and shows token cost
before running.

## Script structure

Scripts live in `modules/[name]/implementations/interceptor/`. Each file is one
self-contained automatable action:

```typescript
(page: Page, params: ActionParams) => Promise<ActionResult>
```

They run in a headless browser (Playwright) on the interceptor host. Scripts are
open source — published and maintained by the community.

```typescript
// modules/whatsapp/implementations/interceptor/sendMessage.ts
export async function sendMessage(
  page: Page,
  params: { contactPhone: string; message: string }
): Promise<{ success: boolean; timestamp: string }> {
  await page.goto('https://web.whatsapp.com')
  // ... navigate, find contact, send
}
```

Listed in `manifest.interceptorScripts` so they're discoverable.

## Self-healing loop

1. A script fails (the target site changed its DOM).
2. InterceptorAI generates a fix.
3. It creates a fork/branch in the user's repo.
4. The user reviews and approves.
5. Optionally the fix is pushed back to the community repo.
6. The community receives the update.

## LLM options

Every AI step takes `aiProvider: 'platform' | 'ollama' | 'none'`:
- **platform** — our Claude API wrapper (token cost).
- **ollama** — the user's own local model (free).
- **none** — skip AI entirely; deterministic only.

## Execution contexts

- **Interceptor host** — headless browser, self-hosted or on our AWS, same codebase.
- **Extension** — can perform actions locally via content scripts / DOM
  automation. Same workflow system, different execution context.

## Enterprise self-hosting + mesh

Multiple instances can coexist — a local box, an office server, an AWS instance —
all communicating through the main API mesh.

**Worked example:** Starbucks builds an `orderCoffee` component and self-hosts it
on their own machine for internal use → free. The moment they want *others* to
use it, it must run on our AWS, and we charge per use. Private/self-hosted is
free; exposing it to other entities goes through State 3.

See [business-model.md](business-model.md) and [token-system.md](token-system.md).
