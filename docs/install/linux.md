# Install — Linux

> Stub. The installer is not built yet (`platforms/server` is scaffold only).

## Planned

- **One-line install** (Docker + Docker Compose required):
  ```sh
  curl -fsSL https://[domain]/install.sh | sh
  ```
- The intended home for a self-hosted instance — an old laptop running Linux is
  the canonical State 2 machine.
- **What it installs:** nginx, Express API, git DB, file storage — all in Docker.
- **You control:** nginx config, ports, all files, any git remote.

See [../self-hosting.md](../self-hosting.md).
