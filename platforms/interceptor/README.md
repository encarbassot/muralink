# interceptor — not yet implemented (scaffold only)

Webscraper engine + action automation. Self-hostable or on our AWS — same codebase.
Runs a module's `implementations/interceptor/` scripts in a headless browser.

- **Stack:** Node.js + Playwright
- **Two modes:** deterministic (record a workflow, store as an action) and
  AI-assisted (InterceptorAI generates/repairs scripts). AI is always optional
  and labeled — `aiProvider: 'platform' | 'ollama' | 'none'`.

**Do not start until `url` + `contacts` are solid** (per bootstrap ordering).
See [docs/deeplinks/interceptor.md](../../docs/deeplinks/interceptor.md).
