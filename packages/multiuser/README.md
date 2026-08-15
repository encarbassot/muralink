# @muralink/multiuser

The enterprise multi-user front: a thin layer in front of the orchester that
authenticates each person and forwards their request to the **one** shared core,
stamped with a verified identity (`X-Mural-User`).

The core stays single-user. It has no concept of accounts, and nothing here adds
one to it — this package resolves *who is asking* and hands the core a name it
can attribute writes to.

## Inert without an entitlement

Without a valid multi-user entitlement this front is a transparent pass-through
and the instance behaves as a plain single-user instance. That is deliberate:

- The paid capability is the **authenticated identity** the sync protocol needs,
  not a feature hidden behind a disabled button.
- Nothing in the open core is crippled to sell the closed part. Remove this
  package and everything a single user does still works.

## What lives here

- **[src/server.ts](src/server.ts)** — `createMultiuserFront()`, the proxy.
- **[src/users.ts](src/users.ts)** — `UserStore`, the local account table.
- **[src/verifiers/](src/verifiers/)** — identity verifiers. `clientToken.ts`
  accepts a federated identity from a host application that already
  authenticated the user.

## Rules

- **The browser never picks its own identity.** The front verifies the session
  and *strips* any client-supplied `X-Mural-User` before setting its own. The
  core trusts the header only because only the front can reach the core.
- **No multi-tenancy.** One instance, one shared workspace, many people. Several
  isolated accounts on one machine is a different product (`muralink-cloud`).
