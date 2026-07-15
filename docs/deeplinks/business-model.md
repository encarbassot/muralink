# Deeplink — business model

What we sell, what is optional, and what only works on our servers.

## What we actually sell

Two products:

1. **AI-generated code** — token cost per LLM call. A Claude API wrapper on our
   server. The user can substitute their own Ollama; then it is free.
2. **AI execution** — Interceptor scripts running in headless browsers on our
   infrastructure. Real compute cost. Pay-per-use.

## Everything else is a wrapper service

All optional, all substitutable:

- **AWS hosting** — or bring your own AWS.
- **Claude API wrapper** — or your own Ollama.
- **Domains / subdomains** — or your own domain. We provide a free subdomain.
- **Tunnels** — cross-entity data sharing infrastructure.
- **Pay API** — a Stripe wrapper for instances to process payments.
- **NAS / DevOps / boilerplate** — managed so the user doesn't have to.

We are, in short, a wrapper for: AWS, Claude, Stripe, domains, DevOps, NAS, and
the boilerplate every project re-solves.

## What ONLY works on our servers

By design, these require State 3:

- **Tunnels.**
- **User-to-user sharing.**
- **Cross-instance mesh.**

## Hosting model

- VM hosting tiers: `low / mid / pro / ultra`.
- The user has **full terminal access**, a file explorer in the browser, and can
  edit code and configs. We only manage the underlying AWS.
- **Each hosted user is an isolated fork instance** on AWS — not shared
  infrastructure.

## The free tier is real

The platform runs 100% offline without touching our API. Every service appears
as an optional prompt with a visible token cost. **Nothing activates by default.**

See [token-system.md](token-system.md) and [self-hosting.md](self-hosting.md).
