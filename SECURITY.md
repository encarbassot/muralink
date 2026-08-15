# Security policy

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private vulnerability reporting on this repository:
**Security → Report a vulnerability**. It reaches the maintainers directly and
stays private until there is a fix.

Useful in a report: what you did, what happened, what you expected, and the
version or commit. A proof of concept helps; a working exploit is not required.

Expect a first reply within a week. If a report is confirmed, we will agree a
disclosure timeline with you and credit you in the release notes unless you
prefer otherwise.

## What is in scope

The code in this repository: the platform packages, the modules, the server, the
orchester and its deploy wizard.

Particularly interesting:

- Anything that lets a **scoped share token** read or write outside its share.
  A guest holds one role over one folder; escaping that is the highest-value bug
  here.
- Anything that lets a browser set its own identity through the multi-user
  front — the front strips client-supplied `X-Mural-User` precisely because the
  core trusts that header.
- Anything that makes the **password vault** readable server-side. The core
  stores sealed blobs and the PIN salt and verifier; it is designed to be unable
  to read an entry. A route that can be made to return plaintext is a bug of the
  first order.
- Anything that lets a formula or a user-defined function escape the QuickJS
  sandbox in `@muralink/calc`.

## What is not a vulnerability

- **An instance with no auth gate is reachable by whoever reaches its address.**
  The deploy wizard warns about this and asks you to set a gate; running without
  one is a choice, not a flaw.
- **A share link works for anyone holding it.** That is what a share link is.
  Treat it as public once sent.
- **A lost vault PIN means lost data.** There is no recovery path by design: the
  key is derived from the PIN in the browser and never persisted. This is the
  feature.
- Findings from automated scanners with no demonstrated impact.

## Supported versions

The project is pre-1.0 and moves fast. Fixes land on `main`; there are no
maintained release branches yet.
